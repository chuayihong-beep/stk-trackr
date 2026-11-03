"""Google News RSS adapter. Fetches with Scrapling's plain HTTP Fetcher (no stealth, honest UA)."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Callable
from urllib.parse import quote_plus

import feedparser

from .text import name_variants

USER_AGENT = "stk-trackr-collector/0.1 (+https://github.com/chuayihong-beep/stk-trackr)"
FetchFn = Callable[[str], tuple[int, bytes]]


@dataclass
class FeedItem:
    url: str
    title: str
    publisher: str | None
    published: time.struct_time | None


@dataclass
class FetchResult:
    items: list[FeedItem] = field(default_factory=list)
    ok_queries: int = 0
    failed_queries: int = 0
    errors: list[str] = field(default_factory=list)  # sanitised: never contains query text


def silence_scrapling() -> None:
    """Scrapling logs every fetched URL at INFO, and its import resets the level to INFO.
    URLs contain watchlist names and Actions logs are public, so call this AFTER importing it."""
    lg = logging.getLogger("scrapling")
    lg.setLevel(logging.CRITICAL + 1)
    lg.disabled = True
    lg.propagate = False


def scrapling_fetch(url: str) -> tuple[int, bytes]:
    from scrapling.fetchers import Fetcher  # imported lazily so tests need no network stack

    silence_scrapling()

    resp = Fetcher.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/xml;q=0.9"},
        stealthy_headers=False,
        impersonate=None,
        retries=3,
        retry_delay=2,
        timeout=20,
    )
    return int(resp.status), bytes(resp.body)


def build_queries(securities: list[dict], max_len: int = 240, window: str = "when:2d") -> list[str]:
    """Pool several securities into one search so 30 stocks do not mean 30 crawlers (brief §6)."""
    groups = []
    for s in securities:
        names = name_variants(s["company"], s.get("aliases"))
        groups.append("(" + " OR ".join(f'"{n}"' for n in names) + ")")
    queries, current = [], ""
    for g in groups:
        candidate = f"{current} OR {g}" if current else g
        if current and len(candidate) + len(window) + 1 > max_len:
            queries.append(f"{current} {window}")
            current = g
        else:
            current = candidate
    if current:
        queries.append(f"{current} {window}")
    return queries


def edition_params(edition: str) -> str:
    lang, _, country = edition.partition("-")
    country = (country or "US").upper()
    return f"hl={lang}-{country}&gl={country}&ceid={country}:{lang}"


def fetch_google_news(queries: list[str], edition: str = "en-MY", fetch: FetchFn = scrapling_fetch,
                      pause_seconds: float = 1.5) -> FetchResult:
    result = FetchResult()
    for i, q in enumerate(queries):
        if i and pause_seconds:
            time.sleep(pause_seconds)  # stay polite between requests
        url = f"https://news.google.com/rss/search?q={quote_plus(q)}&{edition_params(edition)}"
        try:
            status, body = fetch(url)
        except Exception as e:  # noqa: BLE001 - one failing query must not stop the run
            result.failed_queries += 1
            result.errors.append(f"query {i + 1}: {type(e).__name__}")
            continue
        if status != 200:
            result.failed_queries += 1
            result.errors.append(f"query {i + 1}: HTTP {status}")
            continue
        feed = feedparser.parse(body)
        if feed.bozo and not feed.entries:
            result.failed_queries += 1
            result.errors.append(f"query {i + 1}: unparseable feed")
            continue
        result.ok_queries += 1
        for e in feed.entries:
            link, title = e.get("link"), e.get("title")
            if not link or not title:
                continue
            source = e.get("source") or {}
            result.items.append(FeedItem(
                url=link,
                title=title,
                publisher=(source.get("title") or "").strip() or None,
                published=e.get("published_parsed") or e.get("updated_parsed"),
            ))
    return result
