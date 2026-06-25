from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

LOGGER = logging.getLogger(__name__)
SOURCE_NAME = "hunter"
HUNTER_LOGO_BASE_URL = "https://logos.hunter.io"
MAX_LOGO_BYTES = 256_000


@dataclass(frozen=True)
class TickerLogoResult:
    rows: list[dict[str, Any]]
    failed_tickers: list[str]
    skipped_tickers: list[str]


def fetch_ticker_logos(
    fundamental_rows: list[dict[str, Any]],
    existing_rows: list[dict[str, Any]] | None = None,
    force: bool = False,
    timeout_seconds: float = 8.0,
) -> TickerLogoResult:
    existing_tickers = {
        str(row.get("ticker", "")).upper()
        for row in existing_rows or []
        if row.get("logo_data_url")
    }
    rows: list[dict[str, Any]] = []
    failed_tickers: list[str] = []
    skipped_tickers: list[str] = []

    for fundamental in fundamental_rows:
        ticker = str(fundamental.get("ticker", "")).upper()
        if not ticker:
            continue
        if not force and ticker in existing_tickers:
            skipped_tickers.append(ticker)
            continue

        domain = domain_from_fundamentals(fundamental)
        if not domain:
            failed_tickers.append(ticker)
            LOGGER.warning("No company website domain found for %s logo.", ticker)
            continue

        row = fetch_hunter_logo(ticker, domain, timeout_seconds=timeout_seconds)
        if row:
            rows.append(row)
        else:
            failed_tickers.append(ticker)

    return TickerLogoResult(
        rows=rows,
        failed_tickers=failed_tickers,
        skipped_tickers=skipped_tickers,
    )


def fetch_hunter_logo(
    ticker: str,
    domain: str,
    timeout_seconds: float = 8.0,
) -> dict[str, Any] | None:
    logo_url = f"{HUNTER_LOGO_BASE_URL}/{domain}"
    request = Request(
        logo_url,
        headers={
            "User-Agent": "TickerWars/1.0 (+https://tickerwars.vercel.app)",
        },
    )

    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            content_type = response.headers.get_content_type()
            if not content_type.startswith("image/"):
                LOGGER.warning("Hunter returned non-image content for %s: %s", ticker, content_type)
                return None

            payload = response.read(MAX_LOGO_BYTES + 1)
            if len(payload) > MAX_LOGO_BYTES:
                LOGGER.warning("Hunter logo for %s exceeded %s bytes.", ticker, MAX_LOGO_BYTES)
                return None
    except HTTPError as exc:
        LOGGER.warning("Hunter logo fetch failed for %s with HTTP %s.", ticker, exc.code)
        return None
    except URLError as exc:
        LOGGER.warning("Hunter logo fetch failed for %s: %s", ticker, exc.reason)
        return None
    except TimeoutError:
        LOGGER.warning("Hunter logo fetch timed out for %s.", ticker)
        return None

    encoded = base64.b64encode(payload).decode("ascii")
    return {
        "ticker": ticker,
        "logo_data_url": f"data:{content_type};base64,{encoded}",
        "logo_content_type": content_type,
        "logo_source": SOURCE_NAME,
        "logo_domain": domain,
        "fetched_at": datetime.now(UTC).isoformat(),
    }


def domain_from_fundamentals(row: dict[str, Any]) -> str | None:
    raw = row.get("raw_json")
    raw_json = raw if isinstance(raw, dict) else {}
    website = _clean_string(
        row.get("website")
        or raw_json.get("website")
        or raw_json.get("websiteUrl")
        or raw_json.get("website_url")
    )
    if not website:
        return None

    parsed = urlparse(website if "://" in website else f"https://{website}")
    domain = parsed.netloc or parsed.path
    domain = domain.lower().removeprefix("www.").strip("/")
    return domain or None


def _clean_string(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
