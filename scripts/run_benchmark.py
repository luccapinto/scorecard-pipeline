import importlib.util
import os
import json
import time
import argparse
from pathlib import Path
from typing import List, Tuple
import jiwer

from app.text_utils import clean_text  # noqa: F401  (re-exported for tests/tooling)

# Try loading real services, but handle missing dependencies/keys gracefully
try:
    from app.audio_processor import LocalTranscription, OpenAITranscription
    HAS_APP_SERVICES = True
except ImportError:
    HAS_APP_SERVICES = False

TECH_TERMS = [
    "pytest", "docker", "postgres", "postgresql", "redis", "fastapi", "github actions",
    "ci/cd", "deploy", "merge", "pull request", "caching", "code review", "solid", "clean code",
    "backend", "workflow", "code smell", "refactoring"
]


def calculate_wer_jiwer(reference: str, hypothesis: str) -> float:
    """Calculates Word Error Rate (WER) using the jiwer library."""
    ref_clean = clean_text(reference)
    hyp_clean = clean_text(hypothesis)
    if not ref_clean:
        return 1.0 if hyp_clean else 0.0
    return jiwer.wer(ref_clean, hyp_clean)


def analyze_tech_terms(reference: str, hypothesis: str) -> Tuple[List[str], List[str]]:
    """
    Checks which technical terms were successfully transcribed.
    Returns (correct_terms, missed_terms).
    """
    ref_clean = clean_text(reference)
    hyp_clean = clean_text(hypothesis)

    correct = []
    missed = []

    for term in TECH_TERMS:
        term_clean = clean_text(term)
        # Check if term is actually in reference
        if term_clean in ref_clean:
            # Check if term is in hypothesis
            if term_clean in hyp_clean:
                correct.append(term)
            else:
                missed.append(term)

    return correct, missed


def get_mock_transcription(provider: str, reference_text: str) -> str:
    """
    SIMULATION ONLY — generates a hand-corrupted copy of the reference text to
    exercise the report pipeline when the real engines are unavailable.
    Results produced this way say nothing about real engine accuracy and are
    labeled as simulated in the report.
    """
    if provider == "local":
        # WhisperX simulations (misspelling/anglicism issues)
        text = reference_text
        text = text.replace("CI/CD", "ci cd")
        text = text.replace("pytest", "pai test")
        text = text.replace("GitHub Actions", "git hub actions")
        text = text.replace("docker-compose", "docker compose")
        text = text.replace("PostgreSQL", "postgre sql")
        text = text.replace("caching", "cache")
        text = text.replace("code smell", "code esmel")
        text = text.replace("refactoring", "refatoring")
        return text
    else:
        # OpenAI simulations (very robust, maybe tiny casing/spacing details)
        text = reference_text
        text = text.replace("CI/CD", "ci/cd")  # small punctuation cleaning
        return text


def whisperx_available() -> bool:
    return importlib.util.find_spec("whisperx") is not None


