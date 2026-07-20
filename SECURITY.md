# Política de Segurança

## Versões Suportadas

Este projeto ainda está em `0.x`. Correções de segurança são aplicadas apenas
sobre a branch `main` e a release mais recente.

| Versão | Suportada |
|---|---|
| 0.1.x | ✅ |
| < 0.1 | ❌ |

## Reportando uma Vulnerabilidade

**Não abra uma issue pública** para relatar vulnerabilidades.

Use o **[Private Vulnerability Reporting do GitHub](https://github.com/luccapinto/scorecard-pipeline/security/advisories/new)**
(aba *Security* → *Report a vulnerability*). O canal é privado entre você e os
mantenedores, permite anexos e vira um advisory público apenas depois da
correção.

Ao reportar, inclua sempre que possível:
- Versão/commit afetado e ambiente (Docker Compose, deploy próprio, etc.).
- Passos para reproduzir ou uma prova de conceito.
- Impacto esperado (vazamento de dados de candidatos, execução remota, SSRF...).

**Prazos de resposta:**

| Etapa | Prazo alvo |
|---|---|
| Primeira resposta | 48 horas |
| Triagem e confirmação | 7 dias |
| Correção ou plano de mitigação | 30 dias |

Pedimos que aguarde a publicação da correção antes de divulgar publicamente
(*coordinated disclosure*). Créditos aos reportantes são dados no advisory,
salvo pedido em contrário.

## Modelo de Ameaças e Superfície de Ataque

Este pipeline processa **gravações e dados pessoais de candidatos**, o que o
coloca no escopo da LGPD. Os pontos sensíveis são:

- **Webhook de ingestão (`POST /webhooks/recording`)**: aceita URLs e caminhos
  de arquivo controlados pelo chamador. Protegido por assinatura HMAC-SHA256
  (`WEBHOOK_HMAC_SECRET`), guarda de SSRF (recusa hosts que resolvem para
  endereços privados/loopback/link-local), limite de tamanho de download e
  restrição de caminhos locais a `AUDIO_ALLOWED_DIR`.
- **Endpoints de leitura e decisão**: protegidos por `API_KEY` (header
  `X-API-Key`) e por tokens de decisão nos links de aprovação.
- **Provedores externos** (Deepgram, OpenAI, OpenRouter): o áudio e a
  transcrição da entrevista são enviados a terceiros conforme o provider
  configurado. Ao processar dados reais, verifique os contratos de tratamento
  de dados desses fornecedores — ou use `TRANSCRIPTION_PROVIDER=local`, que
  mantém transcrição e diarização inteiramente na sua infraestrutura.
- **Retenção**: `RETENTION_DAYS` expurga entrevistas em estado terminal. O
  valor padrão `0` **desativa** o expurgo — defina-o explicitamente ao operar
  com dados reais.

## Práticas Recomendadas ao Operar

- **Nunca comite segredos.** O `.env` está no `.gitignore`; use o `.env.example`
  apenas como referência de estrutura.
- **Em produção, sempre defina** `WEBHOOK_HMAC_SECRET`, `API_KEY` e
  `AUDIO_ALLOWED_DIR`. Quando vazios, o código roda em modo permissivo de
  desenvolvimento e registra avisos.
- **Rotacione as chaves de API** dos provedores periodicamente e use chaves
  dedicadas a este projeto, com o menor escopo possível.
- **Não exponha a API diretamente à internet** sem TLS e sem um proxy reverso.
