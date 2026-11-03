"""Supabase (PostgREST) access for the collector. Uses the secret key, server-side only."""
from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx


class DbError(RuntimeError):
    """Raised with a sanitised message (status and error code only, no row values)."""


class SupabaseStore:
    def __init__(self, url: str, key: str, timeout: float = 20.0):
        headers = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):  # legacy JWT service_role key
            headers["Authorization"] = f"Bearer {key}"
        self.http = httpx.Client(base_url=f"{url.rstrip('/')}/rest/v1", headers=headers, timeout=timeout)

    # -- low level -----------------------------------------------------------------
    def _req(self, method: str, path: str, *, params=None, json=None, prefer: str | None = None) -> Any:
        headers = {"Prefer": prefer} if prefer else {}
        r = self.http.request(method, path, params=params, json=json, headers=headers)
        if r.status_code >= 400:
            code = ""
            try:
                code = r.json().get("code", "")
            except ValueError:
                pass
            raise DbError(f"{method} {path.split('?')[0]} failed: HTTP {r.status_code} {code}".strip())
        return r.json() if r.content else None

    # -- reads ---------------------------------------------------------------------
    def load_watch_securities(self) -> list[dict]:
        rows = self._req("GET", "/watchlist", params={
            "select": "securities(id,company,aliases)", "active": "eq.true",
        })
        return [r["securities"] for r in rows or [] if r.get("securities")]

    def load_recent_articles(self, since: datetime) -> list[dict]:
        rows = self._req("GET", "/articles", params={
            "select": "id,canonical_url,title,title_fingerprint,publisher,event_articles(event_id)",
            "first_seen_at": f"gte.{since.isoformat()}",
            "order": "first_seen_at.desc",
            "limit": "5000",
        })
        return [{**r, "event_ids": [x["event_id"] for x in r.pop("event_articles", []) or []]} for r in rows or []]

    # -- writes --------------------------------------------------------------------
    def upsert_source(self, row: dict) -> None:
        self._req("POST", "/news_sources", params={"on_conflict": "id"}, json=row,
                  prefer="resolution=merge-duplicates,return=minimal")

    def start_run(self, source_id: str, now: datetime) -> int:
        rows = self._req("POST", "/collector_runs", json={
            "source_id": source_id, "started_at": now.isoformat(), "status": "running",
        }, prefer="return=representation")
        return rows[0]["id"]

    def finish_run(self, run_id: int, **fields) -> None:
        self._req("PATCH", "/collector_runs", params={"id": f"eq.{run_id}"}, json=_jsonable(fields),
                  prefer="return=minimal")

    def insert_article(self, row: dict) -> str:
        rows = self._req("POST", "/articles", json=_jsonable(row), prefer="return=representation")
        return rows[0]["id"]

    def touch_articles(self, ids: set[str], now: datetime) -> None:
        ids_list = sorted(ids)
        for i in range(0, len(ids_list), 100):
            chunk = ids_list[i:i + 100]
            self._req("PATCH", "/articles", params={"id": f"in.({','.join(chunk)})"},
                      json={"last_seen_at": now.isoformat()}, prefer="return=minimal")

    def create_event(self, title: str, now: datetime) -> str:
        rows = self._req("POST", "/events", json={"title": title, "first_seen_at": now.isoformat()},
                         prefer="return=representation")
        return rows[0]["id"]

    def link_event_article(self, event_id: str, article_id: str) -> None:
        self._req("POST", "/event_articles", params={"on_conflict": "event_id,article_id"},
                  json={"event_id": event_id, "article_id": article_id},
                  prefer="resolution=ignore-duplicates,return=minimal")

    def upsert_security_events(self, rows: list[dict]) -> None:
        if rows:
            self._req("POST", "/security_events", params={"on_conflict": "security_id,event_id"},
                      json=rows, prefer="resolution=ignore-duplicates,return=minimal")


def _jsonable(d: dict) -> dict:
    return {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in d.items()}
