# AURA Backend (FastAPI)

Zero-cost inference layer for AURA: 4 free Groq keys + 2 free OpenRouter keys in a
rotating pool, in-memory sessions, no database, no local LLM.

## Run

```bash
cd backend
cp .env.example .env      # paste your 4 Groq + 2 OpenRouter free keys
uv sync                   # or: pip install -e .
uvicorn app.main:app --reload --port 8000
```

The frontend expects the backend at `http://localhost:8000` by default. Override with
`VITE_AURA_BACKEND_URL` in the frontend environment.

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `WS /ws/avatar?session_id=…` | Chat, context sync, avatar state |
| `POST /api/stt` | Groq Whisper turbo transcription (key pool) |
| `GET /api/weather?lat=&lon=` | Open-Meteo summary (free, no key) |
| `GET /api/status` | Key-pool health + per-key request counts |
| `GET /api/health` | Liveness |

## Key pool behaviour

1. Round-robin across healthy Groq keys.
2. `429` → cool the key down using `retry-after`, retry on the next key.
3. All Groq keys cooling → fall through to OpenRouter `:free` models.
4. All 6 exhausted → return a friendly "AURA is resting" reply with an `alert` emotion.

Keys are never logged — only a masked `****abcd` suffix.

## Free-tier guarantee

Groq free tier, OpenRouter `:free` models only, Open-Meteo (no key), browser Web Speech
API for TTS, and local MediaPipe/ONNX for vision. Nothing here can incur a charge.
