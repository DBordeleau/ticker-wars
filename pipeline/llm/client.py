from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any
from urllib import request
from urllib.error import URLError

from pipeline.config import Settings, load_settings

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class LLMResponse:
    predicted_return: float
    confidence: float | None
    reasoning_summary: str


def is_llm_configured(settings: Settings | None = None) -> bool:
    settings = settings or load_settings()
    provider = settings.llm_provider.lower()
    if provider == "gemini":
        return bool(settings.gemini_api_key)
    if provider == "groq":
        return bool(settings.groq_api_key)
    return False


def request_structured_prediction(prompt: str, settings: Settings | None = None) -> LLMResponse:
    settings = settings or load_settings()
    provider = settings.llm_provider.lower()

    if provider == "gemini":
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is not configured.")
        text = _request_gemini(prompt, settings)
    elif provider == "groq":
        if not settings.groq_api_key:
            raise ValueError("GROQ_API_KEY is not configured.")
        text = _request_groq(prompt, settings)
    else:
        raise ValueError(f"Unsupported LLM_PROVIDER: {settings.llm_provider}")

    return parse_llm_response(text)


def parse_llm_response(text: str) -> LLMResponse:
    payload = _loads_json_object(text)
    predicted_return = float(payload["predicted_return"])
    confidence = payload.get("confidence")
    reasoning = str(payload.get("reasoning_summary", "")).strip()

    if confidence is not None:
        confidence = float(confidence)

    return LLMResponse(
        predicted_return=predicted_return,
        confidence=confidence,
        reasoning_summary=_clamp_reasoning(reasoning),
    )


def _request_gemini(prompt: str, settings: Settings) -> str:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent?key={settings.gemini_api_key}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }
    data = _post_json(url, payload)
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _request_groq(prompt: str, settings: Settings) -> str:
    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": settings.groq_model,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "user", "content": prompt}],
    }
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
    data = _post_json(url, payload, headers=headers)
    return data["choices"][0]["message"]["content"]


def _post_json(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    request_headers = {"Content-Type": "application/json", **(headers or {})}
    http_request = request.Request(url, data=body, headers=request_headers, method="POST")
    try:
        with request.urlopen(http_request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except URLError as exc:
        LOGGER.warning("LLM request failed: %s", exc)
        raise


def _loads_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("LLM response did not contain a JSON object.")
    payload = json.loads(cleaned[start : end + 1])
    if not isinstance(payload, dict):
        raise ValueError("LLM response JSON was not an object.")
    return payload


def _clamp_reasoning(value: str, max_length: int = 220) -> str:
    if len(value) <= max_length:
        return value
    return value[: max_length - 3].rstrip() + "..."
