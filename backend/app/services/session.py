"""In-memory session state. Nothing is persisted — AURA is a live stream."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.schemas import AvatarState, ChatTurn, SceneContext


@dataclass
class Session:
    session_id: str
    max_turns: int = 20
    messages: list[ChatTurn] = field(default_factory=list)
    context: SceneContext = field(default_factory=SceneContext)
    avatar_state: AvatarState = "idle"

    def add_turn(self, turn: ChatTurn) -> None:
        self.messages.append(turn)
        # Rolling window keeps the free-tier token budget tiny.
        overflow = len(self.messages) - self.max_turns
        if overflow > 0:
            del self.messages[:overflow]

    def history_payload(self) -> list[dict[str, str]]:
        return [{"role": t.role, "content": t.content} for t in self.messages]

    def clear(self) -> None:
        self.messages.clear()


class SessionRegistry:
    """Plain dict registry — dies with the process, by design."""

    def __init__(self, max_turns: int = 20) -> None:
        self._sessions: dict[str, Session] = {}
        self._max_turns = max_turns

    def get(self, session_id: str) -> Session:
        session = self._sessions.get(session_id)
        if session is None:
            session = Session(session_id=session_id, max_turns=self._max_turns)
            self._sessions[session_id] = session
        return session

    def drop(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    @property
    def active(self) -> int:
        return len(self._sessions)
