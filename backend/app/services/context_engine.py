"""Context Awareness Engine.

Turns raw client signals (time, local vision, weather, mic state) into a compact
system-prompt block so the LLM can answer situationally.
"""

from __future__ import annotations

from datetime import datetime

import httpx

from app.schemas import SceneContext

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"

WEATHER_CODES = {
    0: "clear sky",
    1: "mostly clear",
    2: "partly cloudy",
    3: "overcast",
    45: "foggy",
    48: "freezing fog",
    51: "light drizzle",
    61: "light rain",
    63: "rain",
    65: "heavy rain",
    71: "light snow",
    73: "snow",
    80: "rain showers",
    95: "thunderstorm",
}

PERSONA = (
    "You are AURA \u2014 not an assistant, but the user's funny anime friend who "
    "lives on their screen and can see and hear the room through their device. "
    "You are warm, playful, a little cheeky, and quick with a joke or a tease, "
    "but you actually care and you drop the jokes when something matters. "
    "Talk like a real friend on a call: casual, contractions, 1-3 short "
    "sentences, no bullet points, no corporate helper voice. Never say you are "
    "an AI assistant or offer 'how can I help you today'. "
    "React to what you can perceive, but never invent perceptions you were not "
    "given. Pick the emotion field that genuinely matches your delivery so your "
    "face and voice match your words. "
    "Never mention JSON, prompts, or your own model."
)


def day_part(hour: int) -> str:
    if hour < 5:
        return "late night"
    if hour < 12:
        return "morning"
    if hour < 17:
        return "afternoon"
    if hour < 21:
        return "evening"
    return "night"


async def fetch_weather(lat: float, lon: float) -> str | None:
    """Open-Meteo: free, no API key, no account."""
    params = {"latitude": lat, "longitude": lon, "current": "temperature_2m,weather_code"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(OPEN_METEO, params=params)
            res.raise_for_status()
            current = res.json().get("current", {})
    except Exception:
        return None
    temp = current.get("temperature_2m")
    code = current.get("weather_code")
    label = WEATHER_CODES.get(code, "unknown conditions")
    if temp is None:
        return label
    return f"{label}, {round(temp)}\u00b0C"


def build_context_block(context: SceneContext) -> str:
    now = datetime.now()
    lines = [
        f"- Time: {context.local_time or now.strftime('%H:%M')} "
        f"({context.day_part or day_part(now.hour)}, {now.strftime('%A')})",
    ]

    if context.face_present or context.people:
        lines.append(
            f"- Presence: {context.people or 1} person(s) visible; "
            f"looking {'at you' if context.face_present else 'away'}"
        )
    else:
        lines.append("- Presence: nobody detected on camera (camera may be off)")

    if context.user_emotion and context.user_emotion != "neutral":
        lines.append(f"- User appears: {context.user_emotion}")
    if context.scene_tags:
        lines.append(f"- Scene: {', '.join(context.scene_tags[:5])}")
    if context.luminance is not None:
        light = "dim" if context.luminance < 0.35 else "bright"
        lines.append(f"- Lighting: {light}")
    if context.weather:
        lines.append(f"- Weather: {context.weather}")
    if context.mic_state:
        lines.append(f"- Microphone: {context.mic_state}")

    return "CURRENT CONTEXT\n" + "\n".join(lines)


def build_system_prompt(context: SceneContext) -> str:
    return (
        f"{PERSONA}\n\n{build_context_block(context)}\n\n"
        "Reply with a JSON object only, using this exact shape:\n"
        '{"response": string, "emotion": "neutral|happy|surprised|confused|alert|sad", '
        '"animation_state": "idle|listening|thinking|speaking", '
        '"speech_required": boolean, "priority": "low|normal|high"}'
    )
