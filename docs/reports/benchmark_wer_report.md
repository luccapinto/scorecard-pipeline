# Relatório de Benchmark WER (Word Error Rate)

**Data da Execução:** 2026-06-24 14:40:03
**Objetivo:** Comparação de taxa de erro de transcrição entre WhisperX (Local) e OpenAI API (Nuvem), focando em termos técnicos e code-switching.

> ⚠️ **ATENÇÃO: este relatório contém resultados SIMULADOS.**
> Todas as linhas abaixo foram geradas por corrupção artificial do texto de
> referência (sem executar nenhum motor de transcrição) e **não medem a
> acurácia real de nenhum provedor**. Execute `python scripts/run_benchmark.py`
> com whisperx instalado e/ou `OPENAI_API_KEY` definido para obter uma
> comparação empírica.

## 1. Média Geral do WER

| Provedor | Modo | Média WER | Tempo Médio de Processamento |
| :--- | :---: | :---: | :---: |
| **WhisperX (Local)** | SIMULADO (mock) | 4.07% | 0.00s |
| **OpenAI API** | SIMULADO (mock) | 0.00% | 0.00s |

## 2. Resultados por Amostra

| Arquivo de Teste | WER Local (WhisperX) | Modo Local | WER OpenAI API | Modo OpenAI | Tempo Local | Tempo OpenAI |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `interview_python_pleno.wav` | 4.07% | SIMULADO (mock) | 0.00% | SIMULADO (mock) | 0.00s | 0.00s |

## 3. Análise Qualitativa de Code-switching & Termos Técnicos

Nesta seção, avaliamos o comportamento dos drivers em relação aos termos técnicos em inglês mesclados no português (code-switching).

### Arquivo: `interview_python_pleno.wav`

#### WhisperX (Local) — SIMULADO (mock)
- **Termos Técnicos Corretamente Transcritos:** `docker`, `redis`, `ci/cd`, `deploy`, `pull request`, `code review`, `solid`, `clean code`, `backend`, `workflow`
- **Termos Técnicos Incorretos / Omitidos:** `pytest`, `postgres`, `postgresql`, `github actions`, `caching`, `code smell`, `refactoring`

#### OpenAI API — SIMULADO (mock)
- **Termos Técnicos Corretamente Transcritos:** `pytest`, `docker`, `postgres`, `postgresql`, `redis`, `github actions`, `ci/cd`, `deploy`, `pull request`, `caching`, `code review`, `solid`, `clean code`, `backend`, `workflow`, `code smell`, `refactoring`
- **Termos Técnicos Incorretos / Omitidos:** Nenhum
