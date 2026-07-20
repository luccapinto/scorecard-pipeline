# Relatório de Benchmark WER (Word Error Rate)

**Data da execução:** 2026-07-20 13:12:45

**Objetivo:** comparar a taxa de erro de transcrição entre os provedores suportados, com atenção a termos técnicos em inglês mesclados ao português (code-switching).

Todos os números abaixo vêm de **execuções reais** dos provedores sobre os áudios sintéticos. Provedores indisponíveis são listados como pulados — este relatório nunca contém dados simulados.

> ⚠️ **Avisos de integridade do dataset**
>
> - `interview_python_pleno.wav`: o áudio tem 104s para 906 palavras de referência (8.7 palavras/s). O .wav provavelmente está desatualizado — regenere com scripts/generate_synthetic.py.

## 1. Média geral

| Provedor | WER médio | Tempo médio |
| :--- | :---: | :---: |
| **Deepgram nova-3 (API)** | 88.30% | 8.6s |

## 2. Resultados por amostra

| Arquivo | Deepgram nova-3 (API) |
| :--- | :---: |
| `interview_python_pleno.wav` | 88.30% (8.6s) |

## 3. Code-switching e termos técnicos

Termos técnicos em inglês presentes na referência e se cada provedor os preservou na transcrição.

### `interview_python_pleno.wav`

#### Deepgram nova-3 (API)
- **Preservados:** `docker`, `redis`
- **Perdidos ou incorretos:** `pytest`, `postgres`, `fastapi`, `github actions`, `deploy`, `merge`, `pull request`, `code review`, `backend`
