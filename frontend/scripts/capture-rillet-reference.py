#!/usr/bin/env python3
"""Prepare an isolated, TLS-verified static reference. Standard library only."""

import argparse
import base64
import concurrent.futures
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone


SOURCE = "https://www.rillet.com/"
ASSET_HOSTS = {"cdn.prod.website-files.com", "fonts.googleapis.com", "fonts.gstatic.com"}
ALLOWED_HOSTS = ASSET_HOSTS | {"rillet.com", "www.rillet.com"}
FONT_URL = (
    "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700"
    "&family=Space+Grotesk:wght@300;400;500;600;700&display=swap"
)
USER_AGENT = "Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36"
CSS_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.I)
CSP = (
    "default-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; "
    "object-src 'none'; form-action 'none'; base-uri 'none'; "
    "style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; "
    "media-src 'none'"
)


def checked_url(url):
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or parts.hostname not in ALLOWED_HOSTS:
        raise ValueError("Only HTTPS on the declared reference/asset hosts is allowed: " + url)
    if parts.username or parts.password or parts.port not in (None, 443):
        raise ValueError("Credentials and nonstandard ports are not supported")
    return url


class RestrictedRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        checked_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url):
    checked_url(url)
    # The default HTTPS handler verifies the certificate chain and hostname.
    opener = urllib.request.build_opener(RestrictedRedirect())
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with opener.open(request, timeout=45) as response:
        checked_url(response.url)
        content = response.read(16 * 1024 * 1024 + 1)
        if len(content) > 16 * 1024 * 1024:
            raise ValueError("Reference resource exceeds the 16 MiB bound")
        return content, response.url, response.headers.get_content_type()


