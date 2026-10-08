"""Admin-added Facebook post links, rendered as links on the public landing page."""

import pytest


class TestAddNewsValidation:
    @pytest.mark.parametrize("url", [
        "https://www.facebook.com/psitsusmmain/posts/pfbid02abc",
        "https://facebook.com/photo/?fbid=123",
        "https://m.facebook.com/story.php?id=1",
    ])
    def test_accepts_real_facebook_urls(self, client, admin_headers, url):
        res = client.post("/api/v1/officer/news/", headers=admin_headers, json={"facebook_url": url})
        assert res.status_code == 200, res.text

    @pytest.mark.parametrize("url", [
        "https://facebook.com.attacker.example/post",
        "https://attacker.example/facebook.com",
        "https://notfacebook.com/post",
        "javascript:alert(1)//facebook.com",
        "http://www.facebook.com/post",
    ])
    def test_rejects_lookalike_and_non_https_urls(self, client, admin_headers, url):
        res = client.post("/api/v1/officer/news/", headers=admin_headers, json={"facebook_url": url})
        assert res.status_code == 422
