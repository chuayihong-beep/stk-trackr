"""Entry point: python -m stk_collector"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

from .db import SupabaseStore, http_get_json
from .pipeline import run, summary
from .prices import record_health, run_prices
from .prices import summary as price_summary
from .sources import silence_scrapling

DEFAULT_URL = "https://vewqmxhweysgtkieahij.supabase.co"


def main() -> int:
    # Scrapling logs every fetched URL (containing watchlist names) and resets its level on import,
    # so import it first, then silence it. Actions logs are public in this repo.
    import scrapling.fetchers  # noqa: F401

    silence_scrapling()
    logging.getLogger("httpx").setLevel(logging.WARNING)

    key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if not key:
        print("SUPABASE_SECRET_KEY is not set. Add it as a GitHub Actions secret.", file=sys.stderr)
        return 2
    store = SupabaseStore(os.environ.get("SUPABASE_URL", DEFAULT_URL), key)
    if len(sys.argv) > 1 and sys.argv[1] == "prices":
        return run_prices_job(store)
    try:
        stats = run(store, edition=os.environ.get("NEWS_EDITION", "en-MY"))
    except Exception as e:  # already recorded in collector_runs
        print(json.dumps({"status": "failed", "error": type(e).__name__}))
        return 1
    print(json.dumps(summary(stats)))
    return 1 if stats.status == "failed" else 0


def run_prices_job(store) -> int:
    td_key = os.environ.get("TWELVE_DATA_API_KEY", "").strip() or None
    eodhd_key = os.environ.get("EODHD_API_KEY", "").strip() or None
    if not td_key and not eodhd_key:
        print("No price provider key set (TWELVE_DATA_API_KEY / EODHD_API_KEY).", file=sys.stderr)
        return 2
    now = datetime.now(timezone.utc)
    try:
        stats = run_prices(store, td_key=td_key, eodhd_key=eodhd_key, get=http_get_json, now=now,
                           sleep=time.sleep, force_eodhd=os.environ.get("FORCE_EODHD") == "true")
        record_health(store, stats, now, td_key=bool(td_key), eodhd_key=bool(eodhd_key))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"status": "failed", "error": type(e).__name__}))
        return 1
    print(json.dumps(price_summary(stats)))
    return 1 if stats.status == "failed" else 0


if __name__ == "__main__":
    sys.exit(main())
