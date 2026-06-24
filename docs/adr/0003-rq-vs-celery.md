# ADR 0003: Escolha de Fila Simples (RQ) vs. Celery

## Status
Aprovado

## Contexto
Para processar os áudios e interagir com as LLMs de forma assíncrona, necessitamos de uma infraestrutura de filas em Python. Celery é a ferramenta mais popular do ecossistema Python para esta finalidade, mas possui alta complexidade de configuração e manutenção.

## Decisão
Decidimos utilizar **Redis Queue (RQ)** como biblioteca de processamento de filas, em conjunto com o Redis.

RQ é um gerenciador de filas leve, construído inteiramente sobre o Redis, que se integra perfeitamente com código Python simples. Ele nos fornece o suporte necessário para execução de tarefas em segundo plano, monitoramento de falhas e re-enfileiramento com o menor overhead possível.

## Consequências
### Prós:
- **Simplicidade Extrema:** A curva de aprendizado é quase nula e a inicialização de workers exige apenas uma linha de comando (`rq worker`).
- **Menos Código Boilerplate:** A serialização de funções em Python é nativa, facilitando o enfileiramento sem configurações complexas de serializadores JSON/Pickle do Celery.
- **Rápida Depuração:** Facilidade em ler chaves no Redis diretamente para diagnosticar o estado da fila.

### Contras:
- **Ausência de Recursos Avançados nativos:** Não possui recursos complexos como workflows avançados (chains, chords, groups) nativos de forma tão poderosa quanto o Celery.
- **Acoplamento com Redis:** O RQ é desenhado estritamente para funcionar com Redis, não permitindo migrar facilmente para brokers como RabbitMQ ou Amazon SQS (o que não é um problema para este escopo de projeto).
