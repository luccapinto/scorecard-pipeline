
from pydantic import BaseModel, Field


class JobDescription(BaseModel):
    title: str = Field(..., description="Title of the job position")
    description: str = Field(..., description="General description of the position")
    requirements: list[str] = Field(..., description="List of technical/comportamental requirements")

class Competency(BaseModel):
    name: str = Field(..., description="Name of the competency")
    description: str = Field(..., description="Description of the competency")
    bars_levels: dict[int, str] = Field(
        ...,
        description="Behaviorally Anchored Rating Scale (BARS) from 1 to 5 with descriptions"
    )

class CompetencyFramework(BaseModel):
    competencies: list[Competency] = Field(..., description="List of competencies for evaluation")

class EvaluationChecklist(BaseModel):
    items: list[str] = Field(..., description="Checklist items to validate during the interview")

class DialogueTurn(BaseModel):
    speaker: str = Field(..., description="Speaker identifier (e.g., Entrevistador, Candidato)")
    text: str = Field(..., description="The spoken text")

class DialogueScript(BaseModel):
    turns: list[DialogueTurn] = Field(..., description="Sequential dialog turns in the interview")
