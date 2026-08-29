"""URL validation to prevent Server-Side Request Forgery (SSRF) attacks."""

import ipaddress
import logging
import socket
import urllib.parse

logger = logging.getLogger(__name__)

_ALLOWED_SCHEMES = ("http", "https")


def validate_image_url(url: str) -> str:
    """Validate that *url* is safe to fetch (no SSRF).

    Raises ValueError if the URL scheme is not HTTP(S) or the hostname
    resolves to a private/loopback/link-local IP address.
    """
    parsed = urllib.parse.urlparse(url)

    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise ValueError(f"URL scheme '{parsed.scheme}' is not allowed. Use http or https.")

    if not parsed.hostname:
        raise ValueError("URL must include a hostname.")

    try:
        addr_infos = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror as exc:
        raise ValueError(f"Cannot resolve hostname '{parsed.hostname}'.") from exc

    for family, _, _, _, sockaddr in addr_infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError(
                f"URL resolves to private/reserved IP ({ip}). "
                "Requests to internal networks are not allowed."
            )

    return url
