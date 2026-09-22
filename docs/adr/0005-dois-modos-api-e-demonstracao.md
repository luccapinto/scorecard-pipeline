# ADR 0005: Dois modos na interface — API e Demonstração — nunca misturados

## Status

Aprovado

## Contexto

A SPA precisava deixar de ser utilitária e passar a explicar o produto: qualquer
pessoa que abre o projeto deve entender em dois minutos que (a) o LLM pode
alucinar uma citação, (b) o sistema detecta isso, e (c) nenhuma decisão sobre
uma pessoa é tomada por máquina.

Esse objetivo colide com o contrato real da API. Verificado em `app/main.py`,
`app/models.py` e `app/tasks.py`, o backend **não** modela:

- **Candidato como entidade.** Existem `recording_url`, `job_id` e
  `external_id`. O nome do candidato mora dentro do JSON do `scorecard`,
  gerado pelo modelo.
- **Funil de contratação.** `status` é o estado de *processamento de uma
  entrevista*, não a fase de um candidato num processo seletivo.
- **Autoria de decisão.** A autenticação é uma chave compartilhada; a API não
  sabe *quem* aprovou.
- **Trilha de auditoria.** Só `created_at`/`updated_at` por entrevista, e
  `updated_at` se move a cada escrita na linha (`onupdate`), não apenas em
  transição de estágio.
- **Histórico de mensagens.** `app/notifications.py` dispara Slack e webhook e
  não armazena nada.
- **Texto das âncoras BARS.** Ele existe em `data/synthetic/competency_*.json`,
  mas nenhum endpoint o serve; `GET /jobs` devolve apenas `{job_id, title}`.

Ou seja: as telas que melhor contam a história do produto — funil, auditoria,
histórico de entrega, escala BARS por trás da nota — dependem de dados que a
API não tem.

## Decisão

A interface tem **dois modos, explícitos e nunca misturados**.

### Modo API (padrão)

Fonte de verdade. Nenhum dado fabricado. Onde o contrato não tem resposta, a UI
**declara a ausência** e explica por quê, em uma linha. As explicações vivem em
um único lugar (`src/data/source.ts`, `API_GAPS`) e são reutilizadas literalmente
em toda superfície onde a lacuna aparece.

Isso é estrutural, não disciplina. Cada fonte de dados declara um conjunto de
`capabilities`; as telas ramificam na capacidade e renderizam `<Gap>` quando ela
é falsa. Um campo não pode ser preenchido com invenção porque, sem a capacidade,
**o método não existe** na fonte.

### Modo Demonstração (opt-in)

Dataset sintético determinístico, servido inteiramente no cliente, que encena o
ciclo completo. Regras que valem como invariantes de código:

1. **Zero rede.** Nenhuma requisição sai do navegador em modo demo. Provado por
   `src/demo/isolation.test.tsx`, que dirige a aplicação real com `fetch`,
   `XMLHttpRequest.open` e `navigator.sendBeacon` substituídos por espiões que
   lançam, e exige zero chamadas ao fim de cada fluxo — inclusive da decisão,
   que é a única escrita do produto.
2. **Inequivocamente sintético.** Banner persistente e não dispensável em toda
   tela, IDs prefixados `demo-`, nomes impossíveis de confundir com pessoas
   reais ("Ana Sintética", "Bruno Exemplo"), e o rótulo *sintética* em cada
   painel que só existe no demo.
3. **Alimentado pelos dados do repositório.** `src/demo/reference.generated.ts`
   é **gerado** de `data/synthetic/job_*.json` e `competency_*.json` por
   `npm run build:demo-reference`. Copiar à mão garantiria divergência na
   primeira edição de uma competência.
4. **Determinístico, com relógio ancorado.** Não há PRNG nem `Date.now()` no
   dataset: o estado é `(âncora, lista ordenada de ações) → tela`. Sem `?t=` na
   URL a âncora é o instante do carregamento, então as datas são genuinamente
   relativas ao agora; com `?t=<epoch>` a âncora é fixa e toda execução produz
   os mesmos pixels — que é o que torna o script de screenshots e os testes
   reproduzíveis.
