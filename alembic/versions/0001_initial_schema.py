"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-07-02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# JSONB on PostgreSQL (indexable, binary storage), plain JSON elsewhere.
JSONVariant = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

STATUS_ENUM = sa.Enum(
    "RECEBIDA",
    "TRANSCREVENDO",
    "DIARIZANDO",
    "PONTUANDO",
    "AGUARDANDO_APROVACAO",
    "APROVADA",
    "REJEITADA",
    "FALHOU",
    name="interviewstatus",
)


def upgrade() -> None:
    op.create_table(
        "interview",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("recording_url", sa.String(), nullable=False),
        sa.Column("status", STATUS_ENUM, nullable=False),
        sa.Column("transcription_raw", JSONVariant, nullable=True),
        sa.Column("diarization_raw", JSONVariant, nullable=True),
        sa.Column("scorecard", JSONVariant, nullable=True),
        sa.Column("job_id", sa.String(), nullable=True),
        sa.Column("external_id", sa.String(), nullable=True),
        sa.Column("error_log", sa.String(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("approval_token", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_id"),
    )
    op.create_index(op.f("ix_interview_id"), "interview", ["id"])
    op.create_index(op.f("ix_interview_status"), "interview", ["status"])
    op.create_index(op.f("ix_interview_job_id"), "interview", ["job_id"])
    op.create_index(op.f("ix_interview_external_id"), "interview", ["external_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_interview_external_id"), table_name="interview")
    op.drop_index(op.f("ix_interview_job_id"), table_name="interview")
    op.drop_index(op.f("ix_interview_status"), table_name="interview")
    op.drop_index(op.f("ix_interview_id"), table_name="interview")
    op.drop_table("interview")
    STATUS_ENUM.drop(op.get_bind(), checkfirst=True)
