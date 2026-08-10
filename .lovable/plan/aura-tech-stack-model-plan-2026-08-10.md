# AURA – Tech Stack & Model Plan

## 1. Architecture Overview

AURA is split into two runtimes:

```text
┌─────────────────────────────────────────────────────────────┐
│  Frontend (TanStack Start + React 19 + Tailwind CSS v4)    │
│  - 3D avatar scene (React Three Fiber + Three.js)          │
│  - Webcam / microphone capture                            │
│  - WebSocket client for real-time state sync              │
│  - Chat UI and privacy controls                           │
└──────────────────────────────┬──────────────────────────────┘
                               │ WebSocket + HTTP
┌──────────────────────────────▼──────────────────────────────┐
│  Backend (Python FastAPI)                                     │
│  - LLM orchestration (Groq / OpenRouter)                     │
│  - Speech-to-Text & Text-to-Speech (cloud or local)         │
│  - Computer vision (local ONNX/MediaPipe + optional cloud) │
│  - Context Awareness Engine                                 │
│  - In-memory session state (no database)                    │
└─────────────────────────────────────────────────────────────┘
```

## 2. Frontend Tech Stack


| Layer              | Choice                                                                      | Rationale                                                                     |
| ------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Framework          | TanStack Start (already in project)                                         | Full-stack React 19, SSR/SSG, server routes, typed RPC.                       |
| Styling            | Tailwind CSS v4 (already in project)                                        | Native CSS theme tokens, dark mode support.                                   |
| 3D Avatar          | React Three Fiber (R3F) + Three.js                                          | Declarative 3D scenes in React; fits emotion/animation state binding.         |
| Avatar asset       | ReadyPlayerMe / Mixamo base + custom blendshapes, or a procedural face mesh | Free humanoid base; blendshapes map to emotion states.                        |
| State management   | Zustand                                                                     | Lightweight global store for avatar state, session, context.                  |
| WebSocket client   | Native `WebSocket` or `socket.io-client`                                    | Real-time state push from backend (listening/thinking/speaking).              |
| Audio capture      | Web Audio API + `getUserMedia`                                              | Capture microphone as PCM WAV for STT; avoids fragmented MediaRecorder blobs. |
| Video capture      | `getUserMedia` + `<video>` + canvas frame extraction                        | Send frames to backend vision pipeline.                                       |
| Markdown rendering | `react-markdown`                                                            | LLM responses often include markdown.                                         |


## 3. Backend Tech Stack (FastAPI)


| Layer            | Choice                                        | Rationale                                                               |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| API framework    | FastAPI                                       | Modern Python async API, automatic OpenAPI docs, WebSocket support.     |
| Real-time        | WebSocket endpoint (`/ws/avatar`)             | Push avatar state, emotion, audio chunks to frontend.                   |
| Persistence      | **None** — in-memory Python dicts per session | Keep it simple; AURA is a live streaming experience, nothing is stored. |
| Background work  | `asyncio` tasks                               | No Celery/Redis needed at this scale.                                   |
| Config / secrets | Pydantic Settings + `.env`                    | Keep API keys out of code.                                              |
| Packaging        | `uv` + `pyproject.toml`                       | Fast modern Python dependency management.                               |


## 4. Model Recommendations — Free Tier Only

**Hard constraint: no paid services, no local LLM.** All language reasoning runs on Groq's free tier with OpenRouter free models as failover. Speech and vision use free local/browser models so nothing else costs money.

### 4.1 Key Pool (4 Groq + 2 OpenRouter)

A single provider key hits free-tier rate limits quickly, so the backend uses a rotating key pool with automatic failover.


| Pool                  | Keys        | Env vars                                       |
| --------------------- | ----------- | ---------------------------------------------- |
| Groq (primary)        | 4 free keys | `GROQ_API_KEY_1` … `GROQ_API_KEY_4`            |
| OpenRouter (fallback) | 2 free keys | `OPENROUTER_API_KEY_1`, `OPENROUTER_API_KEY_2` |


Pool manager behaviour (FastAPI service, `app/services/key_pool.py`):

