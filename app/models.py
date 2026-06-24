import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import JSON

class InterviewStatus(str, Enum):
    RECEBIDA = "recebida"
    TRANSCREVENDO = "transcrevendo"
    DIARIZADA = "diarizada"
    PONTUANDO = "pontuando"
    AGUARDANDO_APROVACAO = "aguardando_aprovacao"
    APROVADA = "aprovada"
    REJEITADA = "rejeitada"

class InvalidStateTransitionError(ValueError):
    """Exception raised when an invalid state transition is attempted."""
    pass

# Define valid state transitions
VALID_TRANSITIONS = {
    InterviewStatus.RECEBIDA: {InterviewStatus.TRANSCREVENDO},
    InterviewStatus.TRANSCREVENDO: {InterviewStatus.DIARIZADA},
    InterviewStatus.DIARIZADA: {InterviewStatus.PONTUANDO},
    InterviewStatus.PONTUANDO: {InterviewStatus.AGUARDANDO_APROVACAO},
    InterviewStatus.AGUARDANDO_APROVACAO: {InterviewStatus.APROVADA, InterviewStatus.REJEITADA},
    InterviewStatus.APROVADA: set(),
    InterviewStatus.REJEITADA: set(),
}

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
        nullable=False
    )
    
    # We use sa_column=Column(JSON) to be compatible with SQLite (tests) and PostgreSQL
    transcription_raw: Optional[Any] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True)
    )
    diarization_raw: Optional[Any] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True)
    )
    scorecard: Optional[Any] = Field(
        default=None,
        sa_column=Column(JSON, nullable=True)
    )
    
    job_id: Optional[str] = Field(
        default=None,
        nullable=True
    )
    error_log: Optional[str] = Field(
        default=None,
        nullable=True
    )
    
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False
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
        self.updated_at = datetime.now(timezone.utc)
