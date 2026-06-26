import os
import re
import json
import logging
import unicodedata
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, Field
from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)

# Pydantic schemas for structured scoring output
class CompetencyEvaluation(BaseModel):
    competency_name: str
    score: int  # Escala 1 a 5 (BARS)
    justification: str
    evidence_quote: str  # Citação exata falada na entrevista
    evidence_verified: Optional[bool] = None

class ScorecardOutput(BaseModel):
    candidate_name: str
    overall_recommendation: str  # ex: Aprovado, Rejeitado, Próxima Etapa
    evaluations: List[CompetencyEvaluation]


# Helper function to clean and normalize text
def clean_text(text: str) -> str:
    """
    Cleans text for fair substring matching:
    - Converts to lowercase.
    - Normalizes Unicode characters (removes accents/diacritics).
    - Removes punctuation.
    - Normalizes spacing.
    """
    if not text:
        return ""
    text = text.lower()
    # Remove accents/diacritics
    text = "".join(
        c for c in unicodedata.normalize("NFD", text)
        if unicodedata.category(c) != "Mn"
    )
    # Replace punctuation with space to prevent words joining
    text = re.sub(r"[.,?!_#*()\[\]{}:;\-\"'/]", " ", text)
    # Remove extra whitespace
    text = " ".join(text.split())
    return text


class ContextAggregator:
    """
    Lookup context files locally based on job_id.
    """
    def __init__(self, jobs_dir: Optional[str] = None):
        self.jobs_dir = Path(jobs_dir or settings.jobs_dir)

    def load_context(self, job_id: str) -> Dict[str, Any]:
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

        with open(job_file, "r", encoding="utf-8") as f:
            job_data = json.load(f)
        with open(competency_file, "r", encoding="utf-8") as f:
            competency_data = json.load(f)
        with open(checklist_file, "r", encoding="utf-8") as f:
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
    def consolidate_transcript(transcription_raw: Union[str, List[Dict[str, Any]], None]) -> str:
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
    def validate_evidence(cls, evidence_quote: str, transcription_raw: Union[str, List[Dict[str, Any]]]) -> bool:
        """
        Validates if the clean version of evidence_quote is a substring of the clean consolidated transcript.
        """
        consolidated = cls.consolidate_transcript(transcription_raw)
        clean_quote = clean_text(evidence_quote)
        clean_transcript = clean_text(consolidated)
        
        if not clean_quote:
            return False
            
        is_verified = clean_quote in clean_transcript
        if not is_verified:
            logger.warning(f"Hallucinated evidence quote detected: '{evidence_quote}'")
        return is_verified


class ScoringEngine:
    """
    Scoring Engine using OpenRouter structured Pydantic output.
    """
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        if api_key is None:
            self.api_key = settings.openrouter_api_key or os.getenv("OPENROUTER_API_KEY", "")
        else:
            self.api_key = api_key
        self.model = model or settings.openrouter_model or "google/gemini-2.5-flash"

    def evaluate(self, transcription_raw: Any, context: dict, candidate_name: str = "Candidato") -> ScorecardOutput:
        """
        Calls OpenRouter to evaluate transcription against job description, competencies, and checklist.
        """
        transcript_str = EvidenceValidator.consolidate_transcript(transcription_raw)
        
        job_title = context.get("job", {}).get("title", "Cargo não especificado")
        job_description = context.get("job", {}).get("description", "")
        job_requirements = context.get("job", {}).get("requirements", [])
        competencies = context.get("competencies", [])
        checklist = context.get("checklist", [])

        system_prompt = (
            "Você é um avaliador técnico especialista em recrutamento e seleção.\n"
            "Sua tarefa é avaliar a entrevista do candidato e gerar um scorecard estruturado no formato JSON.\n"
            "Cada competência avaliada deve ser classificada de acordo com a escala BARS (1 a 5) especificada nas competências fornecidas.\n"
            "Crucialmente, para cada nota atribuída a uma competência, você deve fornecer uma citação literal exata (evidence_quote) "
            "retirada diretamente da transcrição da entrevista como evidência da nota.\n"
            "Não parafraseie e nem altere as palavras da citação de evidência. Ela deve ser idêntica ao texto da transcrição.\n"
            "Sua resposta final deve ser um objeto JSON que obedeça estritamente ao seguinte formato/schema:\n"
            "{\n"
            "  \"candidate_name\": \"Nome do candidato extraído da transcrição ou Candidato\",\n"
            "  \"overall_recommendation\": \"Aprovado\" | \"Rejeitado\" | \"Próxima Etapa\",\n"
            "  \"evaluations\": [\n"
            "    {\n"
            "      \"competency_name\": \"Nome exato da competência\",\n"
            "      \"score\": 3,\n"
            "      \"justification\": \"Justificativa técnica da nota baseada na entrevista\",\n"
            "      \"evidence_quote\": \"Citação exata contida na transcrição\"\n"
            "    }\n"
            "  ]\n"
            "}"
        )

        user_prompt = f"""
Vaga: {job_title}
Descrição: {job_description}
Requisitos: {json.dumps(job_requirements, ensure_ascii=False)}

Competências para Avaliação:
{json.dumps(competencies, indent=2, ensure_ascii=False)}

Checklist de Validação:
{json.dumps(checklist, indent=2, ensure_ascii=False)}

Nome Padrão do Candidato: {candidate_name}

Transcrição da Entrevista:
\"\"\"
{transcript_str}
\"\"\"

Gere a avaliação do candidato nos termos exigidos. Retorne APENAS o JSON válido.
"""

        # Mock fallback for test environment when API key is missing
        if not self.api_key:
            if os.getenv("TEST_MODE") == "true":
                logger.warning("Test mode detected and OPENROUTER_API_KEY is not set. Returning a mock scorecard.")
                evals = []
                for comp in competencies:
                    comp_name = comp.get("name", "")
                    if "Comunicação" in comp_name:
                        quote = "Tudo ótimo, obrigado! Fico feliz pela oportunidade de conversar com vocês sobre o time e o projeto."
                    else:
                        quote = "No meu último projeto, eu fui responsável por otimizar algumas queries pesadas no PostgreSQL"
                    
                    evals.append(CompetencyEvaluation(
                        competency_name=comp_name,
                        score=4,
                        justification="Demonstrou boa postura e comunicação técnica.",
                        evidence_quote=quote,
                        evidence_verified=None
                    ))
                return ScorecardOutput(
                    candidate_name=candidate_name,
                    overall_recommendation="Aprovado",
                    evaluations=evals
                )
            raise ValueError("OPENROUTER_API_KEY is required to run the ScoringEngine.")

        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=self.api_key,
        )
        
        headers = {
            "HTTP-Referer": "https://github.com/luccapinto/scorecard-pipeline",
            "X-Title": "Interview Scorecard Pipeline"
        }
        
        response = client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            extra_headers=headers
        )
        
        content = response.choices[0].message.content
        logger.info(f"OpenRouter response: {content}")
        
        scorecard = ScorecardOutput.model_validate_json(content)
        return scorecard