- Round-robin selection across healthy Groq keys for every request.
- On `429` or `rate_limit_exceeded`, mark the key cooling-down (with a timestamp from the `retry-after` header) and immediately retry on the next healthy key.
- When all 4 Groq keys are cooling down, fall through to the OpenRouter pool (free models only).
- When all 6 are exhausted, return a friendly "AURA is resting" response and let the avatar enter an `alert`/`confused` state rather than erroring out.
- Track per-key request counts in memory so free-tier budgets are visible while the server runs (reset on restart).
- Never log key values; only a masked suffix for debugging.

### 4.2 Large Language Model (LLM)


| Provider                  | Model                                                       | Role                                             | Why                                                            |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| **Groq (primary)**        | `llama-3.3-70b-versatile, (use both based on availability)` | Main reasoning + conversation                    | Free tier, very low latency — good for real-time avatar turns. |
| **Groq (fast path)**      | `llama-3.1-8b-instant`                                      | Intent detection, emotion tagging, short replies | Cheapest/fastest; saves the 70b budget for real conversation.  |
| **Groq (vision)**         | `meta-llama/llama-4-scout-17b-16e-instruct`                 | Optional cloud scene description                 | Free multimodal; used only if the user enables cloud vision.   |
| **OpenRouter (fallback)** | ```python google/gemma-4-26b-a4b-it:free ```                | Failover when Groq is rate-limited               | `:free` suffix models cost nothing.                            |


No local LLM (no Ollama). The 6-key pool is the only inference path — Groq first, OpenRouter `:free` models as failover. Only use model ids that exist on the provider's free tier; the pool manager reads the model list from config so ids can be swapped without code changes.

**Structured output:** ask the model for JSON `{ response, emotion, animation_state, speech_required, priority }`. Use Groq's JSON mode / tool calling, and validate with Pydantic. On parse failure, fall back to plain text plus a neutral emotion instead of erroring.

### 4.3 Speech-to-Text (STT) — free


| Option                  | Model                                                   | Notes                                                          |
| ----------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| **Primary**             | Groq `whisper-large-v3-turbo`                           | Free tier, very fast, high accuracy; shares the same key pool. |
| **Local fallback**      | `faster-whisper` (`base` / `small` / `distil-small.en`) | Fully offline via CTranslate2 on CPU; no API cost.             |
| **Zero-setup fallback** | Browser Web Speech API                                  | Free, no backend, but Chrome-dependent.                        |


Default: Groq Whisper turbo through the key pool; auto-switch to local `faster-whisper` when the pool is exhausted or privacy mode is on.

### 4.4 Text-to-Speech (TTS) — free

No paid TTS. Options, in order of preference:


| Option                     | Engine                                                       | Notes                                                |
| -------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| **Primary**                | Browser Web Speech API `speechSynthesis`                     | Zero cost, zero latency, no backend; works offline.  |
| **Better quality (local)** | `piper-tts` with a free ONNX voice (e.g. `en_US-amy-medium`) | Runs in FastAPI, natural-sounding, no API key.       |
| **Optional**               | Kokoro-82M ONNX                                              | Small free open-weight TTS with good expressiveness. |


Lip-sync uses the audio amplitude envelope (Web Audio `AnalyserNode`) rather than a paid viseme API.

### 4.5 Computer Vision — free / local

All vision runs locally. Raw frames never leave the machine unless the user explicitly enables cloud scene description.


| Task                       | Model / Library                              | Notes                                                         |
| -------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| Face detection / landmarks | MediaPipe Face Landmarker (browser WASM)     | Free, runs client-side; drives gaze and attention.            |
| Face blendshapes → emotion | MediaPipe Face Blendshapes (52 coefficients) | Free; maps directly to avatar emotion states.                 |
| Body / pose / gestures     | MediaPipe Pose Landmarker or Hand Landmarker | Free; gesture cues (waving, leaning in).                      |
| Person counting / objects  | YOLO11n via `onnxruntime` (or `ultralytics`) | Free open weights, fast on CPU.                               |
| Scene tags (zero-shot)     | CLIP `ViT-B/32` ONNX                         | Free local tags: "office", "dark room", "laptop", "outdoors". |
| Lighting / day-night       | Canvas mean-luminance heuristic              | No model needed.                                              |
| Optional cloud enrichment  | Groq `llama-4-scout` vision (free tier)      | Only when the user opts in; sends a downscaled JPEG.          |


## 5. Context Awareness Engine

Combine these signals into a context payload sent to the LLM on every turn:


