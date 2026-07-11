"""
Realistic synthetic interview profiles for end-to-end testing.

Each profile bundles a job description, a BARS competency framework, an
evaluation checklist and a full dialogue script. The three profiles cover the
scoring spectrum on purpose:

- python_pleno:   strong mid-level backend candidate (expected: Aprovado)
- dados_senior:   senior data engineer with mixed answers (expected: Próxima
                  Etapa / discriminating scores between competencies)
- frontend_junior: weak junior candidate with vague answers (expected:
                  Rejeitado / low scores)

Dialogues intentionally include PT-EN code-switching, hesitations and
concrete metrics so evidence quotes can be validated against realistic text.
"""
from dataclasses import dataclass, field
from typing import Dict

from app.schemas import (
    JobDescription,
    Competency,
    CompetencyFramework,
    EvaluationChecklist,
    DialogueTurn,
    DialogueScript,
)

DEFAULT_INTERVIEWER_VOICE = "pt-BR-FranciscaNeural"
DEFAULT_CANDIDATE_VOICE = "pt-BR-AntonioNeural"


@dataclass
class InterviewProfile:
    prefix: str
    job: JobDescription
    competencies: CompetencyFramework
    checklist: EvaluationChecklist
    dialogue: DialogueScript
    interviewer_voice: str = DEFAULT_INTERVIEWER_VOICE
    candidate_voice: str = DEFAULT_CANDIDATE_VOICE
    expected_outcome: str = field(default="Aprovado")


def _turns(*pairs) -> DialogueScript:
    return DialogueScript(
        turns=[DialogueTurn(speaker=s, text=t) for s, t in pairs]
    )


