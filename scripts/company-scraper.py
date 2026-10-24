#!/usr/bin/env python3
"""
Closr Company Intelligence Scraper
用途：爬取公司官网、新闻、公开信息，增强 BABEL 人物档案
合规：只爬取无需登录的公开内容，遵守 robots.txt
"""
from __future__ import annotations

import sys
import json
import argparse
import time
import re
import ipaddress
from datetime import datetime, timezone
from urllib.parse import quote_plus, urljoin, urlparse
import urllib.robotparser
import socket

# ── Scrapling ──────────────────────────────────────────────────────────────────
try:
    from scrapling import Fetcher
    SCRAPLING_AVAILABLE = True
except ImportError:
    SCRAPLING_AVAILABLE = False
    # Fallback: use requests if scrapling somehow isn't available
    try:
        import requests as _requests
    except ImportError:
        _requests = None  # type: ignore

import urllib.request
import xml.etree.ElementTree as ET
import logging

logging.getLogger("scrapling").setLevel(logging.ERROR)
socket.setdefaulttimeout(5)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_text(el) -> str:
    """Extract stripped text from a scrapling element or plain string."""
    if el is None:
        return ""
    if hasattr(el, "text"):
        return (el.text or "").strip()
    return str(el).strip()


_HOST_PUBLIC_CACHE: dict[str, bool] = {}


def _hostname_resolves_public(host: str) -> bool:
    if host in _HOST_PUBLIC_CACHE:
        return _HOST_PUBLIC_CACHE[host]

    try:
        addresses = socket.getaddrinfo(host, None)
    except Exception:
        _HOST_PUBLIC_CACHE[host] = False
        return False

    if not addresses:
        _HOST_PUBLIC_CACHE[host] = False
        return False

    for address in addresses:
        try:
            ip_text = address[4][0].split("%", 1)[0]
            if not ipaddress.ip_address(ip_text).is_global:
                _HOST_PUBLIC_CACHE[host] = False
                return False
        except Exception:
            _HOST_PUBLIC_CACHE[host] = False
            return False

    _HOST_PUBLIC_CACHE[host] = True
    return True


