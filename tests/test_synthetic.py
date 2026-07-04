import json
import os
import tempfile
import pytest
import numpy as np
import soundfile as sf
from unittest.mock import patch

from app.schemas import (
    JobDescription,
    CompetencyFramework,
    EvaluationChecklist,
    DialogueScript
)
from scripts.generate_synthetic import (
    get_sample_job_description,
    get_sample_competency_framework,
    get_sample_evaluation_checklist,
    get_sample_dialogue_script,
    generate_interview_audio
)

def test_json_schemas_and_sample_data():
    # 1. Job Description
    job_desc = get_sample_job_description()
    assert isinstance(job_desc, JobDescription)
    assert job_desc.title == "Desenvolvedor Python Pleno"
    assert len(job_desc.requirements) > 0
    
    # 2. Competency Framework
    comp_framework = get_sample_competency_framework()
    assert isinstance(comp_framework, CompetencyFramework)
    assert len(comp_framework.competencies) == 4
    assert comp_framework.competencies[0].name == "Comunicação e Code-switching"
    assert 1 in comp_framework.competencies[0].bars_levels
    assert 5 in comp_framework.competencies[0].bars_levels
    
    # 3. Evaluation Checklist
    checklist = get_sample_evaluation_checklist()
    assert isinstance(checklist, EvaluationChecklist)
    assert len(checklist.items) > 0

    # 4. Dialogue Script
    dialogue = get_sample_dialogue_script()
    assert isinstance(dialogue, DialogueScript)
    assert len(dialogue.turns) > 0
    assert dialogue.turns[0].speaker == "Entrevistador"
    assert dialogue.turns[1].speaker == "Candidato"

def test_all_profiles_are_complete_and_realistic():
    from scripts.interview_profiles import PROFILES

    assert set(PROFILES) == {"python_pleno", "dados_senior", "frontend_junior"}
    # The dataset covers the whole scoring spectrum for real testing
    outcomes = {p.expected_outcome for p in PROFILES.values()}
    assert outcomes == {"Aprovado", "Próxima Etapa", "Rejeitado"}

    for profile in PROFILES.values():
        # Substantial dialogues, not toy scripts
        assert len(profile.dialogue.turns) >= 16, profile.prefix
        assert {t.speaker for t in profile.dialogue.turns} == {"Entrevistador", "Candidato"}
        assert profile.dialogue.turns[0].speaker == "Entrevistador"

        # Full BARS anchors for every competency
        assert len(profile.competencies.competencies) >= 4, profile.prefix
        for comp in profile.competencies.competencies:
            assert set(comp.bars_levels.keys()) == {1, 2, 3, 4, 5}, comp.name
            assert all(len(desc) > 20 for desc in comp.bars_levels.values()), comp.name

        assert len(profile.checklist.items) >= 4, profile.prefix
        assert len(profile.job.requirements) >= 5, profile.prefix


def test_generate_profile_files_roundtrip(tmp_path):
    from scripts.generate_synthetic import generate_profile_files
    from scripts.interview_profiles import PROFILES

    profile = PROFILES["dados_senior"]
    generate_profile_files(profile, str(tmp_path))

    with open(tmp_path / "job_dados_senior.json", encoding="utf-8") as f:
        JobDescription.model_validate(json.load(f))
    with open(tmp_path / "competency_dados_senior.json", encoding="utf-8") as f:
        CompetencyFramework.model_validate(json.load(f))
    with open(tmp_path / "checklist_dados_senior.json", encoding="utf-8") as f:
        EvaluationChecklist.model_validate(json.load(f))
    with open(tmp_path / "interview_dados_senior.json", encoding="utf-8") as f:
        DialogueScript.model_validate(json.load(f))


@pytest.mark.asyncio
async def test_generate_interview_audio_concatenation():
    # Mock synthesize_turn to write a dummy WAV file locally (soundfile can read WAV directly offline)
    # this avoids network calls to Microsoft's Edge TTS servers during tests.
    async def dummy_synthesize(text: str, voice: str, filepath: str):
        # Write a dummy 0.1s audio of zeroes at 24000Hz (2400 samples)
        samplerate = 24000
        dummy_data = np.zeros(2400)
        sf.write(filepath, dummy_data, samplerate, format="WAV")

    script = DialogueScript(
        turns=[
            {"speaker": "Entrevistador", "text": "Turn one"},
            {"speaker": "Candidato", "text": "Turn two"}
        ]
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        output_wav = os.path.join(tmpdir, "test_output.wav")
        
        # Patch the synthesize_turn function
        with patch("scripts.generate_synthetic.synthesize_turn", side_effect=dummy_synthesize):
            await generate_interview_audio(
                script=script,
                interviewer_voice="dummy-voice-1",
                candidate_voice="dummy-voice-2",
                output_wav_path=output_wav
            )
            
        # Verify the output WAV file exists
        assert os.path.exists(output_wav)
        
        # Read output WAV and verify it has expected properties
        data, sr = sf.read(output_wav)
        assert sr == 24000
        assert len(data) > 0
        
        # Two turns of 0.1s (2400 samples each) + one silence of 0.5s (12000 samples)
        # Total = 2400 + 12000 + 2400 = 16800 samples
        expected_samples = 2400 + int(0.5 * 24000) + 2400
        assert len(data) == expected_samples
