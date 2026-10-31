"""Optional paid inference. Disabled unless every explicit setting is present.

There is no fallback into this mode, and a failed call does not fall back to
the CPU selector.
"""

from __future__ import annotations

import json
import os
import urllib.request
from dataclasses import dataclass

from upgradeproof.actions import Action


class PaidDisabled(RuntimeError):
    pass


class PaidCallError(RuntimeError):
    pass


@dataclass(frozen=True)
class PaidConfig:
    model: str
    base_url: str
    api_key: str
    price_per_call: float | None


def load_paid_config() -> PaidConfig:
    if os.environ.get("UPGRADEPROOF_ALLOW_PAID") != "1":
        raise PaidDisabled("paid mode requires UPGRADEPROOF_ALLOW_PAID=1")
    model = os.environ.get("UPGRADEPROOF_PAID_MODEL", "").strip()
    api_key = os.environ.get("UPGRADEPROOF_PAID_API_KEY", "").strip()
    base_url = os.environ.get("UPGRADEPROOF_PAID_BASE_URL", "").strip().rstrip("/")
    if not model or not api_key or not base_url:
        raise PaidDisabled("paid mode requires model, base URL, and API key")
    raw_price = os.environ.get("UPGRADEPROOF_PAID_PRICE_PER_CALL", "").strip()
    price = float(raw_price) if raw_price else None
    return PaidConfig(model=model, base_url=base_url, api_key=api_key, price_per_call=price)


def select_paid(
    failure_text: str,
    actions: list[Action],
    config: PaidConfig,
    opener=None,
    max_chars: int = 8000,
) -> tuple[Action | None, str]:
    """Ask one hosted model to return a candidate id. ``opener`` is injectable in tests."""
    catalog = [{"id": action.id, "description": action.candidate_text} for action in actions]
    prompt = failure_text[:max_chars]
    body = {
        "model": config.model,
        "temperature": 0,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Reply with exactly one candidate id from the list. "
                    "Do not include an explanation. If none apply, reply abstain."
                ),
            },
            {
                "role": "user",
                "content": json.dumps({"failure": prompt, "candidates": catalog}, sort_keys=True),
            },
        ],
    }
    request = urllib.request.Request(
        f"{config.base_url}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        open_fn = opener or urllib.request.urlopen
        with open_fn(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except PaidCallError:
        raise
    except Exception as exc:  # noqa: BLE001 - network and JSON errors become a tool failure
        raise PaidCallError(str(exc)) from exc
    try:
        text = payload["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise PaidCallError("paid response did not include a message") from exc
    if text == "abstain":
        return None, text
    for action in actions:
        if action.id == text:
            return action, text
    return None, text
