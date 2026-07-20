import json
import logging
from pathlib import Path
from typing import Any, Literal

from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError
from rapidfuzz import fuzz

from app.config import settings
from app.text_utils import clean_text

logger = logging.getLogger(__name__)


# Pydantic schemas for structured scoring output
class CompetencyEvaluation(BaseModel):
    competency_name: str
    score: int = Field(..., ge=1, le=5, description="Escala 1 a 5 (BARS)")
    justification: str
    evidence_quote: str = Field(..., description="Citação exata falada na entrevista")
    evidence_verified: bool | None = None


class ScorecardOutput(BaseModel):
    candidate_name: str
    overall_recommendation: Literal["Aprovado", "Rejeitado", "Próxima Etapa"]
    evaluations: list[CompetencyEvaluation]


class ContextAggregator:
    """
    Lookup context files locally based on job_id.
    """
    def __init__(self, jobs_dir: str | None = None):
        self.jobs_dir = Path(jobs_dir or settings.jobs_dir)

    def load_context(self, job_id: str) -> dict[str, Any]:
        """
        Loads job description, competency framework and checklist for a given job_id.
        """
        job_file = self.jobs_dir / f"job_{job_id}.json"
        competency_file = self.jobs_dir / f"competency_{job_id}.json"
        checklist_file = self.jobs_dir / f"checklist_{job_id}.json"

        if not job_file.exists():
            raise FileNotFoundError(f"Job file not found: {job_file}")
        if not competency_file.exists():
            raise FileNotFoundError(f"Competency file not found: {competency_file}")
        if not checklist_file.exists():
            raise FileNotFoundError(f"Checklist file not found: {checklist_file}")

        with open(job_file, encoding="utf-8") as f:
            job_data = json.load(f)
        with open(competency_file, encoding="utf-8") as f:
            competency_data = json.load(f)
        with open(checklist_file, encoding="utf-8") as f:
            checklist_data = json.load(f)

        return {
            "job": job_data,
            "competencies": competency_data.get("competencies", []),
            "checklist": checklist_data.get("items", [])
        }


class EvidenceValidator:
    """
    Validates literal quotes in competency justifications against the raw transcript text.
    """
    @staticmethod
    def consolidate_transcript(transcription_raw: str | list[dict[str, Any]] | None) -> str:
        """
        Consolidates different formats of raw transcription into a single continuous string.
        """
        if not transcription_raw:
            return ""
        if isinstance(transcription_raw, str):
            return transcription_raw
        if isinstance(transcription_raw, list):
            parts = []
            for item in transcription_raw:
                if isinstance(item, dict) and "text" in item:
                    parts.append(item["text"])
                elif isinstance(item, str):
                    parts.append(item)
            return " ".join(parts)
        return ""

    @classmethod
    def validate_evidence(cls, evidence_quote: str, transcription_raw: str | list[dict[str, Any]]) -> bool:
        """
        Validates the evidence quote against the consolidated transcript.
        Exact (normalized) substring matches pass directly; otherwise a fuzzy
        partial match tolerates small transcription errors (real transcripts
        have WER > 0, so a legitimate quote may differ slightly from the text).
        """
        consolidated = cls.consolidate_transcript(transcription_raw)
        clean_quote = clean_text(evidence_quote)
        clean_transcript = clean_text(consolidated)

        if not clean_quote or not clean_transcript:
            return False

        if clean_quote in clean_transcript:
            return True

        similarity = fuzz.partial_ratio(clean_quote, clean_transcript)
        is_verified = similarity >= settings.evidence_match_threshold
        if not is_verified:
            logger.warning(
                f"Hallucinated evidence quote detected (similarity={similarity:.0f}): "
                f"'{evidence_quote}'"
            )
        else:
            logger.info(f"Evidence quote accepted via fuzzy match (similarity={similarity:.0f})")
        return is_verified


def consolidate_dialogue(diarization_raw: Any) -> str:
    """
    Renders merged diarization segments ({speaker, text}) as a labeled dialogue.
    Returns "" when the data has no usable speaker/text pairs.
    """
    if not isinstance(diarization_raw, list):
        return ""
    lines = []
    for seg in diarization_raw:
        if isinstance(seg, dict) and seg.get("text") and seg.get("speaker"):
            lines.append(f"{seg['speaker']}: {seg['text']}")
    return "\n".join(lines)


