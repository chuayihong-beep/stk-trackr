import json
import time
import unittest
from datetime import datetime, timedelta, timezone

from stk_collector import pipeline
from stk_collector.sources import build_queries, edition_params
from stk_collector.text import (
    canonical_url, fingerprint, headline_mentions, name_variants, parse_published, strip_publisher_suffix,
)

NOW = datetime(2026, 11, 3, 14, 0, tzinfo=timezone.utc)


def rss(items):
    body = "".join(
        f"<item><title>{t}</title><link>{link}</link>"
        + (f"<pubDate>{pub}</pubDate>" if pub else "")
        + f'<source url="https://x.test">{src}</source></item>'
        for t, link, pub, src in items
    )
    return f'<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>{body}</channel></rss>'.encode()


class FakeStore:
    def __init__(self, securities, articles=None):
        self.securities = securities
        self.articles = articles or []
        self.events, self.event_articles, self.security_events = [], set(), {}
        self.runs, self.sources, self.touched = {}, {}, set()

    def load_watch_securities(self):
        return [dict(s) for s in self.securities]

    def load_recent_articles(self, since):
        out = []
        for a in self.articles:
            if a["first_seen_at"] >= since:
                ev = [e for (e, art) in self.event_articles if art == a["id"]]
                out.append({k: a[k] for k in ("id", "canonical_url", "title", "title_fingerprint", "publisher")} | {"event_ids": ev})
        return out

    def upsert_source(self, row):
        self.sources[row["id"]] = {**self.sources.get(row["id"], {}), **row}

    def start_run(self, source_id, now):
        rid = len(self.runs) + 1
        self.runs[rid] = {"status": "running"}
        return rid

    def finish_run(self, run_id, **f):
        self.runs[run_id].update(f)

    def insert_article(self, row):
        assert row["canonical_url"] not in {a["canonical_url"] for a in self.articles}, "L1 unique violated"
        row = {**row, "id": f"a{len(self.articles) + 1}"}
        self.articles.append(row)
        return row["id"]

    def touch_articles(self, ids, now):
        self.touched |= set(ids)

    def create_event(self, title, now):
        eid = f"e{len(self.events) + 1}"
        self.events.append({"id": eid, "title": title})
        return eid

    def link_event_article(self, event_id, article_id):
        self.event_articles.add((event_id, article_id))

    def upsert_security_events(self, rows):
        for r in rows:
            assert r["type"] == "direct" and r["why"]
            self.security_events.setdefault((r["security_id"], r["event_id"]), r)


MAYBANK = {"id": "s1", "company": "Malayan Banking Berhad", "aliases": ["Maybank"]}
KHE = {"id": "s2", "company": "Kestrel Heavy Equipment Co", "aliases": []}


class TextTests(unittest.TestCase):
    def test_canonical_url_strips_tracking(self):
        self.assertEqual(
            canonical_url("HTTPS://News.Example.com/a/b/?utm_source=x&id=2&fbclid=z&a=1#frag"),
            "https://news.example.com/a/b?a=1&id=2",
        )
        self.assertEqual(canonical_url("https://news.google.com/rss/articles/CBMi?oc=5"),
                         "https://news.google.com/rss/articles/CBMi")

    def test_publisher_suffix_and_fingerprint(self):
        t = strip_publisher_suffix("Maybank posts record profit - The Star", "The Star")
        self.assertEqual(t, "Maybank posts record profit")
        self.assertEqual(fingerprint("Maybank’s Q3: record PROFIT!"), fingerprint("maybank s q3 record profit"))

    def test_name_variants_drop_legal_suffix_and_keep_aliases(self):
        self.assertEqual(name_variants("Malayan Banking Berhad", ["Maybank", "maybank", "MB"]),
                         ["Malayan Banking Berhad", "Malayan Banking", "Maybank"])
        self.assertEqual(name_variants("Kestrel Heavy Equipment Co", None),
                         ["Kestrel Heavy Equipment Co", "Kestrel Heavy Equipment"])

    def test_headline_matching_is_whole_word(self):
        self.assertTrue(headline_mentions("Maybank posts profit", "Maybank"))
        self.assertTrue(headline_mentions("MAYBANK's profit", "Maybank"))
        self.assertFalse(headline_mentions("Maybankers rally", "Maybank"))

    def test_timestamp_flags(self):
        ok = time.gmtime((NOW - timedelta(hours=1)).timestamp())
        future = time.gmtime((NOW + timedelta(days=2)).timestamp())
        self.assertEqual(parse_published(None, NOW), (None, False, "missing"))
        self.assertEqual(parse_published(ok, NOW)[1:], (True, None))
        self.assertEqual(parse_published(future, NOW)[1:], (False, "future"))

    def test_queries_pool_and_never_use_tickers(self):
        secs = [dict(MAYBANK, symbol="1155"), dict(KHE, symbol="KHE")]
        qs = build_queries(secs)
        self.assertEqual(len(qs), 1)
        self.assertIn('"Maybank"', qs[0])
        self.assertNotIn("1155", qs[0])
        self.assertTrue(qs[0].endswith("when:2d"))
        many = [{"id": str(i), "company": f"Company Number {i} Holdings Berhad"} for i in range(30)]
        self.assertTrue(all(len(q) <= 240 for q in build_queries(many)))
        self.assertEqual(edition_params("en-MY"), "hl=en-MY&gl=MY&ceid=MY:en")


