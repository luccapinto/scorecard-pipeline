from pydantic import BaseModel, Field
from typing import List, Dict

class JobDescription(BaseModel):
    title: str = Field(..., description="Title of the job position")
    description: str = Field(..., description="General description of the position")
    requirements: List[str] = Field(..., description="List of technical/comportamental requirements")

class Competency(BaseModel):
    name: str = Field(..., description="Name of the competency")
    description: str = Field(..., description="Description of the competency")
    bars_levels: Dict[int, str] = Field(
        ...,
        description="Behaviorally Anchored Rating Scale (BARS) from 1 to 5 with descriptions"
    )

class CompetencyFramework(BaseModel):
    competencies: List[Competency] = Field(..., description="List of competencies for evaluation")

class EvaluationChecklist(BaseModel):
    items: List[str] = Field(..., description="Checklist items to validate during the interview")

class DialogueTurn(BaseModel):
    speaker: str = Field(..., description="Speaker identifier (e.g., Entrevistador, Candidato)")
    text: str = Field(..., description="The spoken text")

class DialogueScript(BaseModel):
    turns: List[DialogueTurn] = Field(..., description="Sequential dialog turns in the interview")