class Inventory(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.styles = []
        self.assets = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and "stylesheet" in attrs.get("rel", "").split():
            self.styles.append((urllib.parse.urljoin(SOURCE, attrs.get("href", "")), attrs.get("integrity", "")))
        if tag == "img" and attrs.get("src"):
            self.assets.add(urllib.parse.urljoin(SOURCE, attrs["src"]))
        for name in ("poster", "data-poster-url"):
            if attrs.get(name):
                self.assets.add(urllib.parse.urljoin(SOURCE, attrs[name]))
        if attrs.get("style"):
            self.assets.update(css_urls(attrs["style"], SOURCE))


def css_urls(text, base):
    return {urllib.parse.urljoin(base, m.group(2)) for m in CSS_URL.finditer(text)
            if m.group(2) and not m.group(2).startswith(("data:", "#"))}


def rewrite_css(text, base, local):
    # Imported stylesheets could otherwise create undeclared requests.
    text = re.sub(r"@import\s+(?:url\([^)]*\)|[^;]+);", "", text, flags=re.I)

    def replace(match):
        value = match.group(2)
        if value.startswith(("data:", "#")):
            return match.group(0)
        return 'url("' + local.get(urllib.parse.urljoin(base, value), "") + '")'

    return CSS_URL.sub(replace, text)


class IsolatedHTML(HTMLParser):
    """Preserve reference markup while removing executable/remote surfaces."""

    SKIP = {"script", "noscript", "iframe", "object", "video", "audio", "template"}
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, local, styles):
        super().__init__(convert_charrefs=False)
        self.local = local
        self.styles = styles
        self.parts = []
        self.skipping = None
        self.skip_depth = 0
        self.in_style = False

    def handle_decl(self, decl):
        if not self.skipping:
            self.parts.append("<!" + decl + ">")

    def handle_starttag(self, tag, attrs):
        if self.skipping:
            if tag == self.skipping:
                self.skip_depth += 1
            return
        values = dict(attrs)
        if tag in self.SKIP:
            if tag == "video":
                poster = values.get("poster", "")
                if not poster:
                    match = CSS_URL.search(html.unescape(values.get("style", "")))
                    poster = match.group(2) if match else ""
                local_poster = self.local.get(urllib.parse.urljoin(SOURCE, poster), "")
                if local_poster:
                    self.parts.append('<img class="reference-video-frame" alt="Public video poster; animation excluded" src="' + local_poster + '">')
            self.skipping, self.skip_depth = tag, 1
            return
        if tag in {"base", "link", "embed", "source", "track"}:
            return
        if tag == "meta" and values.get("http-equiv"):
            return
        safe = []
        for name, value in attrs:
            if name.startswith("on") or name in {"srcset", "integrity", "crossorigin", "ping", "srcdoc", "formaction", "autofocus"}:
                continue
            if name in {"src", "poster", "data-poster-url"} and value:
                value = self.local.get(urllib.parse.urljoin(SOURCE, value), "")
            if name in {"href", "action"} and value and value.lstrip().lower().startswith(("javascript:", "data:")):
                value = "#"
            if name == "style" and value:
                value = rewrite_css(value, SOURCE, self.local)
            safe.append(name if value is None else name + '="' + html.escape(value, quote=True) + '"')
        self.parts.append("<" + tag + (" " + " ".join(safe) if safe else "") + ">")
        if tag == "head":
            self.parts.append('<meta http-equiv="Content-Security-Policy" content="' + html.escape(CSP, quote=True) + '">')
        self.in_style = tag == "style" or self.in_style

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if self.skipping:
            if tag == self.skipping:
                self.skip_depth -= 1
                if not self.skip_depth:
                    self.skipping = None
            return
        if tag in {"base", "link", "embed", "source", "track"}:
            return
        if tag == "head":
            self.parts.extend('<link rel="stylesheet" href="/' + path + '">' for path in self.styles)
            self.parts.append('<style>.reference-video-frame{height:100%;width:100%;position:absolute;inset:0;object-fit:cover}.anti-flicker,.anti-flicker *{visibility:visible!important;opacity:1!important}html{scroll-behavior:auto!important}*{animation-play-state:paused!important}</style>')
        self.parts.append("</" + tag + ">")
        if tag == "style":
            self.in_style = False

    def handle_data(self, data):
        if not self.skipping:
            self.parts.append(rewrite_css(data, SOURCE, self.local) if self.in_style else data)

    def handle_entityref(self, name):
        if not self.skipping:
            self.parts.append("&" + name + ";")

    def handle_charref(self, name):
        if not self.skipping:
            self.parts.append("&#" + name + ";")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path, help="New output directory, outside application public assets")
    args = parser.parse_args()
    root = args.out.resolve()
    root.mkdir(parents=True, exist_ok=False)
    (root / "assets").mkdir()
    (root / "sources").mkdir()
    homepage, final_url, _ = fetch(SOURCE)
    source_text = homepage.decode("utf-8")
    (root / "sources/homepage.txt").write_bytes(homepage)
    inventory = Inventory()
    inventory.feed(source_text)
    manifest = {
        "source": SOURCE, "final_url": final_url,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "verified_https": True, "homepage_sha256": hashlib.sha256(homepage).hexdigest(),
        "mode": "isolated local static reference; no remote JavaScript execution",
        "allowed_asset_hosts": sorted(ASSET_HOSTS), "stylesheets": [], "assets": [], "errors": [],
        "limitations": ["Video is represented by its public poster.", "Scripts, frames, remote requests and live interactions are excluded.", "Static source may not reproduce script-driven lazy loading or animation.", "Public homepage only; no authenticated or private UI was inspected."],
    }
    styles = []
    verified_shared = False
    for index, (url, integrity) in enumerate(inventory.styles + [(FONT_URL, "")]):
        if urllib.parse.urlsplit(url).hostname not in ASSET_HOSTS:
            raise ValueError("Unexpected stylesheet host: " + url)
        content, final, _ = fetch(url)
        sha384 = base64.b64encode(hashlib.sha384(content).digest()).decode()
        declared = [token[7:] for token in integrity.split() if token.startswith("sha384-")]
        if integrity and (not declared or sha384 not in declared):
            raise ValueError("Declared stylesheet SHA-384 integrity does not match: " + url)
        verified_shared = verified_shared or bool(declared)
        name = "style-" + str(index) + ".css"
        (root / "sources" / (name + ".txt")).write_bytes(content)
        styles.append((name, content.decode("utf-8"), url))
        manifest["stylesheets"].append({"url": url, "final_url": final, "local_path": name,
                                        "sha256": hashlib.sha256(content).hexdigest(),
                                        "sha384": sha384, "declared_integrity": integrity,
                                        "integrity_verified": bool(declared)})
    if not verified_shared:
        raise ValueError("No shared stylesheet declared and passed SHA-384 integrity; refusing an unverified reference")
    urls = inventory.assets
    for _, content, url in styles:
        urls.update(css_urls(content, url))
    # Include URLs in inline stylesheet blocks as well as inline style attributes.
    for block in re.findall(r"<style\b[^>]*>(.*?)</style\s*>", source_text, re.I | re.S):
        urls.update(css_urls(block, SOURCE))
    urls = sorted(url for url in urls if urllib.parse.urlsplit(url).hostname in ASSET_HOSTS)
    local = {}

    def download(url):
        content, final, media = fetch(url)
        suffix = Path(urllib.parse.unquote(urllib.parse.urlsplit(url).path)).suffix
        if not re.fullmatch(r"\.[A-Za-z0-9]{1,6}", suffix):
            suffix = ".bin"
        name = "assets/" + hashlib.sha256(url.encode()).hexdigest()[:24] + suffix
        (root / name).write_bytes(content)
        return {"url": url, "final_url": final, "local_path": name, "sha256": hashlib.sha256(content).hexdigest(), "bytes": len(content), "media_type": media}

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        futures = {executor.submit(download, url): url for url in urls}
        for future in concurrent.futures.as_completed(futures):
            try:
                asset = future.result()
                manifest["assets"].append(asset)
                local[asset["url"]] = "/" + asset["local_path"]
            except Exception as error:
                manifest["errors"].append({"url": futures[future], "error": str(error)})
    manifest["assets"].sort(key=lambda item: item["url"])
    for name, content, url in styles:
        (root / name).write_text(rewrite_css(content, url, local), encoding="utf-8")
    isolated = IsolatedHTML(local, [name for name, _, _ in styles])
    isolated.feed(source_text)
    isolated.close()
    output = "".join(isolated.parts)
    (root / "index.html").write_text(output, encoding="utf-8")
    manifest["isolated_html_sha256"] = hashlib.sha256(output.encode()).hexdigest()
    manifest["completeness"] = "partial" if manifest["errors"] else "complete-for-declared-static-assets"
    (root / "asset-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"output": str(root), "assets": len(local), "errors": len(manifest["errors"]), "shared_css_integrity_verified": verified_shared}))
    return 1 if manifest["errors"] else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError) as error:
        print("Reference preparation failed: " + str(error), file=sys.stderr)
        sys.exit(1)
