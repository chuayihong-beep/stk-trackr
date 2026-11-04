import json
import unittest
from datetime import datetime, timedelta, timezone

from stk_collector.prices import EODHD_DAILY_CAP, record_health, run_prices, summary

MYT = timezone(timedelta(hours=8))
MORNING = datetime(2026, 11, 4, 11, 15, tzinfo=MYT).astimezone(timezone.utc)
EVENING = datetime(2026, 11, 4, 17, 15, tzinfo=MYT).astimezone(timezone.utc)


def sec(i, symbol, mic, currency="USD", **kw):
    return {"id": f"s{i:02d}", "symbol": symbol, "exchange_mic": mic, "currency": currency, "source_ids": {},
            "price_provider": None, "price_status": None, "price_checked_at": None, **kw}


class FakeStore:
    def __init__(self, targets):
        self.targets = {t["id"]: dict(t) for t in targets}
        self.snapshots, self.cache, self.sources, self.runs = [], {}, {}, []

    def load_price_targets(self):
        return [dict(t) for t in self.targets.values()]

    def priced_since(self, provider, since):
        return {s["security_id"] for s in self.snapshots if s["provider"] == provider and s["ingested_at"] >= since.isoformat()}

    def insert_snapshot(self, row):
        self.snapshots.append(row)

    def update_security(self, sid, fields):
        self.targets[sid].update(fields)

    def get_cache(self, key):
        return self.cache.get(key)

    def set_cache(self, key, value):
        self.cache[key] = json.loads(json.dumps(value))

    def upsert_source(self, row):
        self.sources[row["id"]] = {**self.sources.get(row["id"], {}), **row}

    def start_run(self, source_id, now):
        self.runs.append({"source_id": source_id})
        return len(self.runs)

    def finish_run(self, run_id, **f):
        self.runs[run_id - 1].update(f)


class FakeProviders:
    """Twelve Data covers US listings; Bursa needs a paid plan there. EODHD covers KLSE and US."""

    def __init__(self, td_limit_after=None):
        self.calls = []
        self.td_limit_after = td_limit_after

    def __call__(self, url, params):
        self.calls.append((url, dict(params)))
        if "twelvedata" in url:
            n = sum(1 for u, _ in self.calls if "twelvedata" in u)
            if self.td_limit_after is not None and n > self.td_limit_after:
                return 429, {"status": "error", "code": 429, "message": "limit"}
            if params["mic_code"] in ("XNAS", "XNYS"):
                return 200, {"symbol": params["symbol"], "close": "101.25", "currency": "USD",
                             "last_quote_at": 1793750400, "timestamp": 1793736000, "is_market_open": False}
            if params["mic_code"] == "XKLS":  # documented style: HTTP 200 with an error body
                return 200, {"status": "error", "code": 403, "message": "available on Pro plan"}
            return 200, {"status": "error", "code": 404, "message": "symbol not found"}
        if "exchanges-list" in url:
            return 200, [{"Code": "TO", "OperatingMIC": "XTSE"}, {"Code": "US", "OperatingMIC": "XNAS, XNYS"}]
        if "/api/real-time/" in url:
            ticker = url.rsplit("/", 1)[1]
            if ticker.endswith((".KLSE", ".US", ".TO")):
                return 200, {"code": ticker, "timestamp": 1793782800, "close": 10.42, "previousClose": 10.3}
            return 404, None
        raise AssertionError(url)


def eodhd_calls(p):
    return [u for u, _ in p.calls if "eodhd" in u]


