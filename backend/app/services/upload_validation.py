"""upload_validation.py — confirm uploaded bytes really are the format they claim.

Both public POST endpoints hand uploaded bytes to a parsing library: Pillow in
the evaluate path (services/image_annotator.py) and python-docx in the export
path (routers/export.py). The multipart Content-Type header cannot gate that —
it is a string the caller chooses, so a payload of any format can arrive
labelled image/png, and Pillow alone will decode roughly fifty formats.

Checking the leading signature bytes is what makes the declared type
falsifiable. The frontend already works this way for imported stamps
(frontend/src/utils/importValidation.ts, MAGIC) and states the reasoning:
"The MIME label ... is just a string the file author chose — it is not evidence
of anything." This is the same control on the server side of the trust
boundary, where a caller cannot skip it by not running our JavaScript.

Scope, deliberately: this is a **format gate**, not an integrity check. It
establishes which parser a payload is allowed to reach and says nothing about
what follows the header, so callers must still handle parse failures. It is
also not malware scanning — no signature matching is performed on content.
"""

from __future__ import annotations

# Leading signature bytes per format. Keep in step with the frontend's MAGIC
# table. WebP is accepted on the client for stamps but never reaches these two
# endpoints, so it is deliberately absent here.
_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
}


def sniff_image_type(data: bytes) -> str | None:
    """Return the MIME type the bytes actually begin with, or None if unknown."""
    for mime, prefixes in _SIGNATURES.items():
        if any(data.startswith(prefix) for prefix in prefixes):
            return mime
    return None


def is_allowed_image(data: bytes, allowed: set[str]) -> bool:
    """True when the bytes begin with the signature of one of `allowed`."""
    sniffed = sniff_image_type(data)
    return sniffed is not None and sniffed in allowed
