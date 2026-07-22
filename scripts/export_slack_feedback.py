"""
export_slack_feedback.py — pull feedback submissions out of a Slack channel
and write them to a CSV.

Usage:
    SLACK_BOT_TOKEN=xoxb-... SLACK_CHANNEL_ID=C0123456789 python scripts/export_slack_feedback.py

Requires a Slack bot token with the channels:history (+ channels:read, or
groups:* for a private channel) scope, and the bot must be a member of the
channel. See the setup steps you were walked through for how to get both.

Parses messages matching the shape posted by backend/app/routers/feedback.py
(one "Label: value" per line) — other messages in the channel are skipped.
"""

import csv
import os
import sys
from datetime import datetime, timezone

import requests

SLACK_API_URL = "https://slack.com/api/conversations.history"

FIELD_PREFIXES = {
    "Overall satisfaction": "overall_satisfaction",
    "Likelihood to use again": "likelihood_to_use_again",
    "Ease of use": "ease_of_use",
    "What confused them": "confusion",
    "Wished features": "wished_features",
}


def fetch_all_messages(token: str, channel_id: str) -> list[dict]:
    messages = []
    cursor = None
    headers = {"Authorization": f"Bearer {token}"}

    while True:
        params = {"channel": channel_id, "limit": 200}
        if cursor:
            params["cursor"] = cursor

        resp = requests.get(SLACK_API_URL, headers=headers, params=params, timeout=10)
        data = resp.json()

        if not data.get("ok"):
            print(f"Slack API error: {data.get('error')}", file=sys.stderr)
            sys.exit(1)

        messages.extend(data.get("messages", []))

        cursor = data.get("response_metadata", {}).get("next_cursor")
        if not cursor:
            break

    return messages


def parse_feedback_message(text: str) -> dict | None:
    result = {}
    for line in text.split("\n"):
        for prefix, key in FIELD_PREFIXES.items():
            if line.startswith(f"{prefix}:"):
                value = line[len(prefix) + 1:].strip()
                if key in ("overall_satisfaction", "likelihood_to_use_again", "ease_of_use"):
                    value = value.split("/")[0].strip()  # "5/5" -> "5"
                result[key] = value
                break

    # Only treat it as a feedback message if all three mandatory fields matched
    if all(k in result for k in ("overall_satisfaction", "likelihood_to_use_again", "ease_of_use")):
        return result
    return None


def main() -> None:
    token = os.environ.get("SLACK_BOT_TOKEN")
    channel_id = os.environ.get("SLACK_CHANNEL_ID")
    if not token or not channel_id:
        print("Set SLACK_BOT_TOKEN and SLACK_CHANNEL_ID environment variables first.", file=sys.stderr)
        sys.exit(1)

    messages = fetch_all_messages(token, channel_id)

    rows = []
    for msg in messages:
        parsed = parse_feedback_message(msg.get("text", ""))
        if parsed is None:
            continue
        submitted_at = datetime.fromtimestamp(float(msg["ts"]), tz=timezone.utc).isoformat()
        rows.append({
            "submitted_at": submitted_at,
            "overall_satisfaction": parsed.get("overall_satisfaction", ""),
            "likelihood_to_use_again": parsed.get("likelihood_to_use_again", ""),
            "ease_of_use": parsed.get("ease_of_use", ""),
            "confusion": parsed.get("confusion", ""),
            "wished_features": parsed.get("wished_features", ""),
        })

    rows.sort(key=lambda r: r["submitted_at"])

    out_path = "feedback_export.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "submitted_at", "overall_satisfaction", "likelihood_to_use_again",
            "ease_of_use", "confusion", "wished_features",
        ])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} feedback submissions to {out_path}")


if __name__ == "__main__":
    main()
