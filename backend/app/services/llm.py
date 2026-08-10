"""LLM orchestration across the Groq + OpenRouter free-tier key pools.

Groq first (4 keys, round-robin). On 429/5xx the key is cooled down and the next
one is tried. When all Groq keys are cooling, we fall through to OpenRouter's
":free" models (2 keys). When all 6 are exhausted, AURA "rests" gracefully.
"""

from __future__ import annotations

import json
import logging

import httpx

from app.config import Settings
from app.schemas import AuraReply, SceneContext
from app.services.context_engine import build_system_prompt
from app.services.key_pool import KeyPool

log = logging.getLogger("aura.llm")

RESTING = AuraReply(
    response=(
        "I'm resting for a moment — all my free-tier connections are rate limited. "
        "Give me a minute and ask me again."
    ),
    emotion="alert",
    animation_state="idle",
    speech_required=True,
    priority="high",
)


class PoolExhausted(Exception):
    pass


class LLMService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.groq = KeyPool.build("groq", settings.groq_keys, settings.key_cooldown_seconds)
        self.openrouter = KeyPool.build(
            "openrouter", settings.openrouter_keys, settings.key_cooldown_seconds
        )
        self._client = httpx.AsyncClient(timeout=settings.request_timeout_seconds)

    async def aclose(self) -> None:
        await self._client.aclose()

    # ------------------------------------------------------------------ status
    def status(self) -> dict[str, object]:
        return {
            "groq_keys": len(self.groq),
            "openrouter_keys": len(self.openrouter),
            "groq_healthy": self.groq.has_healthy_key,
            "openrouter_healthy": self.openrouter.has_healthy_key,
            "keys": self.groq.stats() + self.openrouter.stats(),
        }

    # ------------------------------------------------------------------- chat
    async def respond(
        self,
        history: list[dict[str, str]],
        context: SceneContext,
        fast: bool = False,
    ) -> AuraReply:
        messages = [{"role": "system", "content": build_system_prompt(context)}, *history]
        try:
            raw = await self._complete(messages, fast=fast)
        except PoolExhausted:
            return RESTING
        return self._parse(raw)

    async def _complete(self, messages: list[dict[str, str]], fast: bool) -> str:
        groq_model = (
            self.settings.groq_fast_model if fast else self.settings.groq_primary_model
        )
        attempts: list[tuple[KeyPool, str, str, dict[str, str]]] = []

        for _ in range(len(self.groq)):
            attempts.append((self.groq, self.settings.groq_base_url, groq_model, {}))
        for model in self.settings.openrouter_model_list:
            for _ in range(len(self.openrouter)):
                attempts.append(
                    (
                        self.openrouter,
                        self.settings.openrouter_base_url,
                        model,
                        {
                            "HTTP-Referer": "http://localhost:8080",
                            "X-Title": "AURA",
                        },
                    )
                )

        last_error: str | None = None
        for pool, base_url, model, extra_headers in attempts:
            slot = await pool.acquire()
            if slot is None:
                continue
            headers = {
                "Authorization": f"Bearer {slot.key}",
                "Content-Type": "application/json",
                **extra_headers,
            }
            body = {
                "model": model,
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 700,
                "response_format": {"type": "json_object"},
            }
            try:
                res = await self._client.post(
                    f"{base_url}/chat/completions", headers=headers, json=body
                )
            except httpx.HTTPError as exc:
                last_error = str(exc)
                pool.cool_down(slot, retry_after=5)
                continue

            if res.status_code == 429:
                retry_after = _retry_after(res)
                log.warning("%s key %s rate limited", pool.provider, slot.masked)
                pool.cool_down(slot, retry_after=retry_after)
                continue
            if res.status_code >= 500:
                last_error = f"{pool.provider} {res.status_code}"
                pool.cool_down(slot, retry_after=10)
                continue
            if res.status_code >= 400:
                last_error = f"{pool.provider} {res.status_code}: {res.text[:200]}"
                log.error("%s key %s rejected: %s", pool.provider, slot.masked, last_error)
                pool.cool_down(slot, retry_after=30)
                continue

            data = res.json()
            return data["choices"][0]["message"]["content"] or ""

        log.error("all key pools exhausted (last error: %s)", last_error)
        raise PoolExhausted(last_error or "no keys configured")

    # ------------------------------------------------------------------ parse
    @staticmethod
    def _parse(raw: str) -> AuraReply:
        text = raw.strip()
        if text.startswith("```"):
            text = text.strip("`")
            text = text.split("\n", 1)[-1] if "\n" in text else text
        try:
            payload = json.loads(text)
            if isinstance(payload, dict) and payload.get("response"):
                return AuraReply.model_validate(payload)
        except Exception:
            pass
        # Graceful degradation: plain text + neutral emotion beats an error.
        return AuraReply(response=raw.strip() or "...", emotion="neutral")

    # -------------------------------------------------------------------- stt
    async def transcribe(self, audio: bytes, filename: str, mime: str) -> str:
        """Groq Whisper turbo through the same key pool (free tier)."""
        for _ in range(max(1, len(self.groq))):
            slot = await self.groq.acquire()
            if slot is None:
                break
            try:
                res = await self._client.post(
                    f"{self.settings.groq_base_url}/audio/transcriptions",
                    headers={"Authorization": f"Bearer {slot.key}"},
                    files={"file": (filename, audio, mime or "audio/wav")},
                    data={"model": self.settings.groq_stt_model, "response_format": "json"},
                )
            except httpx.HTTPError:
                self.groq.cool_down(slot, retry_after=5)
                continue
            if res.status_code == 429:
                self.groq.cool_down(slot, retry_after=_retry_after(res))
                continue
            if res.status_code >= 400:
                self.groq.cool_down(slot, retry_after=15)
                continue
            return (res.json().get("text") or "").strip()
        raise PoolExhausted("speech-to-text pool exhausted")


def _retry_after(res: httpx.Response) -> float | None:
    header = res.headers.get("retry-after")
    if not header:
        return None
    try:
        return float(header)
    except ValueError:
        return None