class PriceTests(unittest.TestCase):
    def test_routing_morning_then_evening(self):
        store = FakeStore([sec(1, "AAPL", "XNAS"), sec(2, "1155", "XKLS", "MYR")])
        p = FakeProviders()
        s1 = run_prices(store, td_key="td-key", eodhd_key="eo-key", get=p, now=MORNING)
        self.assertEqual((s1.saved, s1.skipped_waiting, s1.status), (1, 1, "success"))
        self.assertEqual(eodhd_calls(p), [], "EODHD must wait until after 17:00 MYT")
        self.assertEqual(store.targets["s02"]["price_provider"], "eodhd")
        aapl = store.snapshots[0]
        self.assertEqual((aapl["provider"], aapl["value"], aapl["currency"], aapl["is_delayed"]), ("Twelve Data", 101.25, "USD", True))
        self.assertEqual(aapl["market_at"], datetime.fromtimestamp(1793750400, tz=timezone.utc).isoformat())

        p2 = FakeProviders()
        s2 = run_prices(store, td_key="td-key", eodhd_key="eo-key", get=p2, now=EVENING)
        self.assertEqual(s2.saved, 2)
        self.assertEqual(eodhd_calls(p2), ["https://eodhd.com/api/real-time/1155.KLSE"])
        self.assertFalse(any(c[1].get("mic_code") == "XKLS" for c in p2.calls), "known EODHD route skips Twelve Data")
        bursa = store.snapshots[-1]
        self.assertEqual((bursa["provider"], bursa["currency"]), ("EODHD", "MYR"))

        # A second evening run the same day must not spend another EODHD call on the same stock.
        p3 = FakeProviders()
        run_prices(store, td_key="td-key", eodhd_key="eo-key", get=p3, now=EVENING + timedelta(minutes=30))
        self.assertEqual(eodhd_calls(p3), [])

    def test_unsupported_everywhere_is_marked_and_not_retried_for_a_week(self):
        store = FakeStore([sec(1, "ZZZ", "XPAR", "EUR")])
        p = FakeProviders()
        s = run_prices(store, td_key="td-key", eodhd_key="eo-key", get=p, now=EVENING)
        self.assertEqual((s.unsupported, store.targets["s01"]["price_status"]), (1, "unsupported"))
        self.assertEqual(store.targets["s01"]["price_provider"], "none")
        p2 = FakeProviders()
        run_prices(store, td_key="td-key", eodhd_key="eo-key", get=p2, now=EVENING + timedelta(days=1))
        self.assertEqual(p2.calls, [])
        p3 = FakeProviders()
        run_prices(store, td_key="td-key", eodhd_key="eo-key", get=p3, now=EVENING + timedelta(days=8))
        self.assertTrue(p3.calls, "re-checked after a week in case coverage changed")

    def test_unknown_exchange_uses_cached_eodhd_exchange_list(self):
        store = FakeStore([sec(1, "SHOP", "XTSE", "CAD"), sec(2, "RY", "XTSE", "CAD")])
        p = FakeProviders()
        s = run_prices(store, td_key="td-key", eodhd_key="eo-key", get=p, now=EVENING)
        self.assertEqual(s.saved, 2)
        self.assertEqual(sum("exchanges-list" in u for u, _ in p.calls), 1)
        self.assertIn("https://eodhd.com/api/real-time/SHOP.TO", eodhd_calls(p))
        self.assertEqual(store.cache["eodhd_exchange_codes"]["codes"]["XTSE"], "TO")
        self.assertEqual(store.cache["price_usage"]["eodhd"], 3)  # list + 2 quotes

    def test_eodhd_daily_cap_counts_all_calls(self):
        store = FakeStore([sec(i, str(1000 + i), "XKLS", "MYR") for i in range(25)])
        p = FakeProviders()
        run_prices(store, td_key="td-key", eodhd_key="eo-key", get=p, now=EVENING)
        self.assertEqual(len(eodhd_calls(p)), EODHD_DAILY_CAP)
        self.assertEqual(store.cache["price_usage"]["eodhd"], EODHD_DAILY_CAP)

    def test_rate_limit_pauses_twelve_data_without_rerouting(self):
        store = FakeStore([sec(i, f"T{i}", "XNYS") for i in range(5)])
        p = FakeProviders(td_limit_after=2)
        s = run_prices(store, td_key="td-key", eodhd_key="eo-key", get=p, now=EVENING)
        self.assertEqual((s.saved, s.status), (2, "partial"))
        self.assertEqual(sum("twelvedata" in u for u, _ in p.calls), 3, "stops after the first 429")
        self.assertEqual(eodhd_calls(p), [], "rate-limited stocks are not pushed onto EODHD")
        self.assertTrue(all(t["price_provider"] in (None, "twelvedata") for t in store.targets.values()))

    def test_twelve_data_pacing_stays_under_8_per_minute(self):
        store = FakeStore([sec(i, f"T{i}", "XNAS") for i in range(17)])
        waits = []
        s = run_prices(store, td_key="td-key", eodhd_key=None, get=FakeProviders(), now=MORNING, sleep=waits.append)
        self.assertEqual(s.saved, 17)
        self.assertEqual(len(waits), 2)  # after call 8 and call 16
        self.assertTrue(all(55 <= w <= 61 for w in waits), waits)

    def test_no_eodhd_key_marks_bursa_unsupported(self):
        store = FakeStore([sec(1, "1155", "XKLS", "MYR")])
        s = run_prices(store, td_key="td-key", eodhd_key=None, get=FakeProviders(), now=MORNING)
        self.assertEqual((s.unsupported, store.targets["s01"]["price_status"]), (1, "unsupported"))

    def test_health_rows_and_no_secrets_in_summary(self):
        store = FakeStore([sec(1, "AAPL", "XNAS"), sec(2, "1155", "XKLS", "MYR")])
        s = run_prices(store, td_key="td-key", eodhd_key="eo-key", get=FakeProviders(), now=MORNING)
        record_health(store, s, MORNING, td_key=True, eodhd_key=True)
        self.assertEqual([r["source_id"] for r in store.runs], ["twelvedata-prices"])  # EODHD not due yet
        self.assertEqual(store.sources["twelvedata-prices"]["status"], "ok")
        self.assertEqual(store.sources["twelvedata-prices"]["quota_used"], 2)
        self.assertNotIn("last_success_at", store.sources["eodhd-prices"])
        out = json.dumps(summary(s))
        for secret in ("td-key", "eo-key", "AAPL", "1155"):
            self.assertNotIn(secret, out)


if __name__ == "__main__":
    unittest.main()