class ScoringEngine:
    """
    Scoring Engine using OpenRouter structured Pydantic output.
    """
    MAX_ATTEMPTS = 3

    def __init__(self, api_key: str | None = None, model: str | None = None):
        if api_key is None:
            self.api_key = settings.openrouter_api_key
        else:
            self.api_key = api_key
        self.model = model or settings.openrouter_model or "google/gemini-2.5-flash"

    def evaluate(
        self,
        transcription_raw: Any,
        context: dict,
        candidate_name: str = "Candidato",
        diarization_raw: Any = None,
    ) -> ScorecardOutput:
        """
        Calls OpenRouter to evaluate transcription against job description, competencies, and checklist.
        """
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY is required to run the ScoringEngine.")

        transcript_str = EvidenceValidator.consolidate_transcript(transcription_raw)
        dialogue_str = consolidate_dialogue(diarization_raw)

        # The output schema shown to the model is derived from the Pydantic
        # model so prompt and validation can never drift apart.
        schema_json = json.dumps(
            ScorecardOutput.model_json_schema(), indent=2, ensure_ascii=False
        )

        system_prompt = (
            "Você é um avaliador técnico especialista em recrutamento e seleção.\n"
            "Sua tarefa é avaliar a entrevista do candidato e gerar um scorecard estruturado no formato JSON.\n"
            "Cada competência avaliada deve ser classificada de acordo com a escala BARS (1 a 5) especificada nas competências fornecidas.\n"
            "Crucialmente, para cada nota atribuída a uma competência, você deve fornecer uma citação literal exata (evidence_quote) "
            "retirada diretamente da transcrição da entrevista como evidência da nota.\n"
            "Não parafraseie e nem altere as palavras da citação de evidência. Ela deve ser idêntica ao texto da transcrição.\n"
            "Avalie apenas as falas do candidato, nunca as do entrevistador.\n"
            "Sua resposta final deve ser um objeto JSON que obedeça estritamente ao seguinte JSON Schema:\n"
            f"{schema_json}"
        )

        dialogue_block = (
            f"\nDiálogo com identificação de falantes:\n\"\"\"\n{dialogue_str}\n\"\"\"\n"
            if dialogue_str else ""
        )

        user_prompt = f"""
Vaga: {context.get("job", {}).get("title", "Cargo não especificado")}
Descrição: {context.get("job", {}).get("description", "")}
Requisitos: {json.dumps(context.get("job", {}).get("requirements", []), ensure_ascii=False)}

Competências para Avaliação:
{json.dumps(context.get("competencies", []), indent=2, ensure_ascii=False)}

Checklist de Validação:
{json.dumps(context.get("checklist", []), indent=2, ensure_ascii=False)}

Nome Padrão do Candidato: {candidate_name}

Transcrição da Entrevista:
\"\"\"
{transcript_str}
\"\"\"
{dialogue_block}
Gere a avaliação do candidato nos termos exigidos. Retorne APENAS o JSON válido.
"""

        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=self.api_key,
        )

        headers = {
            "HTTP-Referer": "https://github.com/luccapinto/scorecard-pipeline",
            "X-Title": "Interview Scorecard Pipeline"
        }

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        response_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "scorecard",
                "strict": True,
                "schema": ScorecardOutput.model_json_schema(),
            },
        }

        last_error: Exception | None = None
        for attempt in range(1, self.MAX_ATTEMPTS + 1):
            response = client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0,
                response_format=response_format,
                extra_headers=headers
            )
            content = response.choices[0].message.content
            # Scorecards contain candidate PII: never log the payload above DEBUG.
            logger.debug(f"OpenRouter raw response (attempt {attempt}): {content}")

            try:
                return ScorecardOutput.model_validate_json(content)
            except ValidationError as e:
                last_error = e
                logger.warning(
                    f"Scoring response failed schema validation "
                    f"(attempt {attempt}/{self.MAX_ATTEMPTS}): {e.error_count()} error(s)"
                )
                messages = messages + [
                    {"role": "assistant", "content": content},
                    {
                        "role": "user",
                        "content": (
                            "A resposta anterior violou o JSON Schema exigido: "
                            f"{e}\nCorrija e retorne APENAS o JSON válido."
                        ),
                    },
                ]

        raise ValueError(
            f"ScoringEngine failed to produce a valid scorecard after "
            f"{self.MAX_ATTEMPTS} attempts: {last_error}"
        )