# =====================================================================
# Profile 1 — Desenvolvedor Python Pleno (candidato forte)
# =====================================================================
PYTHON_PLENO = InterviewProfile(
    prefix="python_pleno",
    expected_outcome="Aprovado",
    job=JobDescription(
        title="Desenvolvedor Python Pleno",
        description=(
            "Responsável por desenvolver APIs eficientes e robustas utilizando FastAPI e "
            "SQLAlchemy, integrar o sistema com filas de mensageria usando Redis e RQ, "
            "manter a qualidade da base de código com testes automatizados e participar "
            "do ciclo completo de deploy com Docker e CI/CD."
        ),
        requirements=[
            "Experiência com Python e frameworks assíncronos (FastAPI/Tornado/Sanic)",
            "Conhecimento sólido de SQL e ORMs (SQLAlchemy, SQLModel)",
            "Experiência com Redis e filas de tarefas em background (RQ, Celery)",
            "Familiaridade com Docker e Docker Compose",
            "Conhecimentos em testes automatizados (pytest)",
            "Experiência com observabilidade (logs estruturados, métricas)"
        ]
    ),
    competencies=CompetencyFramework(
        competencies=[
            Competency(
                name="Comunicação e Code-switching",
                description="Capacidade de se comunicar claramente sobre termos técnicos de engenharia em inglês no contexto de falas em português.",
                bars_levels={
                    1: "Comunicação confusa e insegura, com dificuldade de se expressar utilizando termos técnicos apropriados.",
                    2: "Consegue se expressar, mas comete erros constantes de pronúncia ou usa termos técnicos de forma errada.",
                    3: "Comunicação clara e fluida, utilizando termos técnicos comuns em inglês adequadamente (code-switching).",
                    4: "Excelente habilidade de comunicação, detalha decisões técnicas usando termos em inglês com muita propriedade.",
                    5: "Excepcional habilidade comunicativa, transita entre conceitos técnicos complexos com clareza exemplar."
                }
            ),
            Competency(
                name="Conhecimento de Infraestrutura e Banco de Dados",
                description="Domínio técnico de modelagem relacional, otimização de queries e transações no PostgreSQL, e cache/filas com Redis.",
                bars_levels={
                    1: "Não demonstra conhecimento básico de banco de dados ou Redis.",
                    2: "Conhecimento superficial; compreende o papel do banco mas não sabe projetar tabelas ou queries otimizadas.",
                    3: "Consegue modelar entidades, realizar CRUD básico no Postgres e configurar Redis básico para cache.",
                    4: "Demonstra bom conhecimento de transações, índices Postgres, resiliência de filas com Redis/RQ e persistência.",
                    5: "Domínio avançado, propõe otimizações complexas de banco, particionamento ou alta disponibilidade em filas Redis."
                }
            ),
            Competency(
                name="Arquitetura de APIs e Boas Práticas",
                description="Capacidade de projetar APIs REST bem estruturadas, aplicar padrões de projeto e manter qualidade de código com testes.",
                bars_levels={
                    1: "Não conhece princípios de design de API nem práticas de qualidade de código.",
                    2: "Conhece conceitos básicos de REST mas não aplica testes nem padrões de forma consistente.",
                    3: "Projeta endpoints REST coerentes, escreve testes unitários e conhece princípios SOLID.",
                    4: "Projeta APIs com versionamento, tratamento de erros consistente, cobertura de testes sólida e revisão de código ativa.",
                    5: "Referência em arquitetura: idempotência, contratos, observabilidade e estratégia de testes em múltiplas camadas."
                }
            ),
            Competency(
                name="Resolução de Problemas e Troubleshooting",
                description="Capacidade de diagnosticar incidentes em produção de forma estruturada, da hipótese à causa raiz.",
                bars_levels={
                    1: "Não consegue descrever nenhum processo de diagnóstico de problemas.",
                    2: "Depende totalmente de terceiros para investigar problemas; relato vago de incidentes.",
                    3: "Consegue investigar logs e reproduzir bugs, com método razoável de eliminação de hipóteses.",
                    4: "Diagnostica incidentes com método claro, usa métricas e logs estruturados, e descreve causa raiz com precisão.",
                    5: "Conduz post-mortems exemplares, propõe prevenção sistêmica e melhora a observabilidade após cada incidente."
                }
            ),
        ]
    ),
    checklist=EvaluationChecklist(
        items=[
            "O candidato demonstrou experiência prática com otimização de queries no PostgreSQL?",
            "O candidato mencionou o uso de Redis com filas de tarefas em background (RQ ou Celery)?",
            "O candidato demonstrou familiaridade com Docker e docker-compose?",
            "O candidato possui conhecimentos de testes automatizados com pytest?",
            "O candidato descreveu um incidente real de produção e como o diagnosticou?",
            "O candidato citou métricas concretas (latência, volume, tempo de resposta) ao descrever resultados?",
        ]
    ),
    dialogue=_turns(
        ("Entrevistador", "Olá, bem-vindo à nossa entrevista técnica para a vaga de Desenvolvedor Python Pleno. Como você está?"),
        ("Candidato", "Tudo ótimo, obrigado! Fico feliz pela oportunidade de conversar com vocês sobre o time e o projeto."),
        ("Entrevistador", "Perfeito. Para começar, me conta um pouco da sua trajetória com backend em Python."),
        ("Candidato", "Claro. Trabalho com Python há uns cinco anos. Comecei com Django em uma consultoria, e nos últimos três anos estou numa fintech onde a gente migrou um monolito para serviços menores em FastAPI. Hoje eu cuido principalmente da API de pagamentos e da esteira de processamento assíncrono."),
        ("Entrevistador", "Interessante essa migração. Qual foi o maior desafio técnico nela?"),
        ("Candidato", "O maior desafio foi o banco de dados. O monolito tinha queries com cinco ou seis joins que ninguém entendia mais. Eu peguei as dez queries mais lentas pelo pg_stat_statements, rodei explain analyze em cada uma e descobri que a maioria fazia sequential scan em tabelas de milhões de linhas. Criando índices compostos certos e reescrevendo duas queries com CTE, a gente baixou o p95 do endpoint de extrato de mais de dois segundos para uns cento e oitenta milissegundos."),
        ("Entrevistador", "Você mencionou processamento assíncrono. Como é essa esteira hoje?"),
        ("Candidato", "A gente usa Redis com RQ para as tarefas em background. Quando entra um webhook de pagamento, a API só valida, persiste o evento e enfileira o job. O worker processa a conciliação, que pode demorar. Configuramos retry com backoff exponencial e uma dead letter queue para os jobs que estouram as tentativas, porque no começo a gente perdia evento silenciosamente quando o provedor externo caía."),
        ("Entrevistador", "E por que RQ e não Celery?"),
        ("Candidato", "A gente avaliou os dois. O Celery dava mais recursos, tipo chains e chords, mas a nossa necessidade era fila simples com retry. O RQ é muito mais fácil de operar e de debugar, dá para inspecionar as chaves direto no Redis. Menos moving parts, menos coisa para quebrar às três da manhã."),
        ("Entrevistador", "Falando em três da manhã... me conta um incidente de produção que você tenha investigado."),
        ("Candidato", "Teve um clássico. Uma segunda-feira o p99 da API foi de duzentos milissegundos para oito segundos. Primeiro olhei o dashboard no Grafana e vi que o pool de conexões do Postgres estava esgotado. A hipótese inicial era volume, mas o tráfego estava normal. Fui nos logs estruturados, filtrei pelo request id das requisições lentas e achei que todas passavam por um endpoint novo que um colega tinha subido na sexta. Ele abria uma transação e fazia uma chamada HTTP externa dentro da transação. Quando o serviço externo ficou lento, as conexões ficaram presas. A correção foi mover a chamada externa para fora da transação e adicionar timeout. Depois escrevi o post-mortem e a gente adicionou um lint no CI para pegar chamada de rede dentro de transação."),
        ("Entrevistador", "Ótimo relato. E como vocês garantem qualidade de código no dia a dia?"),
        ("Candidato", "Pull request com code review obrigatório de pelo menos uma pessoa, pipeline no GitHub Actions rodando ruff, mypy e a suíte de pytest com cobertura mínima de oitenta por cento. Para as partes críticas, tipo cálculo de tarifas, a gente tem testes de propriedade com hypothesis além dos testes unitários. E teste de integração com Postgres e Redis reais subindo via docker-compose no CI."),
        ("Entrevistador", "Como você estrutura os testes de uma API FastAPI?"),
        ("Candidato", "Em camadas. Unitário para regra de negócio pura, sem IO. Depois testes de endpoint com o TestClient e dependências fakes injetadas via dependency_overrides. E por fim uma suíte menor de integração de ponta a ponta, com banco real, que roda no merge para a main. O que eu evito é mock demais: se o teste mocka tudo, ele passa sempre e não prova nada."),
        ("Entrevistador", "Você usa Docker no fluxo de desenvolvimento?"),
        ("Candidato", "Sim, o ambiente local inteiro sobe com docker compose: API, worker, Postgres e Redis. O Dockerfile é multi-stage para a imagem final ficar pequena, e no deploy a gente publica no ECS com blue-green. A paridade entre dev e produção evita muito bug de ambiente."),
        ("Entrevistador", "E sobre observabilidade, o que vocês têm hoje?"),
        ("Candidato", "Logs estruturados em JSON com correlation id em todas as requisições, métricas no Prometheus com dashboards no Grafana, e alertas de p95, taxa de erro e profundidade da fila. A profundidade da fila foi aprendizado do incidente: hoje se a fila do RQ passa de mil jobs a gente é alertado antes do usuário sentir."),
        ("Entrevistador", "Se você tivesse que desenhar do zero um endpoint que recebe webhooks de um parceiro, o que não poderia faltar?"),
        ("Candidato", "Primeiro, validação de assinatura HMAC para garantir a origem. Segundo, idempotência: o parceiro vai reenviar o mesmo evento, então eu guardo um external id com constraint de unicidade e retorno o registro existente em vez de duplicar. Terceiro, responder rápido com duzentos e dois e processar de forma assíncrona na fila. E por fim, uma rotina de reconciliação, porque webhook se perde, sempre."),
        ("Entrevistador", "Excelente. Tem algo que você gostaria de perguntar para a gente?"),
        ("Candidato", "Sim. Como é o processo de vocês quando um incidente acontece? Vocês fazem post-mortem sem culpados? E queria entender também como o time decide o que entra de dívida técnica no planejamento."),
        ("Entrevistador", "Ótimas perguntas, a gente faz post-mortem blameless sim, e reserva vinte por cento da sprint para dívida técnica. Bom, da minha parte era isso. Muito obrigado pelo seu tempo!"),
        ("Candidato", "Obrigado a você! Fico no aguardo do feedback sobre a próxima etapa do processo."),
    ),
)


