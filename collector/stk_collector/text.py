"""Pure helpers: URL canonicalisation, title fingerprints, name matching, timestamps."""
from __future__ import annotations

import calendar
import re
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

TRACKING_PARAMS = {
    "fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid", "ref", "ref_src",
    "cmpid", "ocid", "smid", "src", "cid", "s_cid", "spm", "oc",
}

STOPWORDS = {
    "the", "and", "for", "with", "from", "that", "this", "into", "over", "after", "amid", "says",
    "said", "will", "its", "are", "was", "has", "have", "new", "news", "more", "than", "out",
}

LEGAL_SUFFIXES = re.compile(
    r"[\s,]+(berhad|bhd|inc|incorporated|corp|corporation|co|company|ltd|limited|plc|ag|sa|nv|se|kk|"
    r"tbk|pte|llc|lp|group|holdings?)\.?$",
    re.IGNORECASE,
)


def canonical_url(url: str) -> str:
    """Level-1 dedup key: lower-case host, no fragment, no tracking params, sorted query."""
    parts = urlsplit(url.strip())
    query = [
        (k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if k.lower() not in TRACKING_PARAMS and not k.lower().startswith("utm_")
    ]
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, urlencode(sorted(query)), ""))


def strip_publisher_suffix(title: str, publisher: str | None) -> str:
    """Google News titles end with ' - Publisher'; remove it so fingerprints compare headlines."""
    title = title.strip()
    if publisher and title.endswith(f" - {publisher}"):
        return title[: -len(publisher) - 3].rstrip()
    return title


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def fingerprint(title: str) -> str:
    """Level-2 dedup key: folded headline text (case, accents and punctuation removed)."""
    return _fold(title)


def tokens(title: str) -> frozenset[str]:
    return frozenset(w for w in _fold(title).split() if len(w) > 2 and w not in STOPWORDS)


def jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def name_variants(company: str, aliases: list[str] | None) -> list[str]:
    """Names to search for and match in headlines. Tickers are excluded: they collide across markets."""
    names = [company.strip()]
    short = company.strip()
    while True:
        trimmed = LEGAL_SUFFIXES.sub("", short).strip()
        if trimmed == short:
            break
        short = trimmed
    if short and short != company.strip():
        names.append(short)
    names.extend(a.strip() for a in aliases or [] if a and a.strip())
    seen: set[str] = set()
    out = []
    for n in names:
        key = n.lower()
        if len(n) >= 3 and key not in seen:
            seen.add(key)
            out.append(n)
    return out


def headline_mentions(title: str, name: str) -> bool:
    """Whole-word, case- and accent-insensitive phrase match."""
    folded_name = _fold(name)
    if not folded_name:
        return False
    return re.search(rf"(?:^| ){re.escape(folded_name)}(?: |$)", _fold(title)) is not None


def parse_published(struct: time.struct_time | None, now: datetime) -> tuple[datetime | None, bool, str | None]:
    """Return (published_at, verified, flag). Never substitutes discovery time for publication time."""
    if struct is None:
        return None, False, "missing"
    try:
        published = datetime.fromtimestamp(calendar.timegm(struct), tz=timezone.utc)
    except (OverflowError, ValueError, TypeError):
        return None, False, "invalid"
    if published.year < 1990:
        return published, False, "invalid"
    if published > now + timedelta(minutes=10):
        return published, False, "future"
    return published, True, None
