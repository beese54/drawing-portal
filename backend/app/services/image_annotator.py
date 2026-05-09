"""
image_annotator.py — Annotate a schematic JPG with colored markers for compliance check results.

Accepts the raw image bytes and a list of elements to highlight (with their canvas coordinates
already resolved from the metadata). Returns a base64-encoded JPEG string.
"""

from __future__ import annotations

import base64
import io
from typing import Any

from PIL import Image, ImageDraw


# Color mapping for highlight_color strings
COLOR_MAP: dict[str, str] = {
    "red":    "#dc2626",
    "green":  "#16a34a",
    "orange": "#d97706",
    "blue":   "#2563eb",
}


def annotate_schematic(
    image_bytes: bytes,
    annotated_elements: list[dict[str, Any]],
    canvas_width: int,
    canvas_height: int,
) -> str:
    """
    Draw colored circles + labels on a schematic JPG at element canvas positions.

    Parameters
    ----------
    image_bytes : bytes
        Raw bytes of the uploaded JPEG.
    annotated_elements : list[dict]
        Each entry must contain:
            canvas_x: float   — element centre x in canvas pixels
            canvas_y: float   — element centre y in canvas pixels
            label: str        — text to draw beside the circle
            color: str        — "red" | "green" | "orange" | "blue"
    canvas_width : int
        Canvas width in pixels (from metadata["canvas"]["width_px"]).
    canvas_height : int
        Canvas height in pixels (from metadata["canvas"]["height_px"]).

    Returns
    -------
    str
        Base64-encoded JPEG string (no data URI prefix).
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_w, img_h = img.size

    # Scale factors: image pixels per canvas pixel
    scale_x = img_w / max(canvas_width, 1)
    scale_y = img_h / max(canvas_height, 1)

    draw = ImageDraw.Draw(img)

    for item in annotated_elements:
        cx = float(item.get("canvas_x", 0))
        cy = float(item.get("canvas_y", 0))
        label = str(item.get("label", ""))
        color_key = str(item.get("color", "blue"))
        color = COLOR_MAP.get(color_key, color_key)  # allow raw hex too

        px = int(cx * scale_x)
        py = int(cy * scale_y)

        # Outer ring (bold fill rim)
        r = 28
        draw.ellipse([px - r, py - r, px + r, py + r], outline=color, width=5)

        # Semi-transparent inner fill via second ellipse with slightly lighter color
        r_inner = 20
        draw.ellipse([px - r_inner, py - r_inner, px + r_inner, py + r_inner],
                     outline=color, width=2)

        # Label text — offset to the right of the circle
        if label:
            text_x = px + r + 6
            text_y = py - 10
            # White outline for readability on any background
            for dx, dy in [(-1, -1), (-1, 1), (1, -1), (1, 1)]:
                draw.text((text_x + dx, text_y + dy), label, fill="white")
            draw.text((text_x, text_y), label, fill=color)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return base64.b64encode(buf.getvalue()).decode("utf-8")