| Signal                        | Source                                          |
| ----------------------------- | ----------------------------------------------- |
| Time / date / day / day-night | System clock + geolocation sun-times            |
| User presence / count         | Vision pipeline (YOLO/MediaPipe)                |
| Scene tags                    | CLIP / vision model                             |
| User emotion                  | Face emotion model                              |
| Conversation history          | In-memory session buffer (last N turns)         |
| Weather (optional)            | Open-Meteo API (free, no API key required)      |
| Microphone state              | Frontend push: idle/listening/thinking/speaking |


The engine formats a concise system prompt context block so the LLM can respond situationally.

## 6. Avatar State Machine

Define a small state machine the backend emits and the frontend 3D avatar consumes:

```text
idle → listening → thinking → speaking → [emotion: happy | surprised | confused | alert | sad | neutral]
```

Each state maps to:

- 3D animation clip (blendshape weights, body gesture)
- Lip-sync phoneme target when `speaking`
- Optional TTS audio stream

## 7. Session Memory (in-memory, no database)

No database. AURA is a live streaming experience, so conversation state lives only for the duration of the session:

- A per-connection Python dict in FastAPI holds `messages`, the latest `context_snapshot`, and the current avatar state.
- Only the last N turns (e.g. 20) are kept and resent to the model each turn — a rolling window keeps the free-tier token budget small.
- Frontend keeps the same transcript in a Zustand store so the chat UI can render it.
- Closing the tab or restarting the server clears everything. Nothing is written to disk.
- If long-term memory is ever wanted later, it can be added as an optional layer without changing this design.

## 8. Privacy Controls

Add user-facing toggles:

- Camera access on/off
- Microphone access on/off
- On-device processing only for camera/mic (disable cloud vision and cloud STT; LLM always runs via Groq/OpenRouter)
- Clear session transcript (nothing is stored on disk anyway)
- Weather/location access on/off

Camera frames and audio are processed on-device by default; only the resulting text/context tags are sent to the LLM. Raw media goes to a cloud model only when the user explicitly opts in.

## 9. Incremental Implementation Phases


| Phase | Deliverable                                                                              |
| ----- | ---------------------------------------------------------------------------------------- |
| 1     | Text-only chat + 3D avatar with idle/neutral state.                                      |
| 2     | Add STT + TTS; avatar enters listening/thinking/speaking states.                         |
| 3     | Add camera + local vision (face detection, person count, scene tags); feed into context. |
| 4     | Add context engine (time, weather, emotion, history) and emotion-driven animations.      |
| 5     | Add rolling session memory, proactive idle prompts, and privacy toggles.                 |
| 6     | Polish: lip-sync, gesture variety, key-pool usage dashboard, deployment packaging.       |


## 10. Required Secrets — all free-tier

Stored in the FastAPI `.env` (never committed). No paid credentials anywhere.

```
GROQ_API_KEY_1=...
GROQ_API_KEY_2=...
GROQ_API_KEY_3=...
GROQ_API_KEY_4=...
OPENROUTER_API_KEY_1=...
OPENROUTER_API_KEY_2=...
```

- Groq keys: free from console.groq.com — create 4 separate accounts/keys so limits don't stack.
- OpenRouter keys: free from openrouter.ai — restricted to `:free` model ids, so no spend is possible.
- Weather uses **Open-Meteo** (no key, free, unlimited for personal use) instead of OpenWeatherMap.
- TTS/STT fallbacks and all vision models are local — no keys needed.

## 11. Cost Guarantee


| Component                                           | Cost |
| --------------------------------------------------- | ---- |
| LLM (Groq free tier × 4 keys)                       | Free |
| LLM fallback (OpenRouter `:free` models × 2 keys)   | Free |
| STT (Groq Whisper turbo / local faster-whisper)     | Free |
| TTS (Web Speech API / piper-tts local)              | Free |
| Vision (MediaPipe, YOLO11n, CLIP — all local)       | Free |
| Weather (Open-Meteo)                                | Free |
| 3D avatar assets (ReadyPlayerMe / Mixamo free tier) | Free |
| Storage (in-memory only, no database)               | Free |


## 12. Next Step

Approve this plan to proceed with Phase 1: scaffold the FastAPI backend with the 6-key rotating pool, wire the TanStack frontend to Groq, and render the first 3D avatar scene.