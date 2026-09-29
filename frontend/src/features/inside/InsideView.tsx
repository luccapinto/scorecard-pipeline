// "Por trás do produto": the engineering, for the technical reader.
//
// Every claim on this page names the file it lives in, so a reviewer can go
// from a sentence to the code in one click instead of taking it on faith —
// the same standard the product applies to the model's citations.

import { ADRS_URL, AUTHOR_NAME, AUTHOR_URL, README_URL, REPO_URL, codeUrl } from '../../app/links';
import type { Route, RouteName } from '../../app/routes';
import { DEMO_ONLY } from '../../app/routes';
import { Icon } from '../../components/ui/Icon';
import { PageHeader } from '../../components/ui/PageHeader';
import { hrefFor } from '../../hooks/useHashRoute';
import { InsideNav } from './InsideNav';

interface Hop {
  title: string;
  what: string;
  how: string;
  file: string;
}

const HOPS: Hop[] = [
  {
    title: 'Ingestão',
    what: 'O sistema de gravação chama um webhook.',
    how: 'FastAPI valida a assinatura HMAC-SHA256, deduplica por external_id e responde 202: aceite, não conclusão.',
    file: 'app/main.py',
  },
  {
    title: 'Fila',
    what: 'O trabalho vai para uma fila, não para a requisição.',
    how: 'Redis + RQ, com timeout por job e até 3 novas tentativas espaçadas em 1, 5 e 15 minutos.',
    file: 'app/queue.py',
  },
  {
    title: 'Worker e máquina de estados',
    what: 'Um worker avança a entrevista etapa por etapa.',
    how: 'Transições validadas, trava de linha contra processamento duplicado e retomada a partir do último artefato salvo.',
    file: 'app/tasks.py',
  },
  {
    title: 'Transcrição e diarização',
    what: 'O áudio vira texto, separado por quem falou.',
    how: 'Deepgram nova-3 numa chamada só, ou WhisperX + pyannote rodando localmente, sem enviar áudio a terceiros.',
    file: 'app/audio_processor.py',
  },
  {
    title: 'Pontuação',
    what: 'Um LLM avalia cada competência da vaga.',
    how: 'Rubrica BARS da vaga no prompt, resposta em JSON validada contra um schema Pydantic, até 3 tentativas.',
    file: 'app/scoring.py',
  },
  {
    title: 'Verificação de evidência',
    what: 'Cada citação do modelo é procurada na transcrição.',
    how: 'Texto normalizado (clean_text) e similaridade rapidfuzz acima do limiar; o que não é achado sai marcado.',
    file: 'app/scoring.py',
  },
  {
    title: 'Notificação e decisão',
    what: 'O time recebe o scorecard; uma pessoa decide.',
    how: 'Slack em Block Kit e webhook genérico; os botões levam um token de uso único, apagado na primeira decisão.',
    file: 'app/notifications.py',
  },
];

const ADRS: { id: string; title: string; file: string }[] = [
  { id: '0001', title: 'Processamento por fila em vez de polling periódico', file: '0001-fila-vs-polling.md' },
  { id: '0002', title: 'Lookup determinístico de contexto em vez de RAG', file: '0002-lookup-deterministico-vs-rag.md' },
  { id: '0003', title: 'RQ em vez de Celery', file: '0003-rq-vs-celery.md' },
  { id: '0004', title: 'Viés em avaliação de cultura: BARS e humano no circuito', file: '0004-avaliacao-cultura-fit-bias.md' },
  { id: '0005', title: 'Dois modos na interface, nunca misturados', file: '0005-dois-modos-api-e-demonstracao.md' },
  { id: '0006', title: 'Demo pública sem modo API', file: '0006-build-showcase-sem-modo-api.md' },
];

const SCREENS: { name: RouteName; title: string; what: string }[] = [
  { name: 'new', title: 'Ingestão', what: 'O pedido exato que entra pelo webhook, e o 202 explicado.' },
  { name: 'integrations', title: 'Slack e integrações', what: 'A mensagem Block Kit fiel ao backend e o link de decisão.' },
  { name: 'health', title: 'Saúde', what: 'O que é observado, e como cada falha é classificada.' },
  { name: 'funnel', title: 'Funil', what: 'Como esta camada se encaixaria num processo seletivo.' },
];