class PipelineTests(unittest.TestCase):
    def feed(self, *items, status=200):
        body = rss(items)
        return lambda url: (status, body)

    def test_end_to_end_dedup_cluster_link(self):
        pub = "Tue, 03 Nov 2026 12:00:00 GMT"
        fetch = self.feed(
            ("Maybank posts record quarterly profit - The Star", "https://news.google.com/rss/articles/A?oc=5", pub, "The Star"),
            # L1 duplicate: same article URL with a tracking param
            ("Maybank posts record quarterly profit - The Star", "https://news.google.com/rss/articles/A?oc=7", pub, "The Star"),
            # L2 duplicate: same headline + publisher, different URL (repost)
            ("Maybank posts record quarterly profit! - The Star", "https://news.google.com/rss/articles/A2", pub, "The Star"),
            # Same event, different outlet → clusters with the first
            ("Maybank posts record quarterly profit on loan growth - The Edge", "https://news.google.com/rss/articles/B", pub, "The Edge"),
            # Different development about the same company → separate event
            ("Maybank names new chief risk officer - Bernama", "https://news.google.com/rss/articles/C", None, "Bernama"),
            # Not named in headline → skipped
            ("Bank stocks rise in Kuala Lumpur - Reuters", "https://news.google.com/rss/articles/D", pub, "Reuters"),
            # Full legal short name → high confidence, other company
            ("Kestrel Heavy Equipment wins mining order - Mining Weekly", "https://news.google.com/rss/articles/E", pub, "Mining Weekly"),
        )
        store = FakeStore([MAYBANK, KHE])
        stats = pipeline.run(store, fetch=fetch, now=NOW, pause_seconds=0)

        self.assertEqual(stats.status, "success")
        self.assertEqual(stats.new_articles, 4)
        self.assertEqual(stats.duplicates_removed, 2)   # in-batch URL repeat + L2 repost
        self.assertEqual(stats.unmatched, 1)
        self.assertEqual(stats.new_events, 3)           # profit (2 outlets), CRO, Kestrel
        self.assertEqual(stats.flagged_timestamps, 1)   # Bernama item had no pubDate
        bernama = next(a for a in store.articles if a["publisher"] == "Bernama")
        self.assertEqual((bernama["published_at"], bernama["published_verified"], bernama["timestamp_flag"]),
                         (None, False, "missing"))
        self.assertEqual(bernama["first_seen_at"], NOW)  # discovery time kept separately
        profit_event = next(e for (e, a) in store.event_articles if a == "a1")
        self.assertIn((profit_event, "a2"), store.event_articles)
        links = store.security_events
        self.assertEqual(links[("s1", profit_event)]["confidence"], "medium")  # matched via alias "Maybank"
        k = next(v for (s, _), v in links.items() if s == "s2")
        self.assertEqual(k["confidence"], "high")
        self.assertEqual(store.runs[1]["status"], "success")
        self.assertEqual(store.sources["google-news-rss"]["status"], "ok")
        self.assertEqual(store.sources["google-news-rss"]["last_success_at"], NOW.isoformat())

        # Second run with the same feed: nothing new, existing rows get last_seen bumped (idempotent).
        stats2 = pipeline.run(store, fetch=fetch, now=NOW + timedelta(minutes=10), pause_seconds=0)
        self.assertEqual((stats2.new_articles, stats2.new_events), (0, 0))
        self.assertEqual(len(store.articles), 4)
        self.assertTrue({"a1", "a2", "a3", "a4"} <= store.touched)

    def test_total_fetch_failure_keeps_previous_success_time(self):
        store = FakeStore([MAYBANK])
        store.sources["google-news-rss"] = {"id": "google-news-rss", "last_success_at": "earlier"}
        stats = pipeline.run(store, fetch=self.feed(status=503), now=NOW, pause_seconds=0)
        self.assertEqual(stats.status, "failed")
        src = store.sources["google-news-rss"]
        self.assertEqual((src["status"], src["last_success_at"]), ("failing", "earlier"))
        self.assertIn("HTTP 503", src["last_error"])

    def test_partial_failure_is_degraded(self):
        calls = {"n": 0}

        def flaky(url):
            calls["n"] += 1
            if calls["n"] == 1:
                raise ConnectionError("boom")
            return 200, rss([])
        many = [{"id": str(i), "company": f"Company Number {i} Holdings Berhad"} for i in range(30)]
        stats = pipeline.run(FakeStore(many), fetch=flaky, now=NOW, pause_seconds=0)
        self.assertEqual(stats.status, "partial")

    def test_empty_watchlist_is_a_clean_noop(self):
        store = FakeStore([])
        stats = pipeline.run(store, fetch=lambda u: self.fail("should not fetch"), now=NOW, pause_seconds=0)
        self.assertEqual((stats.status, stats.queries), ("success", 0))

    def test_summary_contains_no_names_or_titles(self):
        fetch = self.feed(("Maybank posts record quarterly profit - The Star", "https://news.google.com/rss/articles/A", None, "The Star"))
        stats = pipeline.run(FakeStore([MAYBANK]), fetch=fetch, now=NOW, pause_seconds=0)
        out = json.dumps(pipeline.summary(stats)).lower()
        for secret in ("maybank", "malayan", "the star", "profit", "news.google"):
            self.assertNotIn(secret, out)


if __name__ == "__main__":
    unittest.main()
