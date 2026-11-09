"""NEWS pipeline (brief §4): fetch → validate timestamps → dedup (L1 URL, L2 fingerprint)
→ cluster into events (L3) → link to watchlist securities → persist, with run and source health."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from .sources import FetchFn, build_queries, fetch_google_news, scrapling_fetch
from .text import (
    canonical_url, fingerprint, headline_mentions, jaccard, name_variants, parse_published,
    strip_publisher_suffix, tokens,
)

SOURCE = {"id": "google-news-rss", "name": "Google News RSS", "type": "RSS",
          "url": "https://news.google.com/rss/search"}
DEDUP_WINDOW = timedelta(hours=72)
CLUSTER_MIN_JACCARD = 0.6   # conservative: avoid merging separate developments
CLUSTER_MIN_SHARED = 3      # shared meaningful words required as well


@dataclass
class Stats:
    status: str = "success"
    queries: int = 0
    failed_queries: int = 0
    items_seen: int = 0
    new_articles: int = 0
    duplicates_removed: int = 0
    already_stored: int = 0
    unmatched: int = 0
    new_events: int = 0
    security_links: int = 0
    flagged_timestamps: int = 0
    errors: list[str] = field(default_factory=list)


def run(store, fetch: FetchFn = scrapling_fetch, now: datetime | None = None, edition: str = "en-MY",
        pause_seconds: float = 1.5) -> Stats:
    now = now or datetime.now(timezone.utc)
    stats = Stats()
    store.upsert_source(SOURCE)
    run_id = store.start_run(SOURCE["id"], now)
    try:
        _collect(store, fetch, now, edition, pause_seconds, stats)
    except Exception as e:  # record the failure, keep the previous good data, then fail the job
        stats.status = "failed"
        stats.errors.append(type(e).__name__ + (f": {e}" if e.__class__.__name__ == "DbError" else ""))
        _finish(store, run_id, now, stats)
        raise
    _finish(store, run_id, now, stats)
    return stats


def _collect(store, fetch, now, edition, pause_seconds, stats: Stats) -> None:
    securities = store.load_watch_securities()
    for s in securities:
        s["names"] = name_variants(s["company"], s.get("aliases"))
    if not securities:
        return

    queries = build_queries(securities)
    stats.queries = len(queries)
    result = fetch_google_news(queries, edition=edition, fetch=fetch, pause_seconds=pause_seconds)
    stats.failed_queries = result.failed_queries
    stats.errors.extend(result.errors)
    stats.items_seen = len(result.items)
    if result.ok_queries == 0:
        stats.status = "failed"
        return
    if result.failed_queries:
        stats.status = "partial"

    recent = store.load_recent_articles(now - DEDUP_WINDOW)
    by_url = {a["canonical_url"]: a for a in recent}
    by_fp = {(a["title_fingerprint"], a["publisher"].lower()): a for a in recent}
    clusters = [(tokens(a["title"]), a["event_ids"]) for a in recent if a["event_ids"]]

    touch: set[str] = set()
    inserted: set[str] = set()
    links: dict[tuple[str, str], dict] = {}

    for item in result.items:
        publisher = item.publisher or urlsplit(item.url).netloc or "unknown"
        title = strip_publisher_suffix(item.title, item.publisher)
        url = canonical_url(item.url)
        fp = fingerprint(title)
        fp_key = (fp, publisher.lower())

        if url in by_url:                      # L1: same URL
            if by_url[url]["id"] in inserted:  # repeated within this fetch
                stats.duplicates_removed += 1
            else:                              # stored by an earlier run
                touch.add(by_url[url]["id"])
                stats.already_stored += 1
            continue
        if fp_key in by_fp:                    # L2: same headline from same publisher (repost/revision)
            if by_fp[fp_key]["id"] not in inserted:
                touch.add(by_fp[fp_key]["id"])
            stats.duplicates_removed += 1
            continue

        matches = []
        for s in securities:
            hit = next((n for n in s["names"] if headline_mentions(title, n)), None)
            if hit:
                matches.append((s, hit))
        if not matches:                        # search hit, but company not named in the headline
            stats.unmatched += 1
            continue

        published, verified, flag = parse_published(item.published, now)
        article_id, created = store.insert_article({
            "canonical_url": url, "title": title, "title_fingerprint": fp, "publisher": publisher,
            "source_id": SOURCE["id"], "published_at": published, "published_verified": verified,
            "timestamp_flag": flag, "first_seen_at": now, "last_seen_at": now,
        })
        if not created:
            # Stored before the 72 h window (Google News can resurface older items): just mark it seen.
            touch.add(article_id)
            stats.already_stored += 1
            by_url[url] = {"id": article_id, "canonical_url": url, "title": title, "title_fingerprint": fp,
                           "publisher": publisher, "event_ids": []}
            continue
        if flag:
            stats.flagged_timestamps += 1
        stats.new_articles += 1
        inserted.add(article_id)

        toks = tokens(title)
        event_id = _best_cluster(toks, clusters)
        if event_id is None:
            event_id = store.create_event(title, now)
            stats.new_events += 1
        store.link_event_article(event_id, article_id)

        record = {"id": article_id, "canonical_url": url, "title": title, "title_fingerprint": fp,
                  "publisher": publisher, "event_ids": [event_id]}
        by_url[url] = record
        by_fp[fp_key] = record
        clusters.append((toks, [event_id]))

        for s, hit in matches:
            is_alias = hit not in name_variants(s["company"], None)
            links.setdefault((s["id"], event_id), {
                "security_id": s["id"], "event_id": event_id, "type": "direct",
                "confidence": "medium" if is_alias else "high",
                "why": f"Named in a headline from {publisher}" + (f" (as “{hit}”)." if is_alias else "."),
                "evidence": [{"label": f"{publisher}: {title}", "url": item.url}],
            })

    store.touch_articles(touch, now)
    store.upsert_security_events(list(links.values()))
    stats.security_links = len(links)


def _best_cluster(toks: frozenset[str], clusters: list[tuple[frozenset[str], list[str]]]) -> str | None:
    best, best_score = None, 0.0
    for other, event_ids in clusters:
        if len(toks & other) < CLUSTER_MIN_SHARED:
            continue
        score = jaccard(toks, other)
        if score >= CLUSTER_MIN_JACCARD and score > best_score:
            best, best_score = event_ids[0], score
    return best


def _finish(store, run_id: int, now: datetime, stats: Stats) -> None:
    finished = datetime.now(timezone.utc) if now.tzinfo else now
    error = "; ".join(stats.errors)[:500] or None
    store.finish_run(run_id, status=stats.status, finished_at=max(finished, now),
                     new_articles=stats.new_articles, duplicates_removed=stats.duplicates_removed,
                     error=error)
    source = {**SOURCE}
    if stats.status in ("success", "partial"):
        # Only a successful fetch moves the freshness clock (brief: never mark a failed refresh current).
        source.update(status="ok" if stats.status == "success" else "degraded",
                      last_success_at=now.isoformat(), last_error=error)
    else:
        source.update(status="failing", last_error_at=now.isoformat(), last_error=error)
    store.upsert_source(source)


def summary(stats: Stats) -> dict:
    """Counts only. Logs are public in this repo, so no names, titles or queries."""
    return {k: v for k, v in asdict(stats).items()}
