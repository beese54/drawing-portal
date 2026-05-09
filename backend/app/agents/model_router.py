"""
model_router.py — Unified LLM client factory for OpenAI and Qwen (Together AI).

Both providers expose an OpenAI-compatible REST API, so the same
`openai.AsyncOpenAI` client is used for both — only the base_url and
model identifier differ.

API keys are loaded from environment variables (never hardcoded):
    OPENAI_API_KEY   — for provider="openai"
    TOGETHER_API_KEY — for provider="qwen"
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import AsyncIterator

from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()  # loads backend/.env if present

# ---------------------------------------------------------------------------
# Provider configuration
# ---------------------------------------------------------------------------

PROVIDERS: dict[str, dict[str, str]] = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "model_id": "gpt-4o-mini",
        "env_key":  "OPENAI_API_KEY",
    },
    "qwen": {
        "base_url": "https://api.together.xyz/v1",
        "model_id": "Qwen/Qwen2.5-7B-Instruct-Turbo",
        "env_key":  "TOGETHER_API_KEY",
    },
}


# ---------------------------------------------------------------------------
# Response dataclass
# ---------------------------------------------------------------------------

@dataclass
class LLMResponse:
    content: str
    model: str
    provider: str
    input_tokens: int
    output_tokens: int


# ---------------------------------------------------------------------------
# Client factory
# ---------------------------------------------------------------------------

def _get_client(provider: str) -> tuple[AsyncOpenAI, str]:
    """Return (AsyncOpenAI client, model_id) for the given provider."""
    cfg = PROVIDERS.get(provider)
    if cfg is None:
        raise ValueError(f"Unknown provider '{provider}'. Choose 'openai' or 'qwen'.")

    api_key = os.getenv(cfg["env_key"])
    if not api_key:
        raise EnvironmentError(
            f"Environment variable '{cfg['env_key']}' is not set. "
            f"Add it to backend/.env (see .env.example)."
        )

    client = AsyncOpenAI(
        api_key=api_key,
        base_url=cfg["base_url"],
    )
    return client, cfg["model_id"]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def complete(
    provider: str,
    messages: list[dict[str, str]],
    temperature: float = 0.2,
    max_tokens: int = 2048,
) -> LLMResponse:
    """Send a chat completion request and return the full response.

    Parameters
    ----------
    provider : str
        'openai' or 'qwen'.
    messages : list[dict]
        OpenAI-format message list: [{"role": "...", "content": "..."}]
    temperature : float
        Sampling temperature (lower = more deterministic).
    max_tokens : int
        Maximum tokens in the response.
    """
    client, model_id = _get_client(provider)

    response = await client.chat.completions.create(
        model=model_id,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    choice = response.choices[0]
    usage = response.usage

    return LLMResponse(
        content=choice.message.content or "",
        model=model_id,
        provider=provider,
        input_tokens=usage.prompt_tokens if usage else 0,
        output_tokens=usage.completion_tokens if usage else 0,
    )


async def stream_complete(
    provider: str,
    messages: list[dict[str, str]],
    temperature: float = 0.2,
    max_tokens: int = 2048,
) -> AsyncIterator[str]:
    """Stream a chat completion, yielding text deltas as they arrive.

    Usage::

        async for token in stream_complete("openai", messages):
            await ws.send_text(token)
    """
    client, model_id = _get_client(provider)

    async with await client.chat.completions.create(
        model=model_id,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
    ) as stream:
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
