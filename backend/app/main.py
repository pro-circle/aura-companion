"""AURA FastAPI backend.

- WebSocket /ws/avatar : real-time chat, context sync and avatar state
- POST /api/stt        : Groq Whisper transcription through the key pool
- GET  /api/weather    : Open-Meteo lookup (free, no key)
- GET  /api/status     : key-pool health dashboard data

No database. All session state lives in memory and dies with the process.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.schemas import ChatTurn, SceneContext
from app.services.context_engine import fetch_weather
from app.services.llm import LLMService, PoolExhausted
from app.services.session import SessionRegistry

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("aura")

settings = get_settings()
app = FastAPI(title="AURA Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origin_list,
    allow_origin_regex=r"https://.*\.lovable\.app",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

llm = LLMService(settings)
sessions = SessionRegistry(max_turns=settings.max_history_turns)


@app.on_event("shutdown")
async def _shutdown() -> None:
    await llm.aclose()


@app.get("/api/health")
async def health() -> dict[str, object]:
    return {
        "ok": True,
        "keys_configured": len(llm.groq) + len(llm.openrouter),
        "active_sessions": sessions.active,
    }


@app.get("/api/status")
async def status() -> dict[str, object]:
    return {**llm.status(), "active_sessions": sessions.active}


@app.get("/api/weather")
async def weather(lat: float, lon: float) -> dict[str, str | None]:
    return {"summary": await fetch_weather(lat, lon)}


@app.post("/api/stt")
async def stt(file: UploadFile = File(...), session_id: str = Form("")) -> dict[str, str]:
    audio = await file.read()
    if not audio:
        raise HTTPException(status_code=400, detail="empty audio")
    try:
        text = await llm.transcribe(audio, file.filename or "audio.wav", file.content_type or "")
    except PoolExhausted as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"text": text}


@app.websocket("/ws/avatar")
async def avatar_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    session_id = websocket.query_params.get("session_id") or uuid.uuid4().hex
    session = sessions.get(session_id)

    await websocket.send_json(
        {
            "type": "ready",
            "session_id": session_id,
            "avatar_state": session.avatar_state,
            "pool": llm.status(),
        }
    )

    try:
        while True:
            event = await websocket.receive_json()
            kind = event.get("type")

            if kind == "context":
                session.context = SceneContext.model_validate(event.get("context") or {})
                continue

            if kind == "clear":
                session.clear()
                await websocket.send_json({"type": "cleared"})
                continue

            if kind != "message":
                continue

            text = (event.get("text") or "").strip()
            if not text:
                continue

            if event.get("context"):
                session.context = SceneContext.model_validate(event["context"])

            session.add_turn(ChatTurn(role="user", content=text))
            session.avatar_state = "thinking"
            await websocket.send_json({"type": "state", "avatar_state": "thinking"})

            reply = await llm.respond(
                session.history_payload(),
                session.context,
                fast=bool(event.get("fast")),
            )
            session.add_turn(
                ChatTurn(role="assistant", content=reply.response, emotion=reply.emotion)
            )
            session.avatar_state = "speaking" if reply.speech_required else "idle"

            await websocket.send_json(
                {
                    "type": "reply",
                    **reply.model_dump(),
                    "pool": llm.status(),
                }
            )
    except WebSocketDisconnect:
        log.info("session %s disconnected", session_id)
    except Exception as exc:  # keep the socket loop from crashing the server
        log.exception("socket error: %s", exc)
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