export function InsideView({ route }: { route: Route }) {
  const screens = SCREENS.filter((screen) => !(route.mode === 'api' && DEMO_ONLY[screen.name]));

  return (
    <div className="page inside">
      <InsideNav route={route} />
      <PageHeader
        eyebrow="Por dentro"
        title="Por trás do produto"
        lede="Como uma gravação vira um scorecard em que dá para confiar — cada etapa, a decisão por trás dela e o arquivo onde ela está."
      />

      <section className="arch" aria-labelledby="arch-title" data-tour="architecture">
        <h2 id="arch-title" className="sr-only">
          Arquitetura, do webhook à decisão
        </h2>
        <ol className="arch__hops">
          {HOPS.map((hop, index) => (
            <li key={hop.title} className="hop">
              <span className="hop__num" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="hop__title">{hop.title}</h3>
              <p className="hop__what">{hop.what}</p>
              <p className="hop__how">{hop.how}</p>
              <a className="hop__file" href={codeUrl(hop.file)} target="_blank" rel="noreferrer noopener">
                {hop.file}
                <span className="sr-only"> (código no GitHub, abre em nova aba)</span>
              </a>
            </li>
          ))}
        </ol>

        <div className="states" aria-labelledby="states-title">
          <h3 id="states-title" className="states__title">
            A máquina de estados
          </h3>
          <p className="states__line">
            <code>recebida</code> <span aria-hidden="true">→</span> <code>transcrevendo</code>{' '}
            <span aria-hidden="true">→</span> <code>diarizando</code>{' '}
            <span aria-hidden="true">→</span> <code>pontuando</code>{' '}
            <span aria-hidden="true">→</span> <code className="states__stop">aguardando_aprovacao</code>{' '}
            <span aria-hidden="true">→</span> <code>aprovada</code> | <code>rejeitada</code>
          </p>
          <p className="states__note">
            Qualquer etapa pode ir para <code>falhou</code>; reprocessar retoma da primeira etapa
            cujo artefato não foi salvo. <strong>Nenhuma transição sai de aguardando_aprovacao
            sem uma pessoa.</strong>{' '}
            <a href={codeUrl('app/models.py')} target="_blank" rel="noreferrer noopener">
              app/models.py
            </a>
          </p>
        </div>
      </section>

      <div className="inside__cols">
        <section className="section" aria-labelledby="adr-title">
          <h2 id="adr-title">As decisões, por escrito</h2>
          <p className="section__lede">
            Cada escolha que não era óbvia tem um ADR: o contexto, as alternativas rejeitadas e o
            custo aceito.
          </p>
          <ol className="adr-list">
            {ADRS.map((adr) => (
              <li key={adr.id}>
                <a href={`${ADRS_URL}/${adr.file}`} target="_blank" rel="noreferrer noopener">
                  <span className="adr-list__id">ADR {adr.id}</span>
                  <span className="adr-list__title">{adr.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section className="section" aria-labelledby="quality-title">
          <h2 id="quality-title">Como a qualidade é cobrada</h2>
          <p className="section__lede">Tudo abaixo roda no CI a cada pull request.</p>
          <ul className="checks">
            <li>
              <strong>Backend:</strong> pytest com Postgres e Redis reais e cobertura mínima de 78%,
              ruff, mypy e migrações Alembic testadas nos dois sentidos.
            </li>
            <li>
              <strong>Frontend:</strong> TypeScript estrito, Vitest + Testing Library, auditoria
              axe-core (WCAG 2.1 AA) em todas as telas e nos dois temas, contraste dos tokens e
              orçamento de bundle.
            </li>
            <li>
              <strong>Honestidade da demo:</strong> um teste percorre a aplicação com toda primitiva
              de rede trocada por um espião que falha — e a citação sinalizada é sinalizada porque a
              busca realmente não a encontra.
            </li>
            <li>
              <strong>Segurança:</strong> gitleaks no histórico, pip-audit nas dependências e
              CodeQL.
            </li>
          </ul>
        </section>
      </div>

      <section className="section" aria-labelledby="screens-title">
        <h2 id="screens-title">As telas técnicas</h2>
        <ul className="screen-links">
          {screens.map((screen) => (
            <li key={screen.name}>
              <a href={hrefFor({ mode: route.mode, name: screen.name, clockAnchor: route.clockAnchor })}>
                <span className="screen-links__title">
                  {screen.title}
                  <Icon name="arrowRight" />
                </span>
                <span className="screen-links__what">{screen.what}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="outro" aria-labelledby="outro-title">
        <h2 id="outro-title">Leia o código</h2>
        <p>
          Projeto de{' '}
          <a href={AUTHOR_URL} target="_blank" rel="noreferrer noopener">
            {AUTHOR_NAME}
          </a>
          , com licença MIT.
        </p>
        <div className="outro__links">
          <a className="btn btn--primary" href={REPO_URL} target="_blank" rel="noreferrer noopener">
            <Icon name="github" />
            Repositório no GitHub
          </a>
          <a className="btn btn--ghost" href={README_URL} target="_blank" rel="noreferrer noopener">
            <Icon name="book" />
            README
          </a>
          <a className="btn btn--ghost" href={ADRS_URL} target="_blank" rel="noreferrer noopener">
            <Icon name="layers" />
            ADRs
          </a>
        </div>
      </section>
    </div>
  );
}
