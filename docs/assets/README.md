# Capturas de tela

Geradas por `frontend/scripts/screenshots.mjs` a partir do **build showcase**
(a demonstração pública), cujo dataset é sintético e determinístico. Todos os
nomes, vagas e decisões nas imagens são fictícios.

Para regenerar:

```bash
cd frontend
npm run build:showcase
npm run preview:showcase -- --port 4173 &
npm run screenshots
```

| Arquivo | Tela |
| --- | --- |
| `inicio.png` | Página inicial |
| `esteira.png` | Esteira |
| `entrevista-alerta.png` | Scorecard com citação que não existe |
| `entrevista-citacao.png` | Citação verificada na transcrição |
| `tour-5.png` | Tour, passo 5: A citação que não existe |
| `tour-3.png` | Tour, passo 3: A esteira processa, etapa por etapa |
| `decisoes.png` | Decisões |
| `por-dentro.png` | Por trás do produto |
| `integracoes.png` | Slack e integrações |
| `ingestao.png` | Ingestão |
| `funil.png` | Funil de candidatos |
| `falha.png` | Falha reprocessável |
| `entrevistas.png` | Lista de entrevistas |
| `saude.png` | Saúde e observabilidade |
| `inicio-escuro.png` | Página inicial (tema escuro) |
| `entrevista-alerta-escuro.png` | Scorecard com citação que não existe (tema escuro) |
| `inicio-mobile.png` | Página inicial (mobile, 390px) |
| `esteira-mobile.png` | Esteira (mobile, 390px) |
| `tour-5-mobile.png` | Tour, passo 5: A citação que não existe (mobile, 390px) |