def run_benchmark(audio_dir: Path, output_report_path: Path, force_mock: bool = False):
    print("Starting WER Benchmark Execution...")

    # 1. Locate files
    audio_files = list(audio_dir.glob("*.wav"))
    if not audio_files:
        print(f"Error: No audio files (*.wav) found in directory '{audio_dir}'")
        return

    print(f"Found {len(audio_files)} wav file(s) to process.")

    # Each engine falls back to simulation only for its own missing prerequisite.
    use_mock_local = force_mock or not HAS_APP_SERVICES or not whisperx_available()
    use_mock_openai = force_mock or not HAS_APP_SERVICES or not os.getenv("OPENAI_API_KEY")

    if use_mock_local:
        print("NOTE: local (WhisperX) results will be SIMULATED "
              "(whisperx unavailable or --force-mock).")
    if use_mock_openai:
        print("NOTE: OpenAI results will be SIMULATED "
              "(OPENAI_API_KEY unset or --force-mock).")

    results = []

    for audio_path in audio_files:
        prefix = audio_path.stem.replace("interview_", "")
        json_path = audio_dir / f"interview_{prefix}.json"

        if not json_path.exists():
            print(f"Warning: JSON metadata not found for '{audio_path.name}'. Skipping.")
            continue

        # Load reference dialogue
        with open(json_path, "r", encoding="utf-8") as f:
            dialogue_data = json.load(f)

        turns = dialogue_data.get("turns", [])
        reference_text = " ".join([t["text"] for t in turns])

        # Run Local Transcription
        t0 = time.time()
        local_simulated = use_mock_local
        if not use_mock_local:
            try:
                local_engine = LocalTranscription()
                local_segments = local_engine.transcribe(audio_path)
                local_hyp = " ".join([seg["text"] for seg in local_segments])
            except Exception as e:
                print(f"Local transcription failed for {audio_path.name}: {e}. Falling back to SIMULATED data.")
                local_hyp = get_mock_transcription("local", reference_text)
                local_simulated = True
        else:
            local_hyp = get_mock_transcription("local", reference_text)
        local_time = time.time() - t0

        # Run OpenAI Transcription
        t0 = time.time()
        openai_simulated = use_mock_openai
        if not use_mock_openai:
            try:
                openai_engine = OpenAITranscription()
                openai_segments = openai_engine.transcribe(audio_path)
                openai_hyp = " ".join([seg["text"] for seg in openai_segments])
            except Exception as e:
                print(f"OpenAI transcription failed for {audio_path.name}: {e}. Falling back to SIMULATED data.")
                openai_hyp = get_mock_transcription("openai", reference_text)
                openai_simulated = True
        else:
            openai_hyp = get_mock_transcription("openai", reference_text)
        openai_time = time.time() - t0

        # Calculate WERs
        wer_local = calculate_wer_jiwer(reference_text, local_hyp)
        wer_openai = calculate_wer_jiwer(reference_text, openai_hyp)

        # Analyze tech terms
        local_correct, local_missed = analyze_tech_terms(reference_text, local_hyp)
        openai_correct, openai_missed = analyze_tech_terms(reference_text, openai_hyp)

        results.append({
            "filename": audio_path.name,
            "wer_local": wer_local,
            "wer_openai": wer_openai,
            "time_local": local_time,
            "time_openai": openai_time,
            "local_simulated": local_simulated,
            "openai_simulated": openai_simulated,
            "local_correct": local_correct,
            "local_missed": local_missed,
            "openai_correct": openai_correct,
            "openai_missed": openai_missed
        })

        print(f"Processed {audio_path.name}: WhisperX WER={wer_local:.2%}, OpenAI WER={wer_openai:.2%}")

    # 2. Compute averages
    avg_wer_local = sum([r["wer_local"] for r in results]) / len(results)
    avg_wer_openai = sum([r["wer_openai"] for r in results]) / len(results)
    avg_time_local = sum([r["time_local"] for r in results]) / len(results)
    avg_time_openai = sum([r["time_openai"] for r in results]) / len(results)

    any_simulated = any(r["local_simulated"] or r["openai_simulated"] for r in results)

    def mode_label(simulated: bool) -> str:
        return "SIMULADO (mock)" if simulated else "REAL"

    # 3. Generate Markdown Report
    os.makedirs(output_report_path.parent, exist_ok=True)

    report_lines = [
        "# Relatório de Benchmark WER (Word Error Rate)",
        "",
        f"**Data da Execução:** {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "**Objetivo:** Comparação de taxa de erro de transcrição entre WhisperX (Local) e OpenAI API (Nuvem), focando em termos técnicos e code-switching.",
        ""
    ]

    if any_simulated:
        report_lines.extend([
            "> ⚠️ **ATENÇÃO: este relatório contém resultados SIMULADOS.**",
            "> Linhas marcadas como `SIMULADO (mock)` foram geradas por corrupção",
            "> artificial do texto de referência (sem executar o motor de",
            "> transcrição) e **não medem a acurácia real de nenhum provedor**.",
            "> Execute com whisperx instalado e/ou `OPENAI_API_KEY` definido para",
            "> obter uma comparação empírica.",
            ""
        ])

    report_lines.extend([
        "## 1. Média Geral do WER",
        "",
        "| Provedor | Modo | Média WER | Tempo Médio de Processamento |",
        "| :--- | :---: | :---: | :---: |",
        f"| **WhisperX (Local)** | {mode_label(any(r['local_simulated'] for r in results))} | {avg_wer_local:.2%} | {avg_time_local:.2f}s |",
        f"| **OpenAI API** | {mode_label(any(r['openai_simulated'] for r in results))} | {avg_wer_openai:.2%} | {avg_time_openai:.2f}s |",
        "",
        "## 2. Resultados por Amostra",
        "",
        "| Arquivo de Teste | WER Local (WhisperX) | Modo Local | WER OpenAI API | Modo OpenAI | Tempo Local | Tempo OpenAI |",
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: |"
    ])

    for r in results:
        report_lines.append(
            f"| `{r['filename']}` | {r['wer_local']:.2%} | {mode_label(r['local_simulated'])} "
            f"| {r['wer_openai']:.2%} | {mode_label(r['openai_simulated'])} "
            f"| {r['time_local']:.2f}s | {r['time_openai']:.2f}s |"
        )

    report_lines.extend([
        "",
        "## 3. Análise Qualitativa de Code-switching & Termos Técnicos",
        "",
        "Nesta seção, avaliamos o comportamento dos drivers em relação aos termos técnicos em inglês mesclados no português (code-switching).",
        ""
    ])

    for r in results:
        report_lines.extend([
            f"### Arquivo: `{r['filename']}`",
            "",
            f"#### WhisperX (Local) — {mode_label(r['local_simulated'])}",
            f"- **Termos Técnicos Corretamente Transcritos:** {', '.join([f'`{t}`' for t in r['local_correct']]) if r['local_correct'] else 'Nenhum'}",
            f"- **Termos Técnicos Incorretos / Omitidos:** {', '.join([f'`{t}`' for t in r['local_missed']]) if r['local_missed'] else 'Nenhum'}",
            "",
            f"#### OpenAI API — {mode_label(r['openai_simulated'])}",
            f"- **Termos Técnicos Corretamente Transcritos:** {', '.join([f'`{t}`' for t in r['openai_correct']]) if r['openai_correct'] else 'Nenhum'}",
            f"- **Termos Técnicos Incorretos / Omitidos:** {', '.join([f'`{t}`' for t in r['openai_missed']]) if r['openai_missed'] else 'Nenhum'}",
            ""
        ])

    # Write report file
    with open(output_report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))

    print(f"\nReport successfully saved to: {output_report_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run WER benchmark comparison between local WhisperX and OpenAI API")
    parser.add_argument("--audio-dir", default="data/synthetic", help="Path to synthetic audios directory")
    parser.add_argument("--output", default="docs/reports/benchmark_wer_report.md", help="Path to write the report markdown")
    parser.add_argument("--force-mock", action="store_true", help="Force mock transcription data generation")

    args = parser.parse_args()

    run_benchmark(Path(args.audio_dir), Path(args.output), force_mock=args.force_mock)
