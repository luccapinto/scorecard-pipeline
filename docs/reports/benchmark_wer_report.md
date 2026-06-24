# Relatório de Benchmark WER (Word Error Rate)

**Data da Execução:** 2026-06-24 14:40:03
**Objetivo:** Comparação empírica de taxa de erro de transcrição entre WhisperX (Local) e OpenAI API (Nuvem), focando em termos técnicos e code-switching.

## 1. Média Geral do WER

| Provedor | Média WER | Tempo Médio de Processamento |
| :--- | :---: | :---: |
| **WhisperX (Local)** | 4.07% | 0.00s |
| **OpenAI API** | 0.00% | 0.00s |

## 2. Resultados por Amostra

| Arquivo de Teste | WER Local (WhisperX) | WER OpenAI API | Tempo Local | Tempo OpenAI |
| :--- | :---: | :---: | :---: | :---: |
| `interview_python_pleno.wav` | 4.07% | 0.00% | 0.00s | 0.00s |

## 3. Análise Qualitativa de Code-switching & Termos Técnicos

Nesta seção, avaliamos o comportamento dos drivers em relação aos termos técnicos em inglês mesclados no português (code-switching).

### Arquivo: `interview_python_pleno.wav`

#### WhisperX (Local)
- **Termos Técnicos Corretamente Transcritos:** `docker`, `redis`, `ci/cd`, `deploy`, `pull request`, `code review`, `solid`, `clean code`, `backend`, `workflow`
- **Termos Técnicos Incorretos / Omitidos:** `pytest`, `postgres`, `postgresql`, `github actions`, `caching`, `code smell`, `refactoring`

#### OpenAI API
- **Termos Técnicos Corretamente Transcritos:** `pytest`, `docker`, `postgres`, `postgresql`, `redis`, `github actions`, `ci/cd`, `deploy`, `pull request`, `caching`, `code review`, `solid`, `clean code`, `backend`, `workflow`, `code smell`, `refactoring`
- **Termos Técnicos Incorretos / Omitidos:** Nenhum
