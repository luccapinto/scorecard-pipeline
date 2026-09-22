// GENERATED FILE — do not edit by hand.
//
// Source: data/synthetic/job_*.json and data/synthetic/competency_*.json
// Regenerate: npm run build:demo-reference
//
// These are the repository's own synthetic job profiles and BARS competency
// frameworks — the same fixtures the scoring prompt is built from. The demo
// dataset is derived from them so the demonstration shows the real evaluation
// rubric, not an invented one.

export interface DemoBarsLevel {
  score: number;
  text: string;
}

export interface DemoCompetency {
  name: string;
  description: string;
  levels: DemoBarsLevel[];
}

export interface DemoJobProfile {
  jobId: string;
  title: string;
  description: string;
  requirements: string[];
  competencies: DemoCompetency[];
}

export const DEMO_JOB_PROFILES: DemoJobProfile[] = [
  {
    "jobId": "dados_senior",
    "title": "Engenheiro de Dados Sênior",
    "description": "Responsável por projetar e manter pipelines de dados em larga escala, modelar o data warehouse, garantir qualidade e governança de dados e suportar casos de uso de analytics e machine learning. Stack principal: Airflow, Spark, dbt, BigQuery e Kafka.",
    "requirements": [
      "Experiência sólida com orquestração de pipelines (Airflow ou similar)",
      "Domínio de processamento distribuído com Spark",
      "Modelagem dimensional e arquitetura de data warehouse (dbt, BigQuery/Snowflake)",
      "Experiência com streaming de eventos (Kafka, Pub/Sub)",
      "Práticas de qualidade de dados (testes, contratos, lineage)",
      "Capacidade de mentoria e comunicação com áreas de negócio"
    ],
    "competencies": [
      {
        "name": "Modelagem e Arquitetura de Dados",
        "description": "Capacidade de modelar data warehouses (dimensional, data vault) e desenhar arquiteturas de dados escaláveis.",
        "levels": [
          {
            "score": 1,
            "text": "Não conhece conceitos de modelagem dimensional ou camadas de data warehouse."
          },
          {
            "score": 2,
            "text": "Conhece os termos mas não justifica escolhas de modelagem com trade-offs."
          },
          {
            "score": 3,
            "text": "Modela star schema competente, entende camadas staging/marts e particionamento básico."
          },
          {
            "score": 4,
            "text": "Justifica escolhas com trade-offs claros, domina particionamento/clustering e evolução de schema."
          },
          {
            "score": 5,
            "text": "Desenha arquiteturas completas com contratos de dados, lineage e estratégia de custo bem fundamentada."
          }
        ]
      },
      {
        "name": "Orquestração de Pipelines",
        "description": "Domínio de orquestradores (Airflow), idempotência, backfills e tratamento de falhas em pipelines batch.",
        "levels": [
          {
            "score": 1,
            "text": "Nunca operou um orquestrador de pipelines."
          },
          {
            "score": 2,
            "text": "Agenda DAGs simples mas não trata falhas nem reprocessamento."
          },
          {
            "score": 3,
            "text": "Constrói DAGs idempotentes com retries e alertas básicos."
          },
          {
            "score": 4,
            "text": "Domina backfills, sensores, SLAs e desenha DAGs com dependências complexas e reprocessamento seguro."
          },
          {
            "score": 5,
            "text": "Define padrões de orquestração para o time inteiro, com frameworks internos e observabilidade completa."
          }
        ]
      },
      {
        "name": "Processamento Distribuído",
        "description": "Conhecimento profundo de Spark: particionamento, shuffle, skew, tuning de jobs e otimização de custo.",
        "levels": [
          {
            "score": 1,
            "text": "Não sabe explicar como o Spark distribui o processamento."
          },
          {
            "score": 2,
            "text": "Usa Spark como caixa-preta, sem noção de particionamento ou shuffle."
          },
          {
            "score": 3,
            "text": "Entende partições, evita collect em driver e resolve problemas comuns de memória."
          },
          {
            "score": 4,
            "text": "Diagnostica skew e shuffle excessivo, usa broadcast join e tuning de executores com critério."
          },
          {
            "score": 5,
            "text": "Otimiza jobs de larga escala com evidência de custo e latência, e orienta o time em tuning avançado."
          }
        ]
      },
      {
        "name": "Qualidade e Governança de Dados",
        "description": "Práticas de testes de dados, contratos, monitoramento de freshness e tratamento de incidentes de dados.",
        "levels": [
          {
            "score": 1,
            "text": "Não aplica nenhuma prática de qualidade de dados."
          },
          {
            "score": 2,
            "text": "Depende de reclamação do usuário para descobrir dado quebrado."
          },
          {
            "score": 3,
            "text": "Usa testes de schema e nulidade (dbt tests ou similar) nas tabelas críticas."
          },
          {
            "score": 4,
            "text": "Implementa contratos de dados, monitora freshness/volume e conduz post-mortem de incidentes de dados."
          },
          {
            "score": 5,
            "text": "Estabelece governança completa com lineage, SLAs de dados e cultura de qualidade no time."
          }
        ]
      },
      {
        "name": "Comunicação Técnica e Mentoria",
        "description": "Clareza ao explicar decisões técnicas para públicos diversos e histórico de desenvolvimento de pessoas.",
        "levels": [
          {
            "score": 1,
            "text": "Não consegue explicar decisões técnicas com clareza."
          },
          {
            "score": 2,
            "text": "Explica apenas para pares técnicos, com dificuldade com áreas de negócio."
          },
          {
            "score": 3,
            "text": "Comunica bem com times técnicos e traduz razoavelmente para o negócio."
          },
          {
            "score": 4,
            "text": "Adapta a comunicação ao público, documenta decisões e mentora juniores ativamente."
          },
          {
            "score": 5,
            "text": "Referência de comunicação: influencia decisões cross-time e forma outros engenheiros seniores."
          }
        ]
      }
    ]
  },
  {
    "jobId": "frontend_junior",
    "title": "Desenvolvedor Frontend Júnior (React)",
    "description": "Atuar no desenvolvimento de interfaces web com React e TypeScript, consumindo APIs REST, escrevendo testes com Testing Library e colaborando em code reviews com o time de produto.",
    "requirements": [
      "Fundamentos sólidos de JavaScript e noções de TypeScript",
      "Conhecimento de React (hooks, estado, ciclo de vida)",
      "Noções de consumo de APIs REST e tratamento de erros",
      "Interesse por testes automatizados (Jest, Testing Library)",
      "Vontade de aprender e receber feedback em code review"
    ],
    "competencies": [
      {
        "name": "Fundamentos de JavaScript e TypeScript",
        "description": "Domínio dos fundamentos da linguagem: tipos, assincronismo, escopo e closures.",
        "levels": [
          {
            "score": 1,
            "text": "Não consegue explicar conceitos básicos da linguagem (tipos, assincronismo)."
          },
          {
            "score": 2,
            "text": "Explica conceitos com imprecisões relevantes e confunde termos fundamentais."
          },
          {
            "score": 3,
            "text": "Explica corretamente promises, escopo e tipos básicos com exemplos simples."
          },
          {
            "score": 4,
            "text": "Domina assincronismo, closures e tipagem, com exemplos concretos de uso."
          },
          {
            "score": 5,
            "text": "Profundidade excepcional para o nível: explica o event loop e decisões de tipagem com clareza."
          }
        ]
      },
      {
        "name": "React e Ecossistema",
        "description": "Conhecimento prático de React: hooks, gerenciamento de estado e renderização.",
        "levels": [
          {
            "score": 1,
            "text": "Nunca construiu nada com React além de tutorial copiado."
          },
          {
            "score": 2,
            "text": "Usou React mas não sabe explicar hooks básicos nem quando o componente re-renderiza."
          },
          {
            "score": 3,
            "text": "Explica useState/useEffect corretamente e já construiu features pequenas de forma autônoma."
          },
          {
            "score": 4,
            "text": "Entende re-renderização, memoização e levantamento de estado, com projeto próprio relevante."
          },
          {
            "score": 5,
            "text": "Nível raro para júnior: arquitetura de estado bem justificada e contribuições em projetos reais."
          }
        ]
      },
      {
        "name": "Qualidade e Testes",
        "description": "Familiaridade com testes automatizados de frontend e hábitos de qualidade.",
        "levels": [
          {
            "score": 1,
            "text": "Nunca escreveu um teste automatizado."
          },
          {
            "score": 2,
            "text": "Sabe que testes existem mas nunca aplicou em projeto próprio."
          },
          {
            "score": 3,
            "text": "Escreveu testes básicos com Jest/Testing Library em algum projeto."
          },
          {
            "score": 4,
            "text": "Testa comportamento do usuário (não implementação) e entende o valor de cada camada de teste."
          },
          {
            "score": 5,
            "text": "Cultura de testes exemplar para o nível, com TDD ocasional e testes de acessibilidade."
          }
        ]
      },
      {
        "name": "Colaboração e Aprendizado",
        "description": "Postura diante de feedback, curiosidade e capacidade de aprender de forma autônoma.",
        "levels": [
          {
            "score": 1,
            "text": "Postura defensiva; não demonstra nenhuma estratégia de aprendizado."
          },
          {
            "score": 2,
            "text": "Aprendizado passivo, depende de cursos prontos e não busca feedback ativamente."
          },
          {
            "score": 3,
            "text": "Recebe bem feedback e demonstra plano de estudo consistente."
          },
          {
            "score": 4,
            "text": "Busca feedback ativamente, estuda com projetos práticos e documenta o que aprende."
          },
          {
            "score": 5,
            "text": "Aprendizado exemplar: contribui em comunidade, ensina outros e itera rápido sobre críticas."
          }
        ]
      }
    ]
  },
  {
    "jobId": "python_pleno",
    "title": "Desenvolvedor Python Pleno",
    "description": "Responsável por desenvolver APIs eficientes e robustas utilizando FastAPI e SQLAlchemy, integrar o sistema com filas de mensageria usando Redis e RQ, manter a qualidade da base de código com testes automatizados e participar do ciclo completo de deploy com Docker e CI/CD.",
    "requirements": [
      "Experiência com Python e frameworks assíncronos (FastAPI/Tornado/Sanic)",
      "Conhecimento sólido de SQL e ORMs (SQLAlchemy, SQLModel)",
      "Experiência com Redis e filas de tarefas em background (RQ, Celery)",
      "Familiaridade com Docker e Docker Compose",
      "Conhecimentos em testes automatizados (pytest)",
      "Experiência com observabilidade (logs estruturados, métricas)"
    ],
    "competencies": [
      {
        "name": "Comunicação e Code-switching",
        "description": "Capacidade de se comunicar claramente sobre termos técnicos de engenharia em inglês no contexto de falas em português.",
        "levels": [
          {
            "score": 1,
            "text": "Comunicação confusa e insegura, com dificuldade de se expressar utilizando termos técnicos apropriados."
          },
          {
            "score": 2,
            "text": "Consegue se expressar, mas comete erros constantes de pronúncia ou usa termos técnicos de forma errada."
          },
          {
            "score": 3,
            "text": "Comunicação clara e fluida, utilizando termos técnicos comuns em inglês adequadamente (code-switching)."
          },
          {
            "score": 4,
            "text": "Excelente habilidade de comunicação, detalha decisões técnicas usando termos em inglês com muita propriedade."
          },
          {
            "score": 5,
            "text": "Excepcional habilidade comunicativa, transita entre conceitos técnicos complexos com clareza exemplar."
          }
        ]
      },
      {
        "name": "Conhecimento de Infraestrutura e Banco de Dados",
        "description": "Domínio técnico de modelagem relacional, otimização de queries e transações no PostgreSQL, e cache/filas com Redis.",
        "levels": [
          {
            "score": 1,
            "text": "Não demonstra conhecimento básico de banco de dados ou Redis."
          },
          {
            "score": 2,
            "text": "Conhecimento superficial; compreende o papel do banco mas não sabe projetar tabelas ou queries otimizadas."
          },
          {
            "score": 3,
            "text": "Consegue modelar entidades, realizar CRUD básico no Postgres e configurar Redis básico para cache."
          },
          {
            "score": 4,
            "text": "Demonstra bom conhecimento de transações, índices Postgres, resiliência de filas com Redis/RQ e persistência."
          },
          {
            "score": 5,
            "text": "Domínio avançado, propõe otimizações complexas de banco, particionamento ou alta disponibilidade em filas Redis."
          }
        ]
      },
      {
        "name": "Arquitetura de APIs e Boas Práticas",
        "description": "Capacidade de projetar APIs REST bem estruturadas, aplicar padrões de projeto e manter qualidade de código com testes.",
        "levels": [
          {
            "score": 1,
            "text": "Não conhece princípios de design de API nem práticas de qualidade de código."
          },
          {
            "score": 2,
            "text": "Conhece conceitos básicos de REST mas não aplica testes nem padrões de forma consistente."
          },
          {
            "score": 3,
            "text": "Projeta endpoints REST coerentes, escreve testes unitários e conhece princípios SOLID."
          },
          {
            "score": 4,
            "text": "Projeta APIs com versionamento, tratamento de erros consistente, cobertura de testes sólida e revisão de código ativa."
          },
          {
            "score": 5,
            "text": "Referência em arquitetura: idempotência, contratos, observabilidade e estratégia de testes em múltiplas camadas."
          }
        ]
      },
      {
        "name": "Resolução de Problemas e Troubleshooting",
        "description": "Capacidade de diagnosticar incidentes em produção de forma estruturada, da hipótese à causa raiz.",
        "levels": [
          {
            "score": 1,
            "text": "Não consegue descrever nenhum processo de diagnóstico de problemas."
          },
          {
            "score": 2,
            "text": "Depende totalmente de terceiros para investigar problemas; relato vago de incidentes."
          },
          {
            "score": 3,
            "text": "Consegue investigar logs e reproduzir bugs, com método razoável de eliminação de hipóteses."
          },
          {
            "score": 4,
            "text": "Diagnostica incidentes com método claro, usa métricas e logs estruturados, e descreve causa raiz com precisão."
          },
          {
            "score": 5,
            "text": "Conduz post-mortems exemplares, propõe prevenção sistêmica e melhora a observabilidade após cada incidente."
          }
        ]
      }
    ]
  }
];
