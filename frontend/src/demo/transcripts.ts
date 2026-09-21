// Synthetic interview dialogues, one per job profile.
//
// These exist so the demo's evidence verification is REAL. Every "verified"
// quote below is a literal slice of a candidate turn in the same dialogue, so
// `locateQuote` finds it and highlights it; every "hallucinated" quote is
// plausible wording that appears nowhere, so the same function finds nothing
// and the alarm fires for a genuine reason. Nothing about the flag is
// hardcoded — see `demo/dataset.ts`, which derives it.
//
// SPEAKER_00 is the interviewer, SPEAKER_01 the candidate. Timestamps are
// seconds, matching the Deepgram segment shape the backend stores.

export interface DemoTurn {
  speaker: 'SPEAKER_00' | 'SPEAKER_01';
  text: string;
  start: number;
  end: number;
}

export interface DemoDialogue {
  jobId: string;
  turns: DemoTurn[];
  /** Verbatim quotes, one per competency, in competency order. */
  quotes: string[];
  /**
   * Plausible-but-absent wording, one per competency. Used when a competency
   * is scripted as hallucinated.
   */
  hallucinated: string[];
}

const PYTHON_PLENO: DemoDialogue = {
  jobId: 'python_pleno',
  turns: [
    {
      speaker: 'SPEAKER_00',
      text: 'Bom te ver. Para começar, me conta um pouco da sua rotina com Python no dia a dia.',
      start: 0,
      end: 6.4,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'Claro. Hoje eu trabalho principalmente com FastAPI, e a maior parte do meu tempo é desenhando endpoints assíncronos e cuidando do ciclo de deploy. Eu costumo dizer que o trade-off entre throughput e legibilidade é a decisão mais recorrente do time.',
      start: 6.9,
      end: 22.1,
    },
    {
      speaker: 'SPEAKER_00',
      text: 'E na parte de banco de dados, como vocês organizam isso?',
      start: 22.6,
      end: 26.0,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'A gente usa Postgres com SQLAlchemy. Eu criei índices parciais para as consultas de status, que eram as mais pesadas, e movi o cache de sessão para o Redis com TTL curto. Isso derrubou o p95 de 800 milissegundos para uns 120.',
      start: 26.5,
      end: 43.8,
    },
    {
      speaker: 'SPEAKER_00',
      text: 'Vocês têm fila de tarefas em background?',
      start: 44.2,
      end: 47.0,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'Temos, com RQ em cima do Redis. O ponto que eu mais defendi foi tornar os jobs idempotentes, porque retry sem idempotência só multiplica o estrago. Cada job carrega uma chave externa e a gente ignora reprocessamento repetido.',
      start: 47.4,
      end: 63.9,
    },
    {
      speaker: 'SPEAKER_00',
      text: 'Como você garante qualidade nesse código?',
      start: 64.3,
      end: 67.1,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'Escrevo teste antes quando o comportamento está claro, e uso pytest com fixtures pequenas. Eu tento manter o contrato da API versionado e com tratamento de erro consistente, porque quem consome não deveria adivinhar o formato do erro.',
      start: 67.5,
      end: 83.2,
    },
    {
      speaker: 'SPEAKER_00',
      text: 'Me conta de um incidente em produção que você investigou.',
      start: 83.7,
      end: 87.5,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'Teve um em que a fila parou de drenar de madrugada. Eu comecei pelos logs estruturados, isolei que o worker morria por falta de memória em um lote específico, reproduzi localmente com o mesmo payload e cheguei na causa raiz, que era um join carregando a tabela inteira.',
      start: 88.0,
      end: 106.4,
    },
    {
      speaker: 'SPEAKER_00',
      text: 'E o que mudou depois disso?',
      start: 106.9,
      end: 108.8,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'A gente passou a paginar o lote e eu adicionei uma métrica de tamanho de fila com alerta. Escrevi um post-mortem curto e apresentei para o time, mais para combinar o que a gente olha primeiro numa próxima vez.',
      start: 109.2,
      end: 123.7,
    },
  ],
  quotes: [
    'o trade-off entre throughput e legibilidade é a decisão mais recorrente do time',
    'criei índices parciais para as consultas de status',
    'manter o contrato da API versionado e com tratamento de erro consistente',
    'reproduzi localmente com o mesmo payload e cheguei na causa raiz',
  ],
  hallucinated: [
    'eu apresentei em três conferências internacionais sobre Python assíncrono',
    'desenhei o particionamento por range de todas as tabelas do data warehouse',
    'eu escrevi a RFC de versionamento adotada pela empresa inteira',
    'conduzi o post-mortem do incidente que derrubou a região us-east-1',
  ],
};

