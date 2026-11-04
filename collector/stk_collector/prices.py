"""PRICES pipeline (brief §4, §7): scheduled delayed quotes → normalise → persist.

Routing per listing: Twelve Data first (free plan, 800 credits/day, 8/min). If a listing is not on
the free plan, EODHD's free plan (20 calls/day) serves it once per day after the Bursa close.
Anything neither covers is marked unsupported and shown as "Price unavailable".
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, time as dtime, timedelta, timezone
from typing import Any, Callable

MYT = timezone(timedelta(hours=8))
TD_BASE = "https://api.twelvedata.com"
EODHD_BASE = "https://eodhd.com"
TD_NAME, EODHD_NAME = "Twelve Data", "EODHD"
TD_DAILY_CAP = 700          # of 800; leaves room for symbol searches from the app
TD_PER_MINUTE = 8
EODHD_DAILY_CAP = 18        # of 20; keeps a margin for the exchange-list lookup
EODHD_FROM_HOUR_MYT = 17    # once a day, after Bursa closes at 17:00
RECHECK_UNSUPPORTED = timedelta(days=7)

# Verified from EODHD's docs (US = XNAS/XNYS/OTCM/XCBO, LSE = XLON) and its KLSE listings.
EODHD_CODES = {"XNAS": "US", "XNYS": "US", "OTCM": "US", "XCBO": "US", "XLON": "LSE", "XKLS": "KLSE"}

HttpGet = Callable[[str, dict], tuple[int, Any]]


class ProviderError(Exception):
    def __init__(self, kind: str, detail: str = "", provider: str = ""):
        super().__init__(kind)
        self.kind = kind          # unsupported | rate_limited | auth | error
        self.detail = detail      # sanitised: status codes only
        self.provider = provider  # twelvedata | eodhd (set by the pipeline)


@dataclass
class Quote:
    value: float
    currency: str | None
    market_at: datetime


@dataclass
class PriceStats:
    status: str = "success"
    targets: int = 0
    saved: int = 0
    unsupported: int = 0
    skipped_waiting: int = 0
    errors_count: int = 0
    td_calls: int = 0
    eodhd_calls: int = 0
    td_saved: int = 0
    eodhd_saved: int = 0
    td_errors: int = 0
    eodhd_errors: int = 0
    td_used_today: int = 0
    eodhd_used_today: int = 0
    errors: list[str] = field(default_factory=list)


# --- adapters -----------------------------------------------------------------------------

def _error_code(status: int, body: Any) -> int | None:
    if isinstance(body, dict) and body.get("status") == "error":
        try:
            return int(body.get("code") or status)
        except (TypeError, ValueError):
            return status
    return status if status != 200 else None


def td_quote(get: HttpGet, key: str, symbol: str, mic: str) -> Quote:
    status, body = get(f"{TD_BASE}/quote", {"symbol": symbol, "mic_code": mic, "apikey": key})
    code = _error_code(status, body)
    if code == 429:
        raise ProviderError("rate_limited", "HTTP 429")
    if code == 401:
        raise ProviderError("auth", "HTTP 401")
    if code in (400, 403, 404):  # not on this plan, or unknown symbol for this provider
        raise ProviderError("unsupported", f"HTTP {code}")
    if code is not None:
        raise ProviderError("error", f"HTTP {code}")
    try:
        value = float(body["close"])
        ts = int(body.get("last_quote_at") or body["timestamp"])
    except (KeyError, TypeError, ValueError):
        raise ProviderError("error", "malformed quote") from None
    return Quote(value, (body.get("currency") or None), datetime.fromtimestamp(ts, tz=timezone.utc))


def eodhd_quote(get: HttpGet, key: str, ticker: str) -> Quote:
    status, body = get(f"{EODHD_BASE}/api/real-time/{ticker}", {"api_token": key, "fmt": "json"})
    if status in (402, 429):
        raise ProviderError("rate_limited", f"HTTP {status}")
    if status == 401:
        raise ProviderError("auth", "HTTP 401")
    if status in (403, 404):
        raise ProviderError("unsupported", f"HTTP {status}")
    if status != 200 or not isinstance(body, dict):
        raise ProviderError("error", f"HTTP {status}")
    try:
        value = float(body["close"])
        ts = int(body["timestamp"])
    except (KeyError, TypeError, ValueError):  # "NA" when there is no data
        raise ProviderError("unsupported", "no data") from None
    return Quote(value, None, datetime.fromtimestamp(ts, tz=timezone.utc))


def eodhd_exchange_codes(get: HttpGet, key: str) -> dict[str, str]:
    status, body = get(f"{EODHD_BASE}/api/exchanges-list/", {"api_token": key, "fmt": "json"})
    if status != 200 or not isinstance(body, list):
        raise ProviderError("error", f"exchange list HTTP {status}")
    codes: dict[str, str] = {}
    for ex in body:
        for mic in str(ex.get("OperatingMIC") or "").split(","):
            mic = mic.strip().upper()
            if mic and ex.get("Code"):
                codes.setdefault(mic, str(ex["Code"]))
    return codes


# --- pipeline -----------------------------------------------------------------------------

def run_prices(store, *, td_key: str | None, eodhd_key: str | None, get: HttpGet,
               now: datetime | None = None, sleep: Callable[[float], None] | None = None,
               force_eodhd: bool = False) -> PriceStats:
    now = now or datetime.now(timezone.utc)
    sleep = sleep or (lambda s: None)
    stats = PriceStats()
    today = now.astimezone(MYT).date().isoformat()
    midnight = datetime.combine(now.astimezone(MYT).date(), dtime(0), MYT)

    usage = store.get_cache("price_usage") or {}
    if usage.get("date") != today:
        usage = {"date": today, "twelvedata": 0, "eodhd": 0}

    targets = store.load_price_targets()
    stats.targets = len(targets)
    eodhd_window = force_eodhd or now.astimezone(MYT).hour >= EODHD_FROM_HOUR_MYT
    eodhd_done_today = store.priced_since(EODHD_NAME, midnight) if eodhd_key else set()
    td_blocked = False
    eodhd_blocked = False
    td_last_call: list[float] = []  # call times (seconds since start) for per-minute pacing
    clock = [0.0]

    def td(symbol: str, mic: str) -> Quote:
        # Twelve Data allows 8 calls per minute; wait if the last 8 calls fell inside 60 s.
        if len(td_last_call) >= TD_PER_MINUTE and clock[0] - td_last_call[-TD_PER_MINUTE] < 60:
            wait = 60 - (clock[0] - td_last_call[-TD_PER_MINUTE]) + 1
            sleep(wait)
            clock[0] += wait
        td_last_call.append(clock[0])
        usage["twelvedata"] += 1
        stats.td_calls += 1
        try:
            return td_quote(get, td_key or "", symbol, mic)
        except ProviderError as e:
            e.provider = "twelvedata"
            raise

    codes_cache: dict[str, str] | None = None

    def eodhd_ticker(symbol: str, mic: str) -> str | None:
        nonlocal codes_cache
        code = EODHD_CODES.get(mic)
        if code is None:
            if codes_cache is None:
                cached = store.get_cache("eodhd_exchange_codes") or {}
                fresh = cached.get("fetched") and (now - datetime.fromisoformat(cached["fetched"])) < timedelta(days=30)
                if fresh:
                    codes_cache = cached.get("codes", {})
                elif usage["eodhd"] < EODHD_DAILY_CAP:
                    usage["eodhd"] += 1
                    stats.eodhd_calls += 1
                    try:
                        codes_cache = eodhd_exchange_codes(get, eodhd_key or "")
                    except ProviderError as e:
                        e.provider = "eodhd"
                        raise
                    store.set_cache("eodhd_exchange_codes", {"fetched": now.isoformat(), "codes": codes_cache})
                else:
                    codes_cache = {}
            code = codes_cache.get(mic)
        return f"{symbol}.{code}" if code else None

    def eodhd(symbol: str, mic: str) -> Quote:
        ticker = eodhd_ticker(symbol, mic)
        if not ticker:
            raise ProviderError("unsupported", "exchange not on EODHD")
        usage["eodhd"] += 1
        stats.eodhd_calls += 1
        try:
            return eodhd_quote(get, eodhd_key or "", ticker)
        except ProviderError as e:
            e.provider = "eodhd"
            raise

    def eodhd_available(sec_id: str) -> bool:
        return (not eodhd_blocked and eodhd_window and sec_id not in eodhd_done_today
                and usage["eodhd"] < EODHD_DAILY_CAP)

    def save(sec: dict, q: Quote, provider_name: str, route: str) -> None:
        store.insert_snapshot({
            "security_id": sec["id"], "value": q.value, "currency": (q.currency or sec["currency"]).upper()[:3],
            "market_at": q.market_at.isoformat(), "ingested_at": now.isoformat(),
            "provider": provider_name, "is_delayed": True,
        })
        store.update_security(sec["id"], {"price_provider": route, "price_status": "ok",
                                          "price_checked_at": now.isoformat()})
        stats.saved += 1
        if route == "twelvedata":
            stats.td_saved += 1
        else:
            stats.eodhd_saved += 1

    def mark(sec: dict, route: str | None, status: str) -> None:
        store.update_security(sec["id"], {"price_provider": route, "price_status": status,
                                          "price_checked_at": now.isoformat()})

    for sec in sorted(targets, key=lambda s: s["id"]):
        route = sec.get("price_provider")
        symbol, mic = sec["symbol"], sec["exchange_mic"]
        td_symbol = ((sec.get("source_ids") or {}).get("twelvedata") or {}).get("symbol") or symbol
        checked = sec.get("price_checked_at")
        if route == "none" and checked and now - datetime.fromisoformat(checked) < RECHECK_UNSUPPORTED:
            stats.unsupported += 1
            continue

        try:
            # 1) Twelve Data for new listings, known Twelve Data listings, and weekly re-checks.
            td_said_unsupported = False
            if route in (None, "none", "twelvedata"):
                if td_key and not td_blocked and usage["twelvedata"] < TD_DAILY_CAP:
                    try:
                        save(sec, td(td_symbol, mic), TD_NAME, "twelvedata")
                        continue
                    except ProviderError as e:
                        if e.kind != "unsupported":
                            raise
                        td_said_unsupported = True
                elif td_key:
                    stats.skipped_waiting += 1  # Twelve Data paused this run; try again next run
                    continue

            # 2) EODHD for listings Twelve Data's free plan does not cover (or when no Twelve Data key).
            if route == "eodhd" or td_said_unsupported or not td_key:
                if not eodhd_key:  # no fallback provider configured
                    mark(sec, "none", "unsupported")
                    stats.unsupported += 1
                    continue
                if eodhd_blocked:  # EODHD refused earlier in this run; try again next run
                    stats.skipped_waiting += 1
                    continue
                if eodhd_available(sec["id"]):
                    try:
                        save(sec, eodhd(symbol, mic), EODHD_NAME, "eodhd")
                    except ProviderError as e:
                        if e.kind != "unsupported":
                            raise
                        mark(sec, "none", "unsupported")
                        stats.unsupported += 1
                else:
                    if route != "eodhd":
                        store.update_security(sec["id"], {"price_provider": "eodhd", "price_checked_at": now.isoformat()})
                    stats.skipped_waiting += 1  # EODHD serves once a day after 17:00 MYT
        except ProviderError as e:
            stats.errors_count += 1
            stats.errors.append(f"{e.provider or 'provider'} {e.kind}: {e.detail}")
            if e.provider == "eodhd":
                stats.eodhd_errors += 1
            else:
                stats.td_errors += 1
            if e.kind in ("rate_limited", "auth"):
                # Stop calling the provider that refused us for the rest of this run.
                if e.provider == "eodhd":
                    eodhd_blocked = True
                else:
                    td_blocked = True
            else:
                store.update_security(sec["id"], {"price_status": "error", "price_checked_at": now.isoformat()})

    store.set_cache("price_usage", usage)
    stats.td_used_today, stats.eodhd_used_today = usage["twelvedata"], usage["eodhd"]
    if stats.errors_count and stats.saved == 0 and stats.targets:
        stats.status = "failed"
    elif stats.errors_count:
        stats.status = "partial"
    stats.errors = sorted(set(stats.errors))[:10]
    return stats


def summary(stats: PriceStats) -> dict:
    """Counts only (logs are public)."""
    return asdict(stats)


SOURCES = {
    "twelvedata": {"id": "twelvedata-prices", "name": "Twelve Data prices", "type": "API",
                   "url": TD_BASE, "quota_cap": 800},
    "eodhd": {"id": "eodhd-prices", "name": "EODHD prices (fallback)", "type": "API",
              "url": EODHD_BASE, "quota_cap": 20},
}


def record_health(store, stats: PriceStats, now: datetime, *, td_key: bool, eodhd_key: bool) -> None:
    """One run row per provider called, and source health. Never advances last_success_at on failure."""
    for name, configured, calls, saved, errors, used in (
        ("twelvedata", td_key, stats.td_calls, stats.td_saved, stats.td_errors, stats.td_used_today),
        ("eodhd", eodhd_key, stats.eodhd_calls, stats.eodhd_saved, stats.eodhd_errors, stats.eodhd_used_today),
    ):
        src = dict(SOURCES[name], quota_used=used)
        if not configured:
            store.upsert_source(dict(src, status="failing", last_error="API key not configured"))
            continue
        if calls == 0:
            store.upsert_source(src)  # not due this run (e.g. EODHD before 17:00 MYT)
            continue
        status = "success" if errors == 0 else ("partial" if saved else "failed")
        run_id = store.start_run(src["id"], now)
        store.finish_run(run_id, status=status, finished_at=datetime.now(timezone.utc),
                         new_articles=saved, duplicates_removed=0,
                         error=None if not errors else "; ".join(e for e in stats.errors if e.startswith(name))[:500] or None)
        if saved or errors == 0:
            store.upsert_source(dict(src, status="ok" if errors == 0 else "degraded",
                                     last_success_at=now.isoformat(), last_error=None if errors == 0 else f"{errors} errors"))
        else:
            store.upsert_source(dict(src, status="failing", last_error_at=now.isoformat(), last_error=f"{errors} errors"))
