"""Smoke tests for the airbnb-search handler. No network — urlopen is mocked."""

import json
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import handler  # noqa: E402


def _mock_response(body):
    cm = MagicMock()
    cm.__enter__.return_value.read.return_value = body
    return cm


class TestAuth(unittest.TestCase):
    def test_missing_key_returns_auth_error(self):
        with patch.dict(os.environ, {}, clear=True):
            result = handler.search_stays(location="Austin, TX")
        self.assertEqual(result["error"], "auth")
        self.assertIn("STAYINGAPI_KEY", result["detail"])
        self.assertIn("stayingapi.com/app/keys", result["detail"])


class TestInputValidation(unittest.TestCase):
    def test_no_location_or_urls_returns_error(self):
        with patch.dict(os.environ, {"STAYINGAPI_KEY": "sk_test"}):
            result = handler.search_stays()
        self.assertEqual(result["error"], "invalid_argument")


class TestEndpoint(unittest.TestCase):
    @patch("handler.urllib.request.urlopen")
    def test_search_posts_to_search_with_body(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response(b'{"data": [], "meta": {}, "request_id": "r1"}')
        with patch.dict(os.environ, {"STAYINGAPI_KEY": "sk_test"}):
            handler.search_stays(location="Austin, TX", price_max=250, min_bedrooms=2)
        req = mock_urlopen.call_args[0][0]
        self.assertIn("/v1/search", req.full_url)
        self.assertEqual(req.method, "POST")
        body = json.loads(req.data)
        self.assertEqual(body["locationQueries"], ["Austin, TX"])
        self.assertEqual(body["priceMax"], 250)
        self.assertEqual(body["minBedrooms"], 2)
        self.assertEqual(body["maxItems"], 50)

    @patch("handler.urllib.request.urlopen")
    def test_none_filters_excluded_from_body(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response(b'{"data": []}')
        with patch.dict(os.environ, {"STAYINGAPI_KEY": "sk_test"}):
            handler.search_stays(location="Lisbon")
        body = json.loads(mock_urlopen.call_args[0][0].data)
        self.assertNotIn("priceMin", body)
        self.assertNotIn("checkIn", body)
        self.assertNotIn("adults", body)

    @patch("handler.urllib.request.urlopen")
    def test_superhost_preset_hits_preset_path(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response(b'{"data": []}')
        with patch.dict(os.environ, {"STAYINGAPI_KEY": "sk_test"}):
            handler.search_superhost(location="Asheville, NC", max_items=15)
        req = mock_urlopen.call_args[0][0]
        self.assertIn("/v1/listings/superhost", req.full_url)
        self.assertEqual(req.method, "POST")
        self.assertEqual(json.loads(req.data)["maxItems"], 15)

    @patch("handler.urllib.request.urlopen")
    def test_authorization_header_is_set(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response(b'{"data": []}')
        with patch.dict(os.environ, {"STAYINGAPI_KEY": "sk_secret"}):
            handler.search_stays(location="Austin, TX")
        req = mock_urlopen.call_args[0][0]
        self.assertEqual(req.headers["Authorization"], "Bearer sk_secret")
        self.assertIn("airbnb-skills", req.headers["User-agent"])


if __name__ == "__main__":
    unittest.main()
