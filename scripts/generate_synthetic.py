import asyncio
import argparse
import json
import os
import tempfile
import numpy as np
import soundfile as sf
import edge_tts
from typing import List

from app.schemas import (
    JobDescription,
    Competency,
    CompetencyFramework,
    EvaluationChecklist,
    DialogueTurn,
    DialogueScript
)

# Constants for default configurations
DEFAULT_OUTPUT_DIR = "data/synthetic"
DEFAULT_INTERVIEWER_VOICE = "pt-BR-FranciscaNeural"
DEFAULT_CANDIDATE_VOICE = "pt-BR-AntonioNeural"
DEFAULT_PREFIX = "python_pleno"

# Sample data generation functions
def get_sample_job_description() -> JobDescription:
    return JobDescription(
        title="Desenvolvedor Python Pleno",
        description="Responsável por desenvolver APIs eficientes e robustas utilizando FastAPI e SQLAlchemy, além de integrar o sistema com filas de mensageria usando Redis e gerenciar a infraestrutura base local com Docker.",
        requirements=[
          "Experiência com Python e frameworks assíncronos (FastAPI/Tornado/Sanic)",
          "Conhecimento sólido de SQL e ORMs (SQLAlchemy, SQLModel)",
          "Experiência com Redis e filas de tarefas em background (RQ, Celery)",
          "Familiaridade com Docker e Docker Compose",
          "Conhecimentos em testes automatizados (pytest)"
        ]
    )

def get_sample_competency_framework() -> CompetencyFramework:
    return CompetencyFramework(
        competencies=[
            Competency(
                name="Comunicação e Code-switching",
                description="Capacidade de se comunicar claramente sobre termos técnicos de engenharia em inglês no contexto de falas em português.",
                bars_levels={
                    1: "Comunicação confusa e insegura, com dificuldade de se expressar utilizando termos técnicos apropriados.",
                    2: "Consegue se expressar, mas comete erros constantes de pronúncia ou usa termos técnicos de forma errada.",
                    3: "Comunicação clara e fluida, utilizando termos técnicos comuns em inglês adequadamente (code-switching).",
                    4: "Excelente habilidade de comunicação, detalha decisões técnicas usando termos em inglês com muita propriedade.",
                    5: "Excepcional habilidade comunicativa, transita entre conceitos técnicos complexos com clareza exemplar."
                }
            ),
            Competency(
                name="Conhecimento de Infraestrutura e Banco de Dados",
                description="Domínio técnico de modelagem relacional, gerenciamento de transações no PostgreSQL e cache/filas com Redis.",
                bars_levels={
                    1: "Não demonstra conhecimento básico de banco de dados ou Redis.",
                    2: "Conhecimento superficial; compreende o papel do banco mas não sabe projetar tabelas ou queries otimizadas.",
                    3: "Consegue modelar entidades, realizar CRUD básico no Postgres e configurar Redis básico para cache.",
                    4: "Demonstra bom conhecimento de transações, índices Postgres, resiliência de filas com Redis/RQ e persistência.",
                    5: "Domínio avançado, propõe otimizações complexas de banco, sharding ou alta disponibilidade em filas Redis."
                }
            )
        ]
    )

def get_sample_evaluation_checklist() -> EvaluationChecklist:
    return EvaluationChecklist(
        items=[
            "O candidato demonstrou experiência com o banco de dados PostgreSQL?",
            "O candidato mencionou o uso de Redis ou filas de tarefas secundárias?",
            "O candidato demonstrou familiaridade com Docker e docker-compose?",
            "O candidato possui conhecimentos de testes automatizados com pytest?"
        ]
    )

def get_sample_dialogue_script() -> DialogueScript:
    return DialogueScript(
        turns=[
            DialogueTurn(
                speaker="Entrevistador",
                text="Olá, bem-vindo à nossa entrevista técnica para a vaga de Desenvolvedor Python Pleno. Como você está?"
            ),
            DialogueTurn(
                speaker="Candidato",
                text="Tudo ótimo, obrigado! Fico feliz pela oportunidade de conversar com vocês sobre o time e o projeto."
            ),
            DialogueTurn(
                speaker="Entrevistador",
                text="Perfeito. Para começar, você poderia nos contar um pouco sobre sua experiência recente com backend e se já trabalhou com pipelines de CI/CD?"
            ),
            DialogueTurn(
                speaker="Candidato",
                text="Claro! No meu último projeto, eu fui responsável por otimizar algumas queries pesadas no PostgreSQL e criar a nossa pipeline de CI/CD no GitHub Actions. Nós criamos um workflow para rodar a suíte de testes com pytest e fazer o build da imagem Docker. Quando o pull request era aprovado, a gente fazia o deploy direto no ECS da AWS."
            ),
            DialogueTurn(
                speaker="Entrevistador",
                text="Excelente. E como você lidava com a revisão de código ou refactoring de sistemas legados?"
            ),
            DialogueTurn(
                speaker="Candidato",
                text="A gente prezava muito pelo processo de code review nos pull requests. Quando eu identificava algum code smell, eu abria um refactoring card e discutia com o time antes de subir. Sempre focando em SOLID e clean code."
            ),
            DialogueTurn(
                speaker="Entrevistador",
                text="Muito bom. E você tem experiência com bancos de dados relacionais e Redis?"
            ),
            DialogueTurn(
                speaker="Candidato",
                text="Sim, a gente usava o Redis como uma camada de caching e para gerenciar filas de tarefas em background com o RQ. Isso reduzia bastante a latência da API."
            ),
            DialogueTurn(
                speaker="Entrevistador",
                text="Muito interessante. Acho que deu para ter uma boa visão das suas competências. Muito obrigado pelo seu tempo!"
            ),
            DialogueTurn(
                speaker="Candidato",
                text="Obrigado a você! Fico no aguardo do feedback sobre a próxima etapa do processo."
            )
        ]
    )

