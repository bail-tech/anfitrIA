"""
airbnb-search skill handler — listing search via the Staying API.

Pure standard library. Bearer token in STAYINGAPI_KEY.
Errors are returned as {"error": "...", "detail": "..."} dicts rather than raised.
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request

API_BASE = "https://api.stayingapi.com/v1"
USER_AGENT = "airbnb-skills/1.0.1 (+https://github.com/nikhonit/airbnb-skills)"
TIMEOUT_SECONDS = 60


def _key():
    k = os.environ.get("STAYINGAPI_KEY", "").strip()
    if not k:
        raise RuntimeError(
            "STAYINGAPI_KEY environment variable is not set. "
            "Get a free key in 30 seconds at https://stayingapi.com/app/keys "
            "(100 credits, no card required). Then export STAYINGAPI_KEY=sk_..."
        )
    return k


def _request(method, path, params=None, body=None):
    try:
        url = API_BASE + path
        if params:
            filtered = {k: v for k, v in params.items() if v is not None}
            if filtered:
                url = url + "?" + urllib.parse.urlencode(filtered)
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers={
                "Authorization": "Bearer " + _key(),
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode("utf-8")[:1000]
        except Exception:
            detail = ""
        return {"error": "HTTP " + str(e.code), "detail": detail}
    except urllib.error.URLError as e:
        return {"error": "network", "detail": str(e.reason)}
    except RuntimeError as e:
        return {"error": "auth", "detail": str(e)}
    except Exception as e:
        return {"error": "unexpected", "detail": str(e)}


def _build_filters(opts):
    location = opts.get("location")
    body = {
        "locationQueries": [location] if location else None,
        "searchUrls": opts.get("search_urls"),
        "checkIn": opts.get("check_in"),
        "checkOut": opts.get("check_out"),
        "priceMin": opts.get("price_min"),
        "priceMax": opts.get("price_max"),
        "minBeds": opts.get("min_beds"),
        "minBedrooms": opts.get("min_bedrooms"),
        "minBathrooms": opts.get("min_bathrooms"),
        "adults": opts.get("adults"),
        "children": opts.get("children"),
        "infants": opts.get("infants"),
        "pets": opts.get("pets"),
        "currency": opts.get("currency"),
        "locale": opts.get("locale"),
        "maxItems": opts.get("max_items", 50),
        "fields": opts.get("fields"),
    }
    return {k: v for k, v in body.items() if v is not None}


def search_stays(
    location=None,
    search_urls=None,
    check_in=None,
    check_out=None,
    price_min=None,
    price_max=None,
    min_beds=None,
    min_bedrooms=None,
    min_bathrooms=None,
    adults=None,
    children=None,
    infants=None,
    pets=None,
    currency=None,
    locale=None,
    max_items=50,
    fields=None,
):
    """
    Search Airbnb listings by location and structured filters.

    location:    a place string, e.g. "Austin, TX" (mapped to locationQueries).
    search_urls: a list of Airbnb search-results URLs to replay (alternative to location).
    check_in / check_out: "YYYY-MM-DD".
    max_items:   cap on results, default 50, max 240. Search costs 1 credit per result,
                 so this is your spend cap.

    Either location or search_urls is required. Returns:
        {"data": [<stay>, ...], "meta": {...}, "request_id": "..."}
        or {"error": "...", "detail": "..."}.
    """
    if not location and not search_urls:
        return {"error": "invalid_argument", "detail": "Provide either location or search_urls"}
    return _request("POST", "/search", body=_build_filters(locals()))


def search_superhost(**filters):
    """Superhost-only preset. Accepts the same filters as search_stays()."""
    if not filters.get("location") and not filters.get("search_urls"):
        return {"error": "invalid_argument", "detail": "Provide either location or search_urls"}
    return _request("POST", "/listings/superhost", body=_build_filters(filters))


def search_instant_book(**filters):
    """Instant-bookable preset. Accepts the same filters as search_stays()."""
    if not filters.get("location") and not filters.get("search_urls"):
        return {"error": "invalid_argument", "detail": "Provide either location or search_urls"}
    return _request("POST", "/listings/instant-book", body=_build_filters(filters))


def search_luxury(**filters):
    """Luxury-tier preset. Accepts the same filters as search_stays()."""
    if not filters.get("location") and not filters.get("search_urls"):
        return {"error": "invalid_argument", "detail": "Provide either location or search_urls"}
    return _request("POST", "/listings/luxury", body=_build_filters(filters))


def search_stays_with_details(**filters):
    """
    Search, then fetch the full Stay record for each result. Always runs async —
    returns a job envelope ({"job_id": ..., "status": ...}); poll it with the
    airbnb-full skill (get_job / get_job_results). Accepts the same filters as search_stays().
    """
    if not filters.get("location") and not filters.get("search_urls"):
        return {"error": "invalid_argument", "detail": "Provide either location or search_urls"}
    return _request("POST", "/search/with-details", body=_build_filters(filters))