5. **Sem dependência de build.** A direção de dependência é de mão única:
   nada em `api/`, `lib/`, `components/` ou `features/` importa de `demo/`.
   O único ponto de entrada é um `import()` dinâmico em `App.tsx`, verificado
   por `src/data/isolation.test.ts`. Na prática isso também mantém o demo fora
   do bundle inicial (chunk próprio de ~12 KB gzip).

O modo mora **na rota** (`#/demo/...`), não em uma flag persistida. O requisito
"um link compartilhado deve abrir no mesmo modo" é incompatível com
`localStorage`: quem recebe o link tem o armazenamento dele, não o seu.

### Uma detecção de alucinação que é real, inclusive no demo

`evidence_verified` não é declarado no dataset sintético: é **derivado**. O
cliente porta a regra de substring normalizada de `app/text_utils.py::clean_text`
(`src/lib/evidence.ts`) e a executa contra a transcrição. Uma citação sinalizada
no demo está sinalizada porque realmente não existe no texto —
`src/demo/dataset.test.ts` verifica os dois sentidos. A meia-regra difusa
(`rapidfuzz.partial_ratio`) permanece no servidor e é apenas aproximada no
cliente, como dica de "trecho mais parecido"; ela nunca sobrepõe o veredito do
servidor.

O port é fixado contra a saída real do Python em `src/lib/evidence.test.ts`.

## Alternativas rejeitadas

**Fabricar dados no modo API.** Rejeitada de forma categórica. Num projeto cuja
tese é *detectar alucinação*, uma interface que alucina dados destrói o próprio
argumento. Um campo honestamente vazio com uma linha de explicação é mais forte,
em portfólio, que um campo preenchido com invenção.

**Construir o ATS de verdade no backend.** Exigiria entidade candidato, fases de
funil, usuários e papéis, autoria de decisão e persistência de mensagens — ou
seja, um produto diferente, com migrações, modelo de permissão e superfície de
dados pessoais. Fora de escopo, e escopo maior que o resto do sistema.

**Só o modo demonstração.** Mais bonito e mais fácil, e transformaria o projeto
numa maquete. O valor aqui é haver um backend real por trás.

## Adição de backend: `GET /integrations`

Uma única adição foi feita, para que a tela de integrações mostre estado
**real** em vez de encenado:

```
GET /integrations   (X-API-Key)
→ { "slack": {"configured": true},
    "webhook": {"configured": false},
    "transcription": {"provider": "deepgram", "model": "nova-3", "configured": true},
    "scoring": {"provider": "openrouter", "model": "google/gemini-2.5-flash", "configured": true},
    "webhook_hmac": {"enabled": true}, "api_key": {"enabled": true} }
```

Envelope de segurança, todo ele obrigatório e testado:

- **Apenas booleanos e nomes de provider/modelo.** Nenhum valor de segredo, nem
  parcial, nem mascarado. As URLs de Slack e webhook *são* segredos: o endpoint
  expõe apenas se estão definidas.
- Nada que revele caminho de arquivo ou host interno.
- Protegido por `X-API-Key`, pela mesma dependência dos demais endpoints.
- Sem migração de banco e sem alteração em endpoint existente.
- `tests/test_integrations_endpoint.py` inclui um *leak guard*: popula as
  configurações com sentinelas distintas, serializa a resposta e afirma que
  nenhuma delas aparece.

A regra de `configured` é por provider e está documentada porque não é óbvia:
`deepgram` depende de `DEEPGRAM_API_KEY`, `openai` de `OPENAI_API_KEY`, e
`local` de `HF_TOKEN` — porque o caminho local usa o diarizador pyannote, que
falha sem o token. Reportar `local` como configurado sem `HF_TOKEN` seria uma
meia-verdade do mesmo tipo que este ADR existe para evitar.

