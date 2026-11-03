"""Entry point: python -m stk_collector"""
from __future__ import annotations

import json
import logging
import os
import sys

from .db import SupabaseStore
from .pipeline import run, summary
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
    try:
        stats = run(store, edition=os.environ.get("NEWS_EDITION", "en-MY"))
    except Exception as e:  # already recorded in collector_runs
        print(json.dumps({"status": "failed", "error": type(e).__name__}))
        return 1
    print(json.dumps(summary(stats)))
    return 1 if stats.status == "failed" else 0


if __name__ == "__main__":
    sys.exit(main())