async def synthesize_turn(text: str, voice: str, filepath: str) -> None:
    """Synthesizes text to a single MP3 file using edge-tts."""
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(filepath)

async def generate_interview_audio(
    script: DialogueScript,
    interviewer_voice: str,
    candidate_voice: str,
    output_wav_path: str
) -> None:
    """
    Synthesizes each dialogue turn, reads the temporary files using soundfile,
    concatenates them with small silences, and saves the final WAV audio.
    """
    temp_files = []
    
    try:
        # Create temp files for each turn
        for i, turn in enumerate(script.turns):
            voice = interviewer_voice if turn.speaker == "Entrevistador" else candidate_voice
            temp_fd, temp_path = tempfile.mkstemp(suffix=".mp3")
            os.close(temp_fd) # Close file descriptor so edge-tts can write to it
            temp_files.append(temp_path)
            
            print(f"Synthesizing turn {i+1}/{len(script.turns)} ({turn.speaker})...")
            await synthesize_turn(turn.text, voice, temp_path)
            
        print("Concatenating audio turns...")
        combined_audio = []
        samplerate = None
        
        # 0.5 seconds of silence at 24000Hz (default samplerate for edge-tts)
        silence_duration_seconds = 0.5
        
        for i, path in enumerate(temp_files):
            data, sr = sf.read(path)
            if samplerate is None:
                samplerate = sr
            elif sr != samplerate:
                # In practice they should be the same as they are generated by the same service
                pass
            
            # Append audio data
            combined_audio.append(data)
            
            # If not the last turn, append silence
            if i < len(temp_files) - 1:
                silence_length = int(silence_duration_seconds * samplerate)
                # Since edge-tts outputs mono audio, data is 1D array.
                silence = np.zeros(silence_length)
                combined_audio.append(silence)
                
        # Concatenate all parts
        final_audio = np.concatenate(combined_audio)
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_wav_path), exist_ok=True)
        
        # Save to WAV format
        sf.write(output_wav_path, final_audio, samplerate)
        print(f"Final audio saved to: {output_wav_path}")
        
    finally:
        # Clean up temporary MP3 files
        for path in temp_files:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception as e:
                    print(f"Failed to delete temp file {path}: {e}")

def main():
    parser = argparse.ArgumentParser(description="Synthetic Data Generator for Scorecard Pipeline")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="Directory to save generated files")
    parser.add_argument("--prefix", default=DEFAULT_PREFIX, help="Prefix name for the generated files")
    parser.add_argument("--interviewer-voice", default=DEFAULT_INTERVIEWER_VOICE, help="Voice name for interviewer")
    parser.add_argument("--candidate-voice", default=DEFAULT_CANDIDATE_VOICE, help="Voice name for candidate")
    
    args = parser.parse_args()
    
    os.makedirs(args.output_dir, exist_ok=True)
    
    # Generate structured files
    job_desc = get_sample_job_description()
    comp_framework = get_sample_competency_framework()
    eval_checklist = get_sample_evaluation_checklist()
    dialogue_script = get_sample_dialogue_script()
    
    # Paths
    job_path = os.path.join(args.output_dir, f"job_{args.prefix}.json")
    comp_path = os.path.join(args.output_dir, f"competency_{args.prefix}.json")
    checklist_path = os.path.join(args.output_dir, f"checklist_{args.prefix}.json")
    dialogue_path = os.path.join(args.output_dir, f"interview_{args.prefix}.json")
    audio_path = os.path.join(args.output_dir, f"interview_{args.prefix}.wav")
    
    # Save JSON files
    with open(job_path, "w", encoding="utf-8") as f:
        json.dump(job_desc.model_dump(), f, indent=2, ensure_ascii=False)
    print(f"Saved: {job_path}")
    
    with open(comp_path, "w", encoding="utf-8") as f:
        json.dump(comp_framework.model_dump(), f, indent=2, ensure_ascii=False)
    print(f"Saved: {comp_path}")
        
    with open(checklist_path, "w", encoding="utf-8") as f:
        json.dump(eval_checklist.model_dump(), f, indent=2, ensure_ascii=False)
    print(f"Saved: {checklist_path}")
        
    with open(dialogue_path, "w", encoding="utf-8") as f:
        json.dump(dialogue_script.model_dump(), f, indent=2, ensure_ascii=False)
    print(f"Saved: {dialogue_path}")
        
    # Generate Audio
    print("Generating interview audio (this may take a few seconds)...")
    asyncio.run(
        generate_interview_audio(
            dialogue_script,
            args.interviewer_voice,
            args.candidate_voice,
            audio_path
        )
    )
    print("Generation completed successfully!")

if __name__ == "__main__":
    main()
