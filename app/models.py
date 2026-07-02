import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, DateTime, String
from sqlalchemy.dialects.postgresql import JSONB

# JSON column that upgrades to JSONB on PostgreSQL (indexable, binary storage)
# while remaining plain JSON on SQLite (tests).
JSONVariant = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class InterviewStatus(str, Enum):
    RECEBIDA = "recebida"
    TRANSCREVENDO = "transcrevendo"
    DIARIZANDO = "diarizando"
    PONTUANDO = "pontuando"
    AGUARDANDO_APROVACAO = "aguardando_aprovacao"
    APROVADA = "aprovada"
    REJEITADA = "rejeitada"
    FALHOU = "falhou"


class InvalidStateTransitionError(ValueError):
    """Exception raised when an invalid state transition is attempted."""
    pass


# Define valid state transitions. FALHOU is reachable from any processing
# state and can transition back into a processing state for reprocessing.
VALID_TRANSITIONS = {
    InterviewStatus.RECEBIDA: {InterviewStatus.TRANSCREVENDO, InterviewStatus.FALHOU},
    InterviewStatus.TRANSCREVENDO: {InterviewStatus.DIARIZANDO, InterviewStatus.FALHOU},
    InterviewStatus.DIARIZANDO: {InterviewStatus.PONTUANDO, InterviewStatus.FALHOU},
    InterviewStatus.PONTUANDO: {InterviewStatus.AGUARDANDO_APROVACAO, InterviewStatus.FALHOU},
    InterviewStatus.AGUARDANDO_APROVACAO: {InterviewStatus.APROVADA, InterviewStatus.REJEITADA},
    InterviewStatus.APROVADA: set(),
    InterviewStatus.REJEITADA: set(),
    InterviewStatus.FALHOU: {
        InterviewStatus.TRANSCREVENDO,
        InterviewStatus.DIARIZANDO,
        InterviewStatus.PONTUANDO,
    },
}

TERMINAL_STATUSES = {InterviewStatus.APROVADA, InterviewStatus.REJEITADA}


class Interview(SQLModel, table=True):
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        nullable=False
    )
    recording_url: str = Field(nullable=False)
    status: InterviewStatus = Field(
        default=InterviewStatus.RECEBIDA,
        nullable=False,
        index=True
    )

    transcription_raw: Optional[Any] = Field(
        default=None,
        sa_column=Column(JSONVariant, nullable=True)
    )
    diarization_raw: Optional[Any] = Field(
        default=None,
        sa_column=Column(JSONVariant, nullable=True)
    )
    scorecard: Optional[Any] = Field(
        default=None,
        sa_column=Column(JSONVariant, nullable=True)
    )

    job_id: Optional[str] = Field(
        default=None,
        nullable=True,
        index=True
    )
    # Idempotency key supplied by the recording provider; a retried webhook
    # with the same external_id returns the existing interview.
    external_id: Optional[str] = Field(
        default=None,
        sa_column=Column(String, nullable=True, unique=True, index=True)
    )
    error_log: Optional[str] = Field(
        default=None,
        nullable=True
    )
    retry_count: int = Field(default=0, nullable=False)
    # One-time token used by notification action links (approve/reject).
    approval_token: Optional[str] = Field(
        default=None,
        nullable=True
    )

    created_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    updated_at: datetime = Field(
        default_factory=utcnow,
        sa_column=Column(DateTime(timezone=True), nullable=False, onupdate=utcnow)
    )

    def transition_to(self, target_status: InterviewStatus):
        """
        Transitions the interview to a target status, raising InvalidStateTransitionError
        if the transition is not allowed.
        """
        if target_status == self.status:
            return  # No-op

        allowed_next = VALID_TRANSITIONS.get(self.status, set())
        if target_status not in allowed_next:
            raise InvalidStateTransitionError(
                f"Cannot transition interview from '{self.status.value}' to '{target_status.value}'"
            )

        self.status = target_status
        self.updated_at = utcnow()
