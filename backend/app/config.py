"""Runtime configuration for the AURA backend.

Everything here is free-tier only. No paid services, no local LLM, no database.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Groq free-tier key pool (primary inference path) ---
    groq_api_key_1: str = ""
    groq_api_key_2: str = ""
    groq_api_key_3: str = ""
    groq_api_key_4: str = ""

    # --- OpenRouter free-tier key pool (failover only) ---
    openrouter_api_key_1: str = ""
    openrouter_api_key_2: str = ""

    # --- Models (free tier ids only; swap via env without touching code) ---
    groq_primary_model: str = "llama-3.3-70b-versatile"
    groq_fast_model: str = "llama-3.1-8b-instant"
    groq_vision_model: str = "meta-llama/llama-4-scout-17b-16e-instruct"
    groq_stt_model: str = "whisper-large-v3-turbo"
    openrouter_models: str = (
        "meta-llama/llama-3.3-70b-instruct:free,google/gemma-3-27b-it:free"
    )

    # --- Endpoints ---
    groq_base_url: str = "https://api.groq.com/openai/v1"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # --- App behaviour ---
    allowed_origins: str = (
        "http://localhost:8080,http://127.0.0.1:8080,"
        "http://localhost:3000,http://localhost:5173"
    )
    max_history_turns: int = 20
    request_timeout_seconds: float = 60.0
    key_cooldown_seconds: float = 60.0

    @property
    def groq_keys(self) -> list[str]:
        raw = [
            self.groq_api_key_1,
            self.groq_api_key_2,
            self.groq_api_key_3,
            self.groq_api_key_4,
        ]
        return [key.strip() for key in raw if key and key.strip()]

    @property
    def openrouter_keys(self) -> list[str]:
        raw = [self.openrouter_api_key_1, self.openrouter_api_key_2]
        return [key.strip() for key in raw if key and key.strip()]

    @property
    def openrouter_model_list(self) -> list[str]:
        models = [m.strip() for m in self.openrouter_models.split(",")]
        # Guard the "no paid" constraint: only ever request ":free" ids.
        return [m for m in models if m and m.endswith(":free")]

    @property
    def origin_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
