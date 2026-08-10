"""Rotating API key pool with cooldown + automatic failover.

Free tiers rate-limit aggressively, so AURA spreads load across 4 Groq keys and
falls through to 2 OpenRouter keys. All state is in memory — no database.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field


def mask(key: str) -> str:
    """Never log a raw key — only a short masked suffix."""
    if len(key) <= 4:
        return "****"
    return f"****{key[-4:]}"


@dataclass
class KeySlot:
    key: str
    provider: str
    requests: int = 0
    failures: int = 0
    cooldown_until: float = 0.0

    @property
    def healthy(self) -> bool:
        return time.monotonic() >= self.cooldown_until

    @property
    def masked(self) -> str:
        return mask(self.key)


@dataclass
class KeyPool:
    """Round-robin pool over one provider's keys."""

    provider: str
    slots: list[KeySlot] = field(default_factory=list)
    default_cooldown: float = 60.0
    _cursor: int = 0
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    @classmethod
    def build(cls, provider: str, keys: list[str], cooldown: float) -> "KeyPool":
        return cls(
            provider=provider,
            slots=[KeySlot(key=key, provider=provider) for key in keys],
            default_cooldown=cooldown,
        )

    def __len__(self) -> int:
        return len(self.slots)

    @property
    def has_healthy_key(self) -> bool:
        return any(slot.healthy for slot in self.slots)

    async def acquire(self) -> KeySlot | None:
        """Return the next healthy key, round-robin. None if all are cooling down."""
        async with self._lock:
            total = len(self.slots)
            for offset in range(total):
                slot = self.slots[(self._cursor + offset) % total]
                if slot.healthy:
                    self._cursor = (self._cursor + offset + 1) % total
                    slot.requests += 1
                    return slot
            return None

    def cool_down(self, slot: KeySlot, retry_after: float | None = None) -> None:
        seconds = retry_after if retry_after and retry_after > 0 else self.default_cooldown
        slot.cooldown_until = time.monotonic() + seconds
        slot.failures += 1

    def stats(self) -> list[dict[str, object]]:
        now = time.monotonic()
        return [
            {
                "provider": slot.provider,
                "key": slot.masked,
                "requests": slot.requests,
                "failures": slot.failures,
                "healthy": slot.healthy,
                "cooldown_remaining": max(0, round(slot.cooldown_until - now)),
            }
            for slot in self.slots
        ]