# =====================================================================
# Profile 2 — Engenheiro de Dados Sênior (candidato mediano, respostas mistas)
# =====================================================================
DADOS_SENIOR = InterviewProfile(
    prefix="dados_senior",
    expected_outcome="Próxima Etapa",
    job=JobDescription(
        title="Engenheiro de Dados Sênior",
        description=(
            "Responsável por projetar e manter pipelines de dados em larga escala, "
            "modelar o data warehouse, garantir qualidade e governança de dados e "
            "suportar casos de uso de analytics e machine learning. Stack principal: "
            "Airflow, Spark, dbt, BigQuery e Kafka."
        ),
        requirements=[
            "Experiência sólida com orquestração de pipelines (Airflow ou similar)",
            "Domínio de processamento distribuído com Spark",
            "Modelagem dimensional e arquitetura de data warehouse (dbt, BigQuery/Snowflake)",
            "Experiência com streaming de eventos (Kafka, Pub/Sub)",
            "Práticas de qualidade de dados (testes, contratos, lineage)",
            "Capacidade de mentoria e comunicação com áreas de negócio"
        ]
    ),
    competencies=CompetencyFramework(
        competencies=[
            Competency(
                name="Modelagem e Arquitetura de Dados",
                description="Capacidade de modelar data warehouses (dimensional, data vault) e desenhar arquiteturas de dados escaláveis.",
                bars_levels={
                    1: "Não conhece conceitos de modelagem dimensional ou camadas de data warehouse.",
                    2: "Conhece os termos mas não justifica escolhas de modelagem com trade-offs.",
                    3: "Modela star schema competente, entende camadas staging/marts e particionamento básico.",
                    4: "Justifica escolhas com trade-offs claros, domina particionamento/clustering e evolução de schema.",
                    5: "Desenha arquiteturas completas com contratos de dados, lineage e estratégia de custo bem fundamentada."
                }
            ),
            Competency(
                name="Orquestração de Pipelines",
                description="Domínio de orquestradores (Airflow), idempotência, backfills e tratamento de falhas em pipelines batch.",
                bars_levels={
                    1: "Nunca operou um orquestrador de pipelines.",
                    2: "Agenda DAGs simples mas não trata falhas nem reprocessamento.",
                    3: "Constrói DAGs idempotentes com retries e alertas básicos.",
                    4: "Domina backfills, sensores, SLAs e desenha DAGs com dependências complexas e reprocessamento seguro.",
                    5: "Define padrões de orquestração para o time inteiro, com frameworks internos e observabilidade completa."
                }
            ),
            Competency(
                name="Processamento Distribuído",
                description="Conhecimento profundo de Spark: particionamento, shuffle, skew, tuning de jobs e otimização de custo.",
                bars_levels={
                    1: "Não sabe explicar como o Spark distribui o processamento.",
                    2: "Usa Spark como caixa-preta, sem noção de particionamento ou shuffle.",
                    3: "Entende partições, evita collect em driver e resolve problemas comuns de memória.",
                    4: "Diagnostica skew e shuffle excessivo, usa broadcast join e tuning de executores com critério.",
                    5: "Otimiza jobs de larga escala com evidência de custo e latência, e orienta o time em tuning avançado."
                }
            ),
            Competency(
                name="Qualidade e Governança de Dados",
                description="Práticas de testes de dados, contratos, monitoramento de freshness e tratamento de incidentes de dados.",
                bars_levels={
                    1: "Não aplica nenhuma prática de qualidade de dados.",
                    2: "Depende de reclamação do usuário para descobrir dado quebrado.",
                    3: "Usa testes de schema e nulidade (dbt tests ou similar) nas tabelas críticas.",
                    4: "Implementa contratos de dados, monitora freshness/volume e conduz post-mortem de incidentes de dados.",
                    5: "Estabelece governança completa com lineage, SLAs de dados e cultura de qualidade no time."
                }
            ),
            Competency(
                name="Comunicação Técnica e Mentoria",
                description="Clareza ao explicar decisões técnicas para públicos diversos e histórico de desenvolvimento de pessoas.",
                bars_levels={
                    1: "Não consegue explicar decisões técnicas com clareza.",
                    2: "Explica apenas para pares técnicos, com dificuldade com áreas de negócio.",
                    3: "Comunica bem com times técnicos e traduz razoavelmente para o negócio.",
                    4: "Adapta a comunicação ao público, documenta decisões e mentora juniores ativamente.",
                    5: "Referência de comunicação: influencia decisões cross-time e forma outros engenheiros seniores."
                }
            ),
        ]
    ),
    checklist=EvaluationChecklist(
        items=[
            "O candidato justificou escolhas de modelagem com trade-offs concretos?",
            "O candidato descreveu um backfill ou reprocessamento real e como garantiu idempotência?",
            "O candidato explicou um problema real de skew ou shuffle no Spark e como resolveu?",
            "O candidato demonstrou experiência prática com streaming (Kafka ou similar)?",
            "O candidato citou práticas concretas de qualidade de dados (testes, contratos, monitoramento)?",
            "O candidato deu exemplo real de mentoria ou desenvolvimento de outra pessoa?",
        ]
    ),
    dialogue=_turns(
        ("Entrevistador", "Boa tarde! Obrigada por participar do processo para Engenheiro de Dados Sênior. Pode se apresentar rapidamente?"),
        ("Candidato", "Boa tarde! Sou engenheiro de dados há uns oito anos. Passei por um banco grande, depois uma healthtech, e hoje estou num marketplace onde lidero a plataforma de dados. O nosso lake processa em torno de quatro terabytes por dia entre eventos e cargas de bancos transacionais."),
        ("Entrevistador", "Como está organizada a arquitetura de dados de vocês hoje?"),
        ("Candidato", "A gente segue uma arquitetura em camadas no BigQuery. Camada raw com os dados como chegam, staging com limpeza e padronização feita em dbt, e a camada de marts com modelagem dimensional para consumo. Os fatos maiores são particionados por data do evento e clusterizados pela chave de junção mais frequente, o que derrubou bem o custo de scan. Quando redesenhamos a tabela de pedidos, o custo mensal de query dela caiu de uns nove mil dólares para menos de três mil."),
        ("Entrevistador", "Por que modelagem dimensional e não algo como data vault?"),
        ("Candidato", "A gente chegou a estudar data vault quando integramos duas aquisições, porque a promessa de flexibilidade de schema era atraente. Mas o custo de complexidade para o time e para os analistas não se pagava: nosso domínio muda menos do que parecia. Star schema é mais simples de consumir, o analista entende fato e dimensão sem treinamento longo. Ficamos com dimensional e resolvemos a integração das aquisições na staging."),
        ("Entrevistador", "Me conta uma situação real de backfill complicado."),
        ("Candidato", "Ano passado descobrimos que um bug no serviço de checkout tinha gravado o campo de desconto errado por três semanas. Precisei reprocessar vinte e um dias da tabela de pedidos, que alimenta o fechamento financeiro. Como as nossas DAGs no Airflow são idempotentes por partição de data, deu para disparar o backfill por intervalo com o próprio Airflow, limitando a concorrência para não estourar os slots do BigQuery. Antes de liberar, rodei uma verificação comparando os agregados por dia entre a versão antiga e a nova numa tabela de auditoria, e só então fizemos o swap. O financeiro validou os números antes da virada."),
        ("Entrevistador", "E no Spark, qual foi o problema de performance mais difícil que você pegou?"),
        ("Candidato", "O clássico skew. Um job de atribuição de marketing juntava a tabela de sessões com a de pedidos pela chave de usuário, e uns três por cento dos usuários, os crawlers e contas de teste, concentravam metade das sessões. Duas tasks ficavam rodando horas enquanto o resto do cluster ficava ocioso. Resolvi em duas frentes: filtrando as contas de serviço antes do join, que era o certo de qualquer forma, e habilitando o adaptive query execution com skew join handling do Spark três. O job caiu de cinco horas para quarenta minutos, no mesmo cluster."),
        ("Entrevistador", "Vocês usam streaming em algum caso?"),
        ("Candidato", "Uso Kafka, mas vou ser honesto: é a parte da stack que eu menos operei diretamente. Tem um time de plataforma que cuida dos clusters, e o meu contato é mais como consumidor, lendo tópicos para materializar agregados quase em tempo real. Sei os conceitos, consumer groups, offsets, particionamento por chave, mas nunca dimensionei um cluster Kafka nem tratei um rebalance problemático em produção. Se a vaga exige profundidade nisso, é um ponto que eu precisaria desenvolver."),
        ("Entrevistador", "Agradeço a franqueza. E como vocês tratam qualidade de dados?"),
        ("Candidato", "Três níveis. Primeiro, testes de dbt nas tabelas críticas: unicidade de chave, nulidade, integridade referencial e alguns testes de razoabilidade de negócio, tipo pedido com valor negativo. Segundo, monitoramento de freshness e volume: se uma tabela atrasa mais que o SLA dela ou o volume varia mais de trinta por cento contra a média móvel, dispara alerta no Slack. Terceiro, quando estoura incidente de dados, a gente trata como incidente de verdade, com dono, comunicação para os consumidores afetados e post-mortem. O que ainda não temos maduro é contrato de dados formal com os times produtores, hoje é acordo de cavalheiros e às vezes quebra."),
        ("Entrevistador", "Como você trabalha a evolução das pessoas do seu time?"),
        ("Candidato", "Tenho dois juniores sob mentoria direta. Com um deles montei um plano de seis meses focado em modelagem: ele começou revisando meus PRs de dbt com um roteiro do que observar, depois passou a modelar marts menores com meu review. Hoje ele é dono de dois marts de logística. A régua que eu uso é: se a pessoa consegue explicar o porquê da modelagem para um analista sem eu estar na sala, ela está pronta."),
        ("Entrevistador", "Se você entrasse aqui amanhã, o que faria nos primeiros noventa dias?"),
        ("Candidato", "Primeiro mês entendendo o terreno: mapa das fontes, dos consumidores e dos incidentes recorrentes, mais conversas com analytics e com os times produtores. Segundo mês, atacaria a maior dor que aparecer nesse mapa, provavelmente confiabilidade de alguma pipeline crítica, para gerar confiança cedo. Terceiro mês, proporia o desenho de médio prazo, com metas de SLA de dados e um plano de governança incremental. Evitaria chegar propondo re-arquitetura antes de entender por que as coisas são como são."),
        ("Entrevistador", "Alguma pergunta para mim?"),
        ("Candidato", "Duas. Qual é hoje o maior gargalo da plataforma de vocês, é custo, confiabilidade ou velocidade de entrega? E o time de dados responde para a engenharia ou para o negócio?"),
        ("Entrevistador", "Boas perguntas, hoje o gargalo é confiabilidade, e o time responde para a engenharia. Muito obrigada pela conversa!"),
        ("Candidato", "Eu que agradeço. Fico à disposição para as próximas etapas."),
    ),
)


