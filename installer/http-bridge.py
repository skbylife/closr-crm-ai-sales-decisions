#!/usr/bin/env python3
"""One-request stdio bridge from one isolated Community PG to Auth or REST.

Protocol: 4-byte big-endian JSON metadata length, JSON metadata, raw request body;
same framing on stdout for the response. No addresses or credentials are accepted
from command-line arguments, and this program does not print request data.
"""

import http.client
import json
import os
import re
import struct
import sys


METHODS = {"GET", "POST", "PATCH", "DELETE", "HEAD"}
RUN_ID_RE = re.compile(r"^closr-community-[a-f0-9]{20}$")
AUTH_METHODS = {
    "token": {"POST"}, "user": {"GET"}, "signup": {"POST"},
    "logout": {"POST"}, "admin/users": {"GET", "POST"},
}
REST_TABLES = {
    "organizations", "org_memberships", "accounts", "contacts",
    "opportunities", "strategic_plays",
}
REQUEST_HEADERS = {
    "accept", "accept-profile", "accept-language", "apikey", "authorization",
    "content-profile", "content-type", "if-match", "if-none-match",
    "prefer", "range", "user-agent", "x-client-info", "x-supabase-api-version",
}
RESPONSE_HEADERS = {
    "cache-control", "content-disposition", "content-encoding", "content-language",
    "content-length", "content-location", "content-profile", "content-range",
    "content-type", "etag", "expires", "last-modified", "location",
    "preference-applied", "vary", "www-authenticate",
}
MAX_META = 16384
MAX_REQUEST = 1024 * 1024
MAX_RESPONSE = 8 * 1024 * 1024


class InvalidFrame(Exception):
    pass


def load_targets():
    run_id = os.environ.get("CLOSR_COMMUNITY_RUN_ID", "")
    auth = os.environ.get("CLOSR_COMMUNITY_AUTH_CONTAINER", "")
    rest = os.environ.get("CLOSR_COMMUNITY_REST_CONTAINER", "")
    if not RUN_ID_RE.fullmatch(run_id) or auth != run_id + "-auth" or rest != run_id + "-rest":
        raise InvalidFrame()
    return {"auth": (auth, 9999), "rest": (rest, 3000)}


def exact_read(stream, size):
    parts = []
    while size:
        part = stream.read(size)
        if not part:
            raise InvalidFrame()
        parts.append(part)
        size -= len(part)
    return b"".join(parts)


def write_frame(status, headers, body):
    metadata = json.dumps({"status": status, "headers": headers, "body_length": len(body)},
                          separators=(",", ":")).encode("utf-8")
    if len(metadata) > MAX_META:
        raise InvalidFrame()
    out = sys.stdout.buffer
    out.write(struct.pack(">I", len(metadata)))
    out.write(metadata)
    out.write(body)
    out.flush()


def fail(code):
    write_frame(502, {"content-type": "application/json"},
                json.dumps({"error": code}, separators=(",", ":")).encode("ascii"))


def read_request():
    length = struct.unpack(">I", exact_read(sys.stdin.buffer, 4))[0]
    if length < 2 or length > MAX_META:
        raise InvalidFrame()
    meta = json.loads(exact_read(sys.stdin.buffer, length))
    if not isinstance(meta, dict) or set(meta) != {"target", "method", "path", "headers", "body_length"}:
        raise InvalidFrame()
    target, method, path = meta["target"], meta["method"], meta["path"]
    if target not in ("auth", "rest") or method not in METHODS or not isinstance(path, str) or \
            len(path) > 8192 or not path.startswith("/") or path.startswith("//") or "#" in path:
        raise InvalidFrame()
    pathname = path.split("?", 1)[0]
    if "%" in pathname or "\\" in pathname or "//" in pathname or \
            any(part in (".", "..") for part in pathname.split("/")):
        raise InvalidFrame()
    suffix = pathname[1:]
    if target == "auth" and method not in AUTH_METHODS.get(suffix, ()):
        raise InvalidFrame()
    if target == "rest" and suffix not in REST_TABLES:
        raise InvalidFrame()
    headers = meta["headers"]
    if not isinstance(headers, dict) or any(
        not isinstance(key, str) or key not in REQUEST_HEADERS or
        not isinstance(value, str) or "\r" in value or "\n" in value
        for key, value in headers.items()
    ) or "apikey" not in headers or "authorization" not in headers:
        raise InvalidFrame()
    body_length = meta["body_length"]
    if type(body_length) is not int or not 0 <= body_length <= MAX_REQUEST:
        raise InvalidFrame()
    return target, method, path, headers, exact_read(sys.stdin.buffer, body_length)


def forward(target, method, path, headers, body):
    host, port = load_targets()[target]
    conn = http.client.HTTPConnection(host, port, timeout=10)
    try:
        conn.request(method, path, body=body, headers=headers)
        response = conn.getresponse()
        payload = response.read(MAX_RESPONSE + 1)
        if len(payload) > MAX_RESPONSE:
            raise InvalidFrame()
        safe_headers = {}
        for name, value in response.getheaders():
            name = name.lower()
            if name in RESPONSE_HEADERS and name not in safe_headers:
                safe_headers[name] = value
        safe_headers["content-length"] = str(len(payload))
        write_frame(response.status, safe_headers, payload)
    finally:
        conn.close()


def main():
    try:
        forward(*read_request())
    except (InvalidFrame, ValueError, TypeError, KeyError, OSError, http.client.HTTPException):
        fail("bridge_unavailable")


if __name__ == "__main__":
    main()
