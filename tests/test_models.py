import pytest
from sqlmodel import Session, SQLModel, create_engine, select

from app.models import Interview, InterviewStatus, InvalidStateTransitionError

# Setup in-memory SQLite engine for tests
TEST_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(name="db_session")
def db_session_fixture():
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)

def test_interview_crud_operations(db_session: Session):
    # 1. Create (Insert)
    interview = Interview(
        recording_url="http://example.com/recording.mp3",
        status=InterviewStatus.RECEBIDA
    )
    db_session.add(interview)
    db_session.commit()
    db_session.refresh(interview)

    assert interview.id is not None
    assert interview.recording_url == "http://example.com/recording.mp3"
    assert interview.status == InterviewStatus.RECEBIDA
    assert interview.created_at is not None
    assert interview.updated_at is not None
    assert interview.retry_count == 0

    # 2. Read (Select)
    statement = select(Interview).where(Interview.id == interview.id)
    retrieved = db_session.exec(statement).first()
    assert retrieved is not None
    assert retrieved.recording_url == "http://example.com/recording.mp3"

    # 3. Update (Transition state and save)
    retrieved.transition_to(InterviewStatus.TRANSCREVENDO)
    db_session.add(retrieved)
    db_session.commit()
    db_session.refresh(retrieved)

    assert retrieved.status == InterviewStatus.TRANSCREVENDO
    assert retrieved.updated_at >= retrieved.created_at

    # 4. Delete
    db_session.delete(retrieved)
    db_session.commit()

    deleted = db_session.exec(statement).first()
    assert deleted is None

def test_valid_state_transitions():
    interview = Interview(recording_url="http://example.com/recording.mp3")
    assert interview.status == InterviewStatus.RECEBIDA

    # Valid flow
    interview.transition_to(InterviewStatus.TRANSCREVENDO)
    assert interview.status == InterviewStatus.TRANSCREVENDO

    interview.transition_to(InterviewStatus.DIARIZANDO)
    assert interview.status == InterviewStatus.DIARIZANDO

    interview.transition_to(InterviewStatus.PONTUANDO)
    assert interview.status == InterviewStatus.PONTUANDO

    interview.transition_to(InterviewStatus.AGUARDANDO_APROVACAO)
    assert interview.status == InterviewStatus.AGUARDANDO_APROVACAO

    # Can transition to APROVADA
    interview_app = Interview(recording_url="...", status=InterviewStatus.AGUARDANDO_APROVACAO)
    interview_app.transition_to(InterviewStatus.APROVADA)
    assert interview_app.status == InterviewStatus.APROVADA

    # Can transition to REJEITADA
    interview_rej = Interview(recording_url="...", status=InterviewStatus.AGUARDANDO_APROVACAO)
    interview_rej.transition_to(InterviewStatus.REJEITADA)
    assert interview_rej.status == InterviewStatus.REJEITADA

def test_failure_state_transitions():
    # Any processing state can fail
    for start in (
        InterviewStatus.RECEBIDA,
        InterviewStatus.TRANSCREVENDO,
        InterviewStatus.DIARIZANDO,
        InterviewStatus.PONTUANDO,
    ):
        interview = Interview(recording_url="...", status=start)
        interview.transition_to(InterviewStatus.FALHOU)
        assert interview.status == InterviewStatus.FALHOU

    # FALHOU can resume into any processing state
    interview = Interview(recording_url="...", status=InterviewStatus.FALHOU)
    interview.transition_to(InterviewStatus.PONTUANDO)
    assert interview.status == InterviewStatus.PONTUANDO

    # But a decision state cannot fail
    interview = Interview(recording_url="...", status=InterviewStatus.AGUARDANDO_APROVACAO)
    with pytest.raises(InvalidStateTransitionError):
        interview.transition_to(InterviewStatus.FALHOU)

def test_invalid_state_transitions():
    # 1. Direct from RECEBIDA to APROVADA
    interview = Interview(recording_url="...")
    with pytest.raises(InvalidStateTransitionError):
        interview.transition_to(InterviewStatus.APROVADA)

    # 2. From DIARIZANDO to REJEITADA
    interview = Interview(recording_url="...")
    interview.transition_to(InterviewStatus.TRANSCREVENDO)
    interview.transition_to(InterviewStatus.DIARIZANDO)
    with pytest.raises(InvalidStateTransitionError):
        interview.transition_to(InterviewStatus.REJEITADA)

    # 3. From APROVADA to any other state
    interview = Interview(recording_url="...", status=InterviewStatus.AGUARDANDO_APROVACAO)
    interview.transition_to(InterviewStatus.APROVADA)
    with pytest.raises(InvalidStateTransitionError):
        interview.transition_to(InterviewStatus.TRANSCREVENDO)
