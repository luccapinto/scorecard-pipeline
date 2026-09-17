# Prompt: reconstruir o código-fonte do frontend

> Copie tudo a partir da linha `---` abaixo e envie para o agente de IA que vai
> escrever o frontend. O prompt é autocontido: traz o contrato real da API,
> extraído do código do backend.

---

## Contexto

Você vai escrever **do zero o código-fonte** de uma SPA React para o projeto
open source `scorecard-pipeline` (https://github.com/luccapinto/scorecard-pipeline),
um pipeline que transforma gravações de entrevistas técnicas em scorecards
estruturados com evidências verificadas.

O repositório hoje tem **apenas o bundle compilado** em `frontend/dist/`
(`index.html` + um `.js` minificado de 243 KB), sem o source. Ninguém consegue
auditar, modificar ou recompilar a interface. Sua tarefa é produzir o source
que substitui esse bundle.

**Não tente descompilar ou fazer engenharia reversa do bundle existente.**
Escreva uma implementação nova a partir do contrato de API abaixo. A interface
antiga é apenas um artefato de demonstração; você não precisa reproduzi-la
visualmente.

## O que o sistema faz

Uma entrevista é ingerida por webhook, passa por transcrição → diarização →
scoring por LLM, e **para**, aguardando decisão humana. O pipeline nunca aprova
ou rejeita um candidato sozinho — a interface existe justamente para que uma
pessoa revise o scorecard e decida.

Máquina de estados (o campo `status`, sempre em minúsculas):

```
recebida → transcrevendo → diarizando → pontuando → aguardando_aprovacao → aprovada | rejeitada
     ↘            ↘             ↘            ↘
                        falhou (reprocessável)
```

## Contrato da API

Base URL configurável (padrão `http://localhost:8000`). A API já libera CORS
para as origens `http://localhost:5173` e `http://127.0.0.1:5173` — **o dev
server precisa rodar na porta 5173**.

Autenticação: endpoints de leitura e ação exigem o header `X-API-Key`. Quando
a API roda sem `API_KEY` configurada (modo dev), o header é ignorado. A chave
deve ser configurável em runtime pelo usuário (ver "Configuração" abaixo) — não
embuta chave nenhuma no bundle.

### `GET /jobs`
Vagas disponíveis, para popular o dropdown do formulário.
```json
[{ "job_id": "python_pleno", "title": "Desenvolvedor Python Pleno" }]
```

### `GET /recordings`
Gravações de exemplo disponíveis no servidor.
```json
[{ "path": "/srv/app/data/synthetic/interview_python_pleno.wav",
   "filename": "interview_python_pleno.wav" }]
```
O campo `path` é exatamente o que deve ser enviado como `recording_url`.

### `GET /interviews`  *(requer `X-API-Key`)*
Lista todas as entrevistas, mais recentes primeiro. Cada item:
```json
{
  "id": "uuid",
  "recording_url": "string",
  "status": "aguardando_aprovacao",
  "job_id": "python_pleno",
  "external_id": "string | null",
  "transcription_raw": [ ... ] ,
  "diarization_raw": [ ... ],
  "scorecard": { ... },
  "error_log": "string | null",
  "retry_count": 0,
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

### `GET /interviews/{id}`  *(requer `X-API-Key`)*
Mesma estrutura, uma entrevista.

### `POST /webhooks/recording`
Cria uma entrevista. **Status 202.** Corpo:
```json
{ "recording_url": "string (obrigatório)",
  "job_id": "string (obrigatório)",
  "external_id": "string | null (chave de idempotência)" }
```
Resposta:
```json
{ "interview_id": "uuid", "status": "recebida" }
```
Quando o `external_id` já existe (idempotência), a resposta traz também
`"deduplicated": true`; numa criação nova o campo **não vem**. Trate-o como
opcional.
Quando `WEBHOOK_HMAC_SECRET` está configurado no servidor, este endpoint exige
uma assinatura HMAC-SHA256 no header `X-Webhook-Signature`. **Um navegador não
tem como assinar sem expor o segredo** — portanto, se a criação pela interface
falhar com 401/403, mostre uma mensagem explicando que a ingestão está protegida
por HMAC e deve ser feita pelo sistema de gravação, não pelo browser. Não tente
implementar a assinatura no cliente.

### `POST /interviews/{id}/action`  *(requer `X-API-Key`)*
```json
{ "action": "approve" }   // ou "reject"
```
Resposta: `{ "interview_id", "status", "updated_at" }`.
Só funciona quando o status é `aguardando_aprovacao`; caso contrário retorna
**400** com `detail` explicando o status atual.

### `POST /interviews/{id}/reprocess`  *(requer `X-API-Key`)*
Reenfileira uma entrevista em `falhou`. Sem corpo.

### `GET /health`
`{"status": "ok"}` ou **503** com `{"status": "unhealthy", "problems": {...}}`.

### Formato do `scorecard`

> **Serialização**: `scorecard`, `transcription_raw` e `diarization_raw` são
> colunas JSON/JSONB; o worker grava objetos e a API os devolve como
> objetos/listas já parseados (verificado contra a API real em 2026-07-21).
> Ainda assim, trate esses campos com parsing tolerante no cliente (aceitando
> também uma string JSON): dados gravados por caminhos alternativos podem
> chegar duplo-codificados, e a tela de decisão nunca pode quebrar por isso.

```json
{
  "candidate_name": "string",
  "overall_recommendation": "Aprovado" | "Rejeitado" | "Próxima Etapa",
  "evaluations": [
    {
      "competency_name": "string",
      "score": 3,
      "justification": "string",
      "evidence_quote": "citação exata da transcrição",
      "evidence_verified": true
    }
  ]
}
```
`score` vai de 1 a 5 (escala BARS). **`evidence_verified` é o campo mais
importante da interface inteira**: indica se a citação usada para justificar a
nota foi realmente encontrada na transcrição (matching exato + fuzzy). Quando
for `false`, a citação é possivelmente alucinada pelo LLM e **precisa saltar aos
olhos** do avaliador. `null` significa não verificada.

### Formatos de `transcription_raw` / `diarization_raw`
Lista de segmentos (ver nota de serialização acima). No modo Deepgram os dois
já vêm com speaker:
```json
[{ "speaker": "SPEAKER_00", "text": "...", "start": 0.0, "end": 6.5 }]
```
No modo local, `transcription_raw` pode vir sem a chave `speaker`, ou ainda ser
texto plano (não-JSON). Trate todos os casos. Os rótulos são `SPEAKER_00`,
`SPEAKER_01`, ... — não há nomes reais.

## O que a interface precisa entregar

1. **Lista de entrevistas** com status visível, vaga, data e busca/filtro por
   status. Como o processamento leva de segundos (API) a ~15 min (local), a
   lista deve atualizar sozinha (polling é suficiente; escolha um intervalo
   razoável e pare quando a aba não estiver visível).
2. **Detalhe da entrevista**: o scorecard renderizado de forma legível —
   competências, notas 1–5, justificativa e a citação de evidência com destaque
   claro de verificada/não verificada; a transcrição com os turnos separados
   por speaker; e, em caso de `falhou`, o `error_log` com botão de reprocessar.
3. **Ação de decisão** (aprovar/rejeitar) disponível só quando o status é
   `aguardando_aprovacao`, com confirmação antes de enviar — é uma decisão sobre
   a carreira de uma pessoa, não deve ser um clique acidental. Trate o 400 de
   status inválido mostrando a mensagem da API.
4. **Formulário de nova entrevista** com os dropdowns de vaga e gravação
   populados por `/jobs` e `/recordings`, mais campo opcional de `external_id`.
5. **Configuração em runtime**: a URL da API e a `X-API-Key` devem ser
   editáveis pelo usuário e persistidas no `localStorage`. Nada de chave ou
   host embutido no build.
6. **Indicador de saúde** consumindo `/health`.

## Requisitos técnicos

- **React + TypeScript + Vite.** O build deve gerar exatamente em
  `frontend/dist/` (mantendo `base: './'` para funcionar servido por nginx em
  qualquer path).
- O source vai em `frontend/src/`, com `package.json`, `vite.config.ts`,
  `tsconfig.json` e `.gitignore` (ignorando `node_modules/` e `dist/` — atenção:
  hoje o `dist/` é versionado; ao entregar o source, o `dist/` deve deixar de
  ser commitado e passar a ser gerado pelo CI).
- Dev server na **porta 5173** (a allowlist de CORS do backend depende disso).
- **Sem dependências desnecessárias.** Prefira `fetch` nativo a bibliotecas de
  HTTP. Se usar biblioteca de estado/roteamento, justifique no README.
- **Acessibilidade**: navegação por teclado, foco visível, contraste adequado,
  `aria-label` em ícones. Isso é interface de decisão sobre pessoas.
- **Tratamento de erro explícito**: nunca deixe a tela em branco. Diferencie
  "API fora do ar", "401/403 (chave inválida)" e "404".
- **Testes**: cubra ao menos a renderização do scorecard (incluindo o caso
  `evidence_verified: false`), o fluxo de decisão e o tratamento de erro de
  autenticação. Use Vitest + Testing Library.
- **Sem dados fictícios embutidos** que possam ser confundidos com dados reais
  de candidatos. Se precisar de fixtures, deixe óbvio que são sintéticos.

## Padrões do repositório

O projeto é OSS e tem barra de qualidade alta — siga o que já existe:

- **Documentação e UI em português (pt-BR)**; comentários de código em inglês.
- Commits em [Conventional Commits](https://www.conventionalcommits.org/pt-br/).
- Todo trabalho vai em branch `feat/...` com PR para `main`; o CI precisa ficar
  verde. Veja `CONTRIBUTING.md`.
- Inclua um `frontend/README.md` explicando como rodar, buildar e testar, e
  proponha o job de CI que builda o frontend (o CI atual, em
  `.github/workflows/ci.yml`, só cobre o backend Python).
- Atualize a seção "Interface Web" do `README.md` e do `README.en.md`, que hoje
  documentam a ausência do source como limitação conhecida — essa nota deve
  sair quando o source entrar.
- Registre a mudança em `CHANGELOG.md`, na seção `[Não lançado]`.

## Antes de começar

Leia no repositório: `README.md` (arquitetura e máquina de estados),
`app/main.py` (a fonte de verdade dos endpoints — confirme se algo mudou desde
que este prompt foi escrito), `app/scoring.py` (formato do scorecard) e
`CONTRIBUTING.md`.

Se algo neste prompt divergir do código, **o código vence** — e me avise da
divergência em vez de seguir o prompt cegamente.