def _public_url_allowed(url: str) -> bool:
    """Allow only http(s) public hostnames. Blocks local/private-looking hosts."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            return False
        host = (parsed.hostname or "").lower()
        if not host or host in {"localhost", "0.0.0.0"}:
            return False
        try:
            ip = ipaddress.ip_address(host)
            return ip.is_global
        except ValueError:
            pass
        if (
            host.startswith("127.")
            or host.startswith("10.")
            or host.startswith("192.168.")
            or host.startswith("169.254.")
            or host.endswith(".internal")
            or host.endswith(".local")
        ):
            return False
        if re.match(r"^172\.(1[6-9]|2[0-9]|3[0-1])\.", host):
            return False
        return _hostname_resolves_public(host)
    except Exception:
        return False


_ROBOTS_CACHE: dict[str, urllib.robotparser.RobotFileParser] = {}


def _robots_allowed(url: str) -> bool:
    """Best-effort robots.txt check. If robots cannot be fetched, fail open for public sites."""
    try:
        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        if base not in _ROBOTS_CACHE:
            rp = urllib.robotparser.RobotFileParser()
            rp.set_url(urljoin(base, "/robots.txt"))
            try:
                rp.read()
            except Exception:
                return True
            _ROBOTS_CACHE[base] = rp
        return _ROBOTS_CACHE[base].can_fetch("ClosrPublicEvidenceBot", url)
    except Exception:
        return True


def _fetch_page(url: str) -> object | None:
    """Fetch a URL with scrapling Fetcher, return page object or None."""
    if not _public_url_allowed(url) or not _robots_allowed(url):
        return None
    if not SCRAPLING_AVAILABLE:
        return None
    try:
        fetcher = Fetcher()
        page = fetcher.get(url, timeout=6)
        return page
    except Exception:
        # Fallback: try basic requests-style fetch through scrapling
        try:
            fetcher = Fetcher()
            page = fetcher.get(url, timeout=6)
            return page
        except Exception:
            return None


def _extract_meta(page) -> dict:
    """Pull <title>, meta description, og:description from a page."""
    info = {"title": "", "description": ""}
    if page is None:
        return info

    try:
        title_el = page.find("title")
        if title_el:
            info["title"] = _safe_text(title_el)
    except Exception:
        pass

    for attr_val in ["description", "og:description", "twitter:description"]:
        try:
            el = page.find(f'meta[name="{attr_val}"]') or page.find(f'meta[property="{attr_val}"]')
            if el:
                content = el.attrib.get("content", "").strip()
                if content:
                    info["description"] = content
                    break
        except Exception:
            pass

    return info


def _extract_headings_and_paragraphs(page, max_items: int = 8) -> list[str]:
    """Extract key headings and paragraphs from the page body."""
    snippets: list[str] = []
    if page is None:
        return snippets

    try:
        for tag in ["h1", "h2", "h3"]:
            elements = page.find_all(tag) or []
            for el in elements[:4]:
                text = _safe_text(el)
                if text and len(text) > 3:
                    snippets.append(text)
            if len(snippets) >= max_items:
                break
    except Exception:
        pass

    if len(snippets) < max_items:
        try:
            paras = page.find_all("p") or []
            for el in paras[:10]:
                text = _safe_text(el)
                if len(text) > 50:
                    snippets.append(text[:300])
                if len(snippets) >= max_items:
                    break
        except Exception:
            pass

    return snippets[:max_items]


def _summarize_page(page) -> str:
    meta = _extract_meta(page)
    snippets = _extract_headings_and_paragraphs(page, max_items=6)
    parts = [meta.get("description", ""), *snippets]
    summary = " | ".join([p.strip() for p in parts if p and p.strip()])
    return summary[:900]


def _classify_public_page(url: str, label: str = "") -> str:
    text = f"{url} {label}".lower()
    if any(token in text for token in ["leadership", "management", "executive", "team", "about-us/our-people"]):
        return "leadership"
    if any(token in text for token in ["news", "press", "media", "insight", "blog"]):
        return "news"
    if any(token in text for token in ["case", "customer", "success", "solution"]):
        return "case_study"
    if any(token in text for token in ["procurement", "tender", "supplier", "partner"]):
        return "procurement"
    if "about" in text:
        return "about"
    return "public_page"


def _discover_public_urls(base_url: str, page=None, max_pages: int = 8) -> list[tuple[str, str]]:
    """Discover high-value public company pages from common paths and homepage anchors."""
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    candidates: dict[str, str] = {}

    common_paths = [
        "/about",
        "/about-us",
        "/leadership",
        "/management",
        "/team",
        "/news",
        "/press",
        "/media",
        "/case-studies",
        "/customers",
        "/partners",
        "/procurement",
        "/supplier",
    ]
    for path in common_paths:
        candidates[urljoin(origin, path)] = path.strip("/") or "home"

    if page is not None:
        try:
            anchors = page.find_all("a") or []
            for anchor in anchors[:120]:
                href = getattr(anchor, "attrib", {}).get("href", "")
                label = _safe_text(anchor)
                if not href:
                    continue
                url = urljoin(origin, href)
                if urlparse(url).netloc != parsed.netloc:
                    continue
                page_type = _classify_public_page(url, label)
                if page_type != "public_page":
                    candidates[url] = label or page_type
        except Exception:
            pass

    deduped: list[tuple[str, str]] = []
    seen: set[str] = set()
    for url, label in candidates.items():
        normalized = url.split("#", 1)[0].rstrip("/")
        if normalized in seen or normalized.rstrip("/") == base_url.rstrip("/"):
            continue
        seen.add(normalized)
        deduped.append((normalized, label))
        if len(deduped) >= max_pages:
            break
    return deduped


def scrape_website(base_url: str) -> dict:
    """Scrape company homepage and /about page."""
    result: dict = {
        "url": base_url,
        "title": "",
        "description": "",
        "about": "",
        "key_messages": [],
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "error": None,
    }

    try:
        page = _fetch_page(base_url)
        if page is None:
            result["error"] = "Failed to fetch homepage"
            return result

        meta = _extract_meta(page)
        result["title"] = meta["title"]
        result["description"] = meta["description"]
        result["key_messages"] = _extract_headings_and_paragraphs(page)

        time.sleep(1)

        # Try /about page
        parsed = urlparse(base_url)
        about_url = f"{parsed.scheme}://{parsed.netloc}/about"
        about_page = _fetch_page(about_url)
        if about_page:
            about_snippets = _extract_headings_and_paragraphs(about_page, max_items=5)
            result["about"] = " | ".join(about_snippets) if about_snippets else ""
        else:
            result["about"] = ""

    except Exception as exc:
        result["error"] = str(exc)

    return result


def scrape_public_pages(base_url: str, max_pages: int = 5) -> list[dict]:
    """Scrape allowed public company pages likely to contain signals or stakeholder context."""
    pages: list[dict] = []
    home_page = _fetch_page(base_url)
    candidates = _discover_public_urls(base_url, home_page, max_pages=max_pages)

    for url, label in candidates:
        page_type = _classify_public_page(url, label)
        record = {
            "url": url,
            "title": "",
            "summary": "",
            "key_messages": [],
            "page_type": page_type,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "error": None,
        }
        try:
            time.sleep(0.7)
            page = _fetch_page(url)
            if page is None:
                record["error"] = "Failed to fetch or robots disallowed"
                pages.append(record)
                continue
            meta = _extract_meta(page)
            record["title"] = meta.get("title", "")
            record["summary"] = _summarize_page(page)
            record["key_messages"] = _extract_headings_and_paragraphs(page, max_items=6)
        except Exception as exc:
            record["error"] = str(exc)
        pages.append(record)

    return pages


def fetch_google_news(company_name: str, max_items: int = 10) -> list[dict]:
    """Fetch recent news from Google News RSS."""
    news_items: list[dict] = []
    query = quote_plus(f'"{company_name}" company')
    rss_url = f"https://news.google.com/rss/search?q={query}&hl=en&gl=US&ceid=US:en"

    try:
        req = urllib.request.Request(
            rss_url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            xml_data = resp.read().decode("utf-8", errors="replace")

        root = ET.fromstring(xml_data)
        channel = root.find("channel")
        if channel is None:
            return news_items

        items = channel.findall("item")[:max_items]
        for item in items:
            title_el = item.find("title")
            link_el = item.find("link")
            pub_el = item.find("pubDate")
            desc_el = item.find("description")

            title = (title_el.text or "").strip() if title_el is not None else ""
            # Google News titles often contain " - Source" suffix — strip it
            title = re.sub(r"\s+-\s+\S.*$", "", title)

            link = (link_el.text or "").strip() if link_el is not None else ""
            pub_date = (pub_el.text or "").strip() if pub_el is not None else ""
            description = ""
            if desc_el is not None and desc_el.text:
                # Strip HTML tags from description
                description = re.sub(r"<[^>]+>", "", desc_el.text).strip()[:500]

            if title:
                news_items.append(
                    {
                        "title": title,
                        "url": link,
                        "published_at": pub_date,
                        "summary": description,
                    }
                )
    except Exception as exc:
        # Return partial results; caller records error separately
        news_items.append({"error": str(exc)})

    return news_items


# ── Main Entry ────────────────────────────────────────────────────────────────

def scrape_company(company_name: str, website_url: str | None = None) -> dict:
    result: dict = {
        "company_name": company_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "website": {},
        "public_pages": [],
        "news": [],
        "social_signals": {},
        "errors": [],
    }

    # 1. Scrape official website (if URL provided)
    if website_url:
        try:
            result["website"] = scrape_website(website_url)
            if result["website"].get("error"):
                result["errors"].append(f"website: {result['website']['error']}")
            result["public_pages"] = [
                page for page in scrape_public_pages(website_url) if not page.get("error")
            ]
        except Exception as exc:
            result["errors"].append(f"website: {exc}")
            result["website"] = {"error": str(exc)}

    # 2. Fetch Google News RSS
    try:
        time.sleep(1)
        news = fetch_google_news(company_name)
        # Separate items with errors
        errors_in_news = [n for n in news if "error" in n and len(n) == 1]
        clean_news = [n for n in news if "error" not in n]
        result["news"] = clean_news
        for e in errors_in_news:
            result["errors"].append(f"news: {e['error']}")
    except Exception as exc:
        result["errors"].append(f"news: {exc}")

    # 3. Social signals placeholder (LinkedIn, Twitter, etc. — requires separate APIs)
    result["social_signals"] = {
        "note": "Social signals require LinkedIn/Twitter API keys. Not scraped in this pass."
    }

    # Flatten errors for convenience
    if not result["errors"]:
        result.pop("errors")

    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Closr Company Intelligence Scraper")
    parser.add_argument("company_name", help="Company name to research")
    parser.add_argument("--url", help="Company website URL", default=None)
    parser.add_argument("--output", help="Output file path (default: stdout)", default="-")
    args = parser.parse_args()

    data = scrape_company(args.company_name, args.url)

    if args.output == "-":
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