Se um deployment roda um backend anterior a este endpoint, a resposta é 404 e a
tela cai no texto "não exposto por esta API" — a ausência é tratada como
funcionalidade faltante, não como erro.

## Consequências

### Prós

- A tese do projeto fica demonstrável sem que a demonstração minta.
- A honestidade é verificável: três testes de arquitetura e isolamento
  (`data/isolation.test.ts`, `demo/isolation.test.tsx`) falham a build se
  alguém acoplar as camadas ou vazar uma requisição.
- O demo é reproduzível, o que torna screenshots e testes de UI estáveis.
- O modo API fica mais leve: o demo inteiro é um chunk separado.

### Contras, aceitos

- **Duas implementações da mesma interface de dados.** Uma mudança no contrato
  exige tocar `apiSource` e `demoSource`. Mitigado por `DataSource` ser um tipo
  estreito e por os dois compartilharem tipos e normalização.
- **O demo parece um simulador.** O avanço da esteira é um botão, não um timer.
  É uma escolha estética deliberada: num projeto sobre não fingir, um relógio
  que corre sozinho valeria menos que um passo explícito e reproduzível.
- **Um endpoint a mais para manter** no backend, ainda que trivial.
- **`evidence_verified: null` aparece no demo** mesmo não sendo produzido pelo
  pipeline atual (ver divergências abaixo). Está rotulado como estado
  defensivo, não como comportamento do sistema.

## Divergências encontradas no código

Registradas porque contradizem suposições comuns sobre o sistema:

1. **`evidence_verified` nunca é `null` em dado produzido pelo pipeline.**
   `app/services.py::score_interview` sobrescreve o campo de toda avaliação com
   um `bool` vindo de `EvidenceValidator.validate_evidence`, que jamais retorna
   `None`. O `None` só existe como default do modelo Pydantic antes do
   pós-processamento. A UI trata os três estados (o tipo da API os admite e um
   dado gravado por outro caminho pode trazê-lo), mas `null` é um estado
   defensivo, não um resultado do pipeline.
2. **A API responde 401, nunca 403.** `app/security.py` levanta 401 tanto para
   chave inválida quanto para assinatura HMAC inválida.
3. **`error_log` é um traceback Python inteiro**, não uma mensagem
   (`traceback.format_exc()` em `app/tasks.py::_record_failure`).
4. **`problems` em `/health` traz nomes de classe de exceção**, não texto
   legível (`str(e.__class__.__name__)`).
5. **O token de decisão é inalcançável pela SPA.** `serialize_interview` exclui
   `approval_token` de toda resposta, e `_apply_decision` o apaga na primeira
   decisão. Exibi-lo redigido não é uma política nossa: a API nunca o entrega.
6. **`GET /recordings` devolve `[]` num clone novo.** Ele varre `*.wav` em
   `JOBS_DIR` (= `data/synthetic`), que versiona apenas JSON; os áudios vêm de
   `scripts/generate_synthetic.py`.
7. **`updated_at` se move a qualquer escrita na linha**, então "tempo no
   estágio" não é derivável. A UI rotula o que é de fato mensurável: "tempo
   desde a última atualização".

## Próximos passos

Ficaram fora de escopo, cada um por um motivo:

1. **Paginação e projeção em `GET /interviews`.** Hoje o endpoint devolve toda
   entrevista com transcrição e scorecard inteiros. O cliente contorna com uma
   projeção memoizada (`src/lib/projection.ts`) e virtualização acima de 200
   itens, mas isso é remediação: o payload continua crescendo linearmente.
2. **Entidade candidato.** Sem ela não há histórico por pessoa, nem candidatura
   sem entrevista, e o nome continua vindo de dentro do scorecard.
3. **Autoria de decisão.** Exige usuários e papéis; hoje a auth é uma chave
   compartilhada.
4. **Trilha de auditoria real**, com carimbo de tempo por transição.
5. **Endpoint servindo `competency_*.json`**, para que a escala BARS apareça
   também no modo API.
6. **HTML de `/interviews/{id}/decision` renderizado pela SPA**, em vez da
   página crua atual.
