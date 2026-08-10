"""Wire contract shared with the AURA frontend."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

AvatarState = Literal["idle", "listening", "thinking", "speaking"]
Emotion = Literal["neutral", "happy", "surprised", "confused", "alert", "sad"]


class SceneContext(BaseModel):
    """Local vision + client signals. Frames never leave the browser."""

    people: int = 0
    face_present: bool = False
    user_emotion: Emotion = "neutral"
    scene_tags: list[str] = Field(default_factory=list)
    luminance: float | None = None
    local_time: str | None = None
    day_part: str | None = None
    weather: str | None = None
    mic_state: str | None = None


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    emotion: Emotion = "neutral"


class AuraReply(BaseModel):
    """Structured output requested from the LLM."""

    response: str
    emotion: Emotion = "neutral"
    animation_state: AvatarState = "speaking"
    speech_required: bool = True
    priority: Literal["low", "normal", "high"] = "normal"