const DADOS_SENIOR: DemoDialogue = {
  jobId: 'dados_senior',
  turns: [
    {
      speaker: 'SPEAKER_00',
      text: 'Vamos falar de modelagem. Como você estrutura um warehouse novo?',
      start: 0,
      end: 5.2,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'Eu começo separando camadas: staging cru, uma camada intermediária de entidades e os marts por domínio. Modelo em star schema e defino contrato de dados na fronteira, porque sem contrato o produtor quebra o consumidor sem nem saber.',
      start: 5.6,
      end: 22.8,
    },
    {
      speaker: 'SPEAKER_00',
      text: 'Como é sua experiência com orquestração?',
      start: 23.2,
      end: 26.0,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'Airflow há uns cinco anos. Eu escrevo DAGs idempotentes com backfill parametrizado por data, e trato falha parcial com retry exponencial e alerta só no que é acionável. Alerta que ninguém age vira ruído e some com a confiança do time.',
      start: 26.4,
      end: 44.1,
    },
    {
      speaker: 'SPEAKER_00',
      text: 'E Spark? Conta um caso de tuning.',
      start: 44.5,
      end: 47.3,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'Teve um job diário que levava quatro horas. O problema era skew numa chave de cliente. Eu apliquei salting na chave e reparticionei antes do join, e caiu para quarenta minutos com um terço do custo.',
      start: 47.8,
      end: 63.5,
    },
    {
      speaker: 'SPEAKER_00',
      text: 'Qualidade de dados: como vocês tratam?',
      start: 64.0,
      end: 66.9,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'Testes de schema e de nulidade nas tabelas críticas, monitoramento de freshness com SLA por tabela e um canal onde a quebra chega antes do consumidor perceber. Também mantenho lineage para saber quem quebra quando eu mudo uma coluna.',
      start: 67.3,
      end: 84.6,
    },
    {
      speaker: 'SPEAKER_00',
      text: 'Você mentora pessoas?',
      start: 85.0,
      end: 86.8,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'Sim, acompanho dois analistas hoje. O que funciona melhor comigo é revisar o desenho antes do código, porque corrigir modelagem depois de tudo pronto é caro e desanima. Também traduzo a decisão técnica para o time de negócio em uma página.',
      start: 87.2,
      end: 104.3,
    },
  ],
  quotes: [
    'defino contrato de dados na fronteira',
    'escrevo DAGs idempotentes com backfill parametrizado por data',
    'apliquei salting na chave e reparticionei antes do join',
    'monitoramento de freshness com SLA por tabela',
    'revisar o desenho antes do código',
  ],
  hallucinated: [
    'eu fui o arquiteto do data mesh global da companhia',
    'mantenho um fork próprio do Airflow em produção',
    'reescrevi o otimizador de consultas do Spark em Scala',
    'implantei governança certificada em ISO para todo o grupo',
    'formei mais de duzentos engenheiros de dados no último ano',
  ],
};

const FRONTEND_JUNIOR: DemoDialogue = {
  jobId: 'frontend_junior',
  turns: [
    {
      speaker: 'SPEAKER_00',
      text: 'Me explica, do seu jeito, a diferença entre síncrono e assíncrono em JavaScript.',
      start: 0,
      end: 5.8,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'Síncrono é quando a linha seguinte espera a anterior terminar. Assíncrono é quando a função devolve uma promise e o resto continua rodando, e o resultado chega depois pelo await ou pelo then. Eu ainda confundo a ordem de execução quando tem muito encadeado, para ser sincera.',
      start: 6.2,
      end: 24.0,
    },
    {
      speaker: 'SPEAKER_00',
      text: 'E em React, como você pensa estado?',
      start: 24.4,
      end: 26.9,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'Eu uso useState para o que é da tela e useEffect quando preciso reagir a algo de fora, tipo buscar dados. Já construí sozinha uma tela de listagem com filtro e paginação, e aprendi na marra que colocar tudo num estado só complica.',
      start: 27.3,
      end: 44.7,
    },
    {
      speaker: 'SPEAKER_00',
      text: 'Você escreve testes?',
      start: 45.1,
      end: 46.6,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'Escrevi alguns com Testing Library no projeto do bootcamp, principalmente testando o que o usuário vê na tela em vez do estado interno. Ainda não tenho o hábito de escrever teste antes, mas quero pegar isso.',
      start: 47.0,
      end: 62.4,
    },
    {
      speaker: 'SPEAKER_00',
      text: 'Como você lida com feedback em code review?',
      start: 62.8,
      end: 65.5,
    },
    {
      speaker: 'SPEAKER_01',
      text: 'Eu gosto, sinceramente. Já levei review pesado no começo e o que me ajudou foi perguntar o porquê em vez de só aplicar a sugestão. Hoje eu tenho um caderno de coisas que erro repetido e revejo antes de abrir PR.',
      start: 66.0,
      end: 82.9,
    },
  ],
  quotes: [
    'a função devolve uma promise e o resto continua rodando',
    'Já construí sozinha uma tela de listagem com filtro e paginação',
    'testando o que o usuário vê na tela em vez do estado interno',
    'perguntar o porquê em vez de só aplicar a sugestão',
  ],
  hallucinated: [
    'eu mantenho uma biblioteca de componentes usada por mil desenvolvedores',
    'migrei a aplicação inteira de Angular para React sozinha',
    'tenho cem por cento de cobertura de testes em todos os meus projetos',
    'sou mantenedora oficial do React no Brasil',
  ],
};

export const DEMO_DIALOGUES: Record<string, DemoDialogue> = {
  python_pleno: PYTHON_PLENO,
  dados_senior: DADOS_SENIOR,
  frontend_junior: FRONTEND_JUNIOR,
};

/** Flattens a dialogue the way `EvidenceValidator.consolidate_transcript` does. */
export function consolidate(turns: DemoTurn[]): string {
  return turns.map((turn) => turn.text).join(' ');
}