# =====================================================================
# Profile 3 — Desenvolvedor Frontend Júnior (candidato fraco)
# =====================================================================
FRONTEND_JUNIOR = InterviewProfile(
    prefix="frontend_junior",
    expected_outcome="Rejeitado",
    job=JobDescription(
        title="Desenvolvedor Frontend Júnior (React)",
        description=(
            "Atuar no desenvolvimento de interfaces web com React e TypeScript, "
            "consumindo APIs REST, escrevendo testes com Testing Library e "
            "colaborando em code reviews com o time de produto."
        ),
        requirements=[
            "Fundamentos sólidos de JavaScript e noções de TypeScript",
            "Conhecimento de React (hooks, estado, ciclo de vida)",
            "Noções de consumo de APIs REST e tratamento de erros",
            "Interesse por testes automatizados (Jest, Testing Library)",
            "Vontade de aprender e receber feedback em code review"
        ]
    ),
    competencies=CompetencyFramework(
        competencies=[
            Competency(
                name="Fundamentos de JavaScript e TypeScript",
                description="Domínio dos fundamentos da linguagem: tipos, assincronismo, escopo e closures.",
                bars_levels={
                    1: "Não consegue explicar conceitos básicos da linguagem (tipos, assincronismo).",
                    2: "Explica conceitos com imprecisões relevantes e confunde termos fundamentais.",
                    3: "Explica corretamente promises, escopo e tipos básicos com exemplos simples.",
                    4: "Domina assincronismo, closures e tipagem, com exemplos concretos de uso.",
                    5: "Profundidade excepcional para o nível: explica o event loop e decisões de tipagem com clareza."
                }
            ),
            Competency(
                name="React e Ecossistema",
                description="Conhecimento prático de React: hooks, gerenciamento de estado e renderização.",
                bars_levels={
                    1: "Nunca construiu nada com React além de tutorial copiado.",
                    2: "Usou React mas não sabe explicar hooks básicos nem quando o componente re-renderiza.",
                    3: "Explica useState/useEffect corretamente e já construiu features pequenas de forma autônoma.",
                    4: "Entende re-renderização, memoização e levantamento de estado, com projeto próprio relevante.",
                    5: "Nível raro para júnior: arquitetura de estado bem justificada e contribuições em projetos reais."
                }
            ),
            Competency(
                name="Qualidade e Testes",
                description="Familiaridade com testes automatizados de frontend e hábitos de qualidade.",
                bars_levels={
                    1: "Nunca escreveu um teste automatizado.",
                    2: "Sabe que testes existem mas nunca aplicou em projeto próprio.",
                    3: "Escreveu testes básicos com Jest/Testing Library em algum projeto.",
                    4: "Testa comportamento do usuário (não implementação) e entende o valor de cada camada de teste.",
                    5: "Cultura de testes exemplar para o nível, com TDD ocasional e testes de acessibilidade."
                }
            ),
            Competency(
                name="Colaboração e Aprendizado",
                description="Postura diante de feedback, curiosidade e capacidade de aprender de forma autônoma.",
                bars_levels={
                    1: "Postura defensiva; não demonstra nenhuma estratégia de aprendizado.",
                    2: "Aprendizado passivo, depende de cursos prontos e não busca feedback ativamente.",
                    3: "Recebe bem feedback e demonstra plano de estudo consistente.",
                    4: "Busca feedback ativamente, estuda com projetos práticos e documenta o que aprende.",
                    5: "Aprendizado exemplar: contribui em comunidade, ensina outros e itera rápido sobre críticas."
                }
            ),
        ]
    ),
    checklist=EvaluationChecklist(
        items=[
            "O candidato explicou corretamente a diferença entre código síncrono e assíncrono?",
            "O candidato soube explicar useState e useEffect com as próprias palavras?",
            "O candidato já escreveu algum teste automatizado, mesmo que simples?",
            "O candidato apresentou algum projeto próprio (não tutorial) com detalhes concretos?",
            "O candidato demonstrou postura receptiva a feedback e um plano de aprendizado?",
        ]
    ),
    dialogue=_turns(
        ("Entrevistador", "Oi, tudo bem? Essa é a entrevista técnica para a vaga de Desenvolvedor Frontend Júnior. Fica tranquilo, é uma conversa. Pode começar se apresentando?"),
        ("Candidato", "Oi, tudo bem sim. Então, eu fiz um bootcamp de programação ano passado, de uns três meses, e desde então eu estou estudando por conta. Fiz alguns projetos seguindo uns vídeos no YouTube, tipo um clone da Netflix e uma lista de tarefas."),
        ("Entrevistador", "Legal. Nesses projetos, o que você construiu de diferente do que o tutorial mostrava?"),
        ("Candidato", "Hum... então, no clone da Netflix eu mudei as cores e troquei a API de filmes por outra. No de tarefas eu segui bem o vídeo mesmo, porque eu estava começando ainda."),
        ("Entrevistador", "Entendi. Me explica com as suas palavras: o que é código assíncrono em JavaScript?"),
        ("Candidato", "Assíncrono é... é quando o código roda mais rápido, né? Tipo, ele roda várias linhas ao mesmo tempo em vez de uma por uma, aí a página carrega mais rápido. Eu uso o await para ele esperar quando precisa."),
        ("Entrevistador", "E o que uma promise representa?"),
        ("Candidato", "Promise eu sei que usa com o fetch. É tipo uma função que retorna os dados da API. Eu sempre coloco o async e o await e funciona, mas confesso que nunca parei para entender direitinho o que acontece por baixo."),
        ("Entrevistador", "Sem problema. E no React, para que serve o useState?"),
        ("Candidato", "O useState guarda as variáveis do componente. Tipo, se eu tenho um contador, eu uso o useState para a variável não sumir. Você usa o set alguma coisa para mudar o valor."),
        ("Entrevistador", "E o useEffect, quando você usaria?"),
        ("Candidato", "O useEffect eu uso para chamar a API. Sempre que eu preciso de um fetch eu ponho dentro do useEffect. Aquele colchete no final eu deixo vazio, porque se não fica chamando infinito. Foi assim que me ensinaram no bootcamp, mas eu não sei bem por que fica infinito sem o colchete."),
        ("Entrevistador", "Você sabe dizer o que faz um componente do React renderizar de novo?"),
        ("Candidato", "Acho que é quando a página atualiza? Tipo quando você dá F5... ou quando muda de rota. Não tenho certeza, essa parte eu ainda confundo um pouco."),
        ("Entrevistador", "Tá. E TypeScript, você já usou?"),
        ("Candidato", "Eu tentei uma vez num projeto, mas dava muito erro vermelho no editor, aí eu voltei para o JavaScript normal para conseguir terminar. Eu pretendo aprender, está na minha lista."),
        ("Entrevistador", "E testes automatizados, você já escreveu algum? Jest, Testing Library?"),
        ("Candidato", "Ainda não. Eu sei que é importante, o pessoal fala muito de Jest, mas nos meus projetos eu testava manualmente, clicando mesmo. Nunca escrevi um teste de código."),
        ("Entrevistador", "Como você faz hoje quando trava num problema de código?"),
        ("Candidato", "Primeiro eu jogo o erro no Google, ou pergunto para o ChatGPT. Se não resolver eu geralmente deixo esse projeto de lado e começo outro, porque ficar travado desanima, né?"),
        ("Entrevistador", "E feedback? Alguém já revisou seu código, num code review por exemplo?"),
        ("Candidato", "Não, nunca participei de code review. Os projetos foram todos sozinho. Mas eu acho que eu lidaria bem, eu não sou de levar crítica para o pessoal."),
        ("Entrevistador", "Para fechar: o que você está estudando agora e qual seu plano para os próximos meses?"),
        ("Candidato", "Agora eu estou vendo uns vídeos de Next.js, porque falam que é o que o mercado pede. Meu plano é fazer mais uns cursos e ir aplicando para vagas. Eu aprendo rápido quando estou trabalhando, eu acho que na prática, com alguém me guiando, eu deslancho."),
        ("Entrevistador", "Entendi. Obrigada pela conversa e pela sinceridade, a gente retorna com o feedback em breve, tá?"),
        ("Candidato", "Obrigado! Espero que dê certo. Qualquer coisa estou à disposição."),
    ),
)


PROFILES: Dict[str, InterviewProfile] = {
    p.prefix: p for p in (PYTHON_PLENO, DADOS_SENIOR, FRONTEND_JUNIOR)
}
