# ADR 0001: Processamento Orientado a Evento (Fila) vs. Polling Periódico

## Status
Aprovado

## Contexto
O processamento de gravações de entrevistas envolve etapas de alta latência e consumo de recursos computacionais (transcrição, diarização de áudio e inferência em modelos de linguagem). Precisamos de uma arquitetura que processe cada entrevista de forma isolada e imediata quando estiver disponível, em vez de acumular registros para processamento em lote ou realizar consultas periódicas no banco de dados (polling).

## Decisão
Decidimos utilizar uma **arquitetura orientada a eventos usando uma fila de mensageria assíncrona (Redis + RQ)**. 

Quando um novo áudio está pronto, um webhook notifica a aplicação FastAPI, que insere o registro no banco de dados relacional (PostgreSQL) com o estado inicial e despacha um evento (job) para a fila Redis. O worker consome esse job e orquestra a máquina de estados.

## Consequências
### Prós:
- **Latência Mínima:** A entrevista entra na esteira de processamento imediatamente após o término, sem aguardar intervalos de polling.
- **Isolamento de Recursos:** O servidor web (FastAPI) permanece livre e responsivo, pois o processamento pesado é delegado aos workers RQ.
- **Escalabilidade Horizontal:** É possível escalar a capacidade de transcrição/diarização simplesmente adicionando mais workers RQ apontando para a mesma fila Redis.

### Contras:
- **Infraestrutura Adicional:** Exige a gerência e manutenção de uma instância do Redis e processos workers adicionais em execução.
- **Complexidade de Depuração:** Fluxos assíncronos exigem logs mais estruturados e ferramentas de rastreamento para depuração.
