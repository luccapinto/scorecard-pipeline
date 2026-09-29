// The front door of the public demo.
//
// Ten seconds to understand the project, one obvious way in (the tour), one
// for people who would rather poke around. The example in the hero is not an
// illustration: it is read from the demo dataset and the "closest passage"
// is computed by the same search the scorecard uses, so the landing page
// makes the product's argument with the product's own output.

import { useEffect, useState } from 'react';

import type { Interview } from '../../api/types';
import { ADRS_URL, AUTHOR_NAME, AUTHOR_URL, README_URL, REPO_URL } from '../../app/links';
import type { Route } from '../../app/routes';
import { BrandMark, BrandWordmark } from '../../components/shell/Brand';
import { ShellMenu } from '../../components/shell/ShellMenu';
import type { IconName } from '../../components/ui/Icon';
import { Icon } from '../../components/ui/Icon';
import type { ThemePreference } from '../../config/preferences';
import { useDemoControls } from '../../data/demoControls';
import { useInterviews } from '../../data/InterviewsProvider';
import { useDataSource } from '../../data/source';
import { hrefFor } from '../../hooks/useHashRoute';
import { closestPassage } from '../../lib/evidence';
import { buildTurns } from '../../lib/transcript';
import { useTour } from '../tour/TourProvider';

interface Props {
  route: Route;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

/** The seeded interview whose scorecard carries two invented citations. */
const EXAMPLE_ID = 'demo-bruno-exemplo';

const STATIONS: { icon: IconName; title: string; what: string }[] = [
  { icon: 'mic', title: 'Gravação', what: 'Chega por um webhook assinado.' },
  { icon: 'fileText', title: 'Transcrição', what: 'Deepgram ou WhisperX, local.' },
  { icon: 'users', title: 'Diarização', what: 'Quem disse o quê.' },
  { icon: 'sparkles', title: 'Pontuação com IA', what: 'Um LLM aplica a rubrica da vaga.' },
  { icon: 'search', title: 'Verificação', what: 'Cada citação é procurada no texto.' },
  { icon: 'userCheck', title: 'Decisão humana', what: 'Uma pessoa aprova ou rejeita.' },
];

const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: 'Toda nota tem âncora',
    body: 'A nota de 1 a 5 de cada competência vem com o texto da rubrica BARS da vaga, que descreve o comportamento por trás daquele número.',
  },
  {
    title: 'Toda citação é conferida',
    body: 'Antes de chegar a alguém, cada frase que o modelo usou como evidência é procurada na transcrição. A que não está lá vira alarme — com o trecho mais parecido ao lado.',
  },
  {
    title: 'Toda decisão é humana',
    body: 'A esteira para em "aguardando aprovação". Decidir exige duas etapas, uma candidatura por vez. Não existe aprovação em massa.',
  },
];

const ENGINEERING: { term: string; detail: string }[] = [
  { term: 'API', detail: 'FastAPI; webhook com assinatura HMAC e idempotência' },
  { term: 'Fila', detail: 'Redis + RQ, com novas tentativas espaçadas' },
  { term: 'Worker', detail: 'máquina de estados que retoma do último checkpoint' },
  { term: 'Fala', detail: 'Deepgram nova-3, ou WhisperX + pyannote sem sair da máquina' },
  { term: 'Pontuação', detail: 'LLM via OpenRouter, saída validada por schema' },
  { term: 'Evidência', detail: 'texto normalizado + similaridade (rapidfuzz)' },
  { term: 'Aviso', detail: 'Slack em Block Kit e webhook, com token de uso único' },
  { term: 'Qualidade', detail: 'pytest, mypy, ruff, Vitest, axe-core e CI em todo PR' },
];

interface Specimen {
  candidate: string;
  competency: string;
  score: number;
  quote: string;
  nearest: string | null;
  similarity: number | null;
}

function specimenFrom(interview: Interview): Specimen | null {
  const evaluation = interview.scorecard?.evaluations.find(
    (item) => item.evidence_verified === false,
  );
  if (interview.scorecard == null || evaluation === undefined) return null;
  const transcript = buildTurns(interview.transcription_raw, interview.diarization_raw)
    .map((turn) => turn.text)
    .join(' ');
  const passage = transcript ? closestPassage(evaluation.evidence_quote, transcript) : null;
  return {
    candidate: interview.scorecard.candidate_name,
    competency: evaluation.competency_name,
    score: evaluation.score,
    quote: evaluation.evidence_quote,
    nearest: passage === null ? null : transcript.slice(passage.match.start, passage.match.end),
    similarity: passage?.similarity ?? null,
  };
}

export function LandingView({ route, theme, onThemeChange }: Props) {
  const source = useDataSource();
  const tour = useTour();
  const demo = useDemoControls();
  const { jobTitles } = useInterviews();
  const [example, setExample] = useState<{ specimen: Specimen; jobId: string | null } | null>(
    null,
  );
  // Bumped by "Ver de novo" to restart the pipeline animation.
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    let live = true;
    source
      .getInterview(EXAMPLE_ID)
      .then((interview) => {
        const specimen = specimenFrom(interview);
        if (live && specimen !== null) setExample({ specimen, jobId: interview.job_id });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [source]);

  const at = (name: Route['name'], id?: string): string =>
    hrefFor({ mode: 'demo', name, id, clockAnchor: route.clockAnchor });

  const tourCta = (
    <button type="button" className="btn btn--primary btn--xl" onClick={() => tour?.start(0)}>
      <Icon name="play" />
      Fazer o tour guiado
      <span className="btn__meta">2 min</span>
    </button>
  );

  return (
    <div className="landing">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>

      <header className="landing-top">
        <div className="landing-top__inner">
          <a className="brand" href={at('home')}>
            <BrandMark />
            <BrandWordmark />
          </a>
          <nav className="landing-top__nav" aria-label="Atalhos">
            <a href={at('dashboard')}>Abrir a demo</a>
            <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
              <Icon name="github" />
              GitHub
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          </nav>
          <ShellMenu theme={theme} onThemeChange={onThemeChange} onReset={demo?.reset} />
        </div>
      </header>

      <main id="conteudo" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__text">
            <p className="hero__eyebrow">
              Projeto de portfólio de{' '}
              <a href={AUTHOR_URL} target="_blank" rel="noreferrer noopener">
                {AUTHOR_NAME}
              </a>
            </p>
            <h1 id="hero-title" className="hero__title">
              A IA avalia a entrevista. <mark className="hero__mark">O sistema confere cada citação.</mark>{' '}
              Uma pessoa decide.
            </h1>
            <p className="hero__lede">
              Scorecard Pipeline transforma a gravação de uma entrevista técnica num scorecard
              estruturado — e não deixa uma frase inventada pelo modelo chegar a quem decide.
            </p>
            <div className="hero__ctas">
              {tourCta}
              <a className="btn btn--ghost btn--xl" href={at('dashboard')}>
                Explorar por conta própria
                <Icon name="arrowRight" />
              </a>
            </div>
            {tour?.resumable != null && (
              <p className="hero__resume">
                <button type="button" className="link-button" onClick={() => tour.start(tour.resumable!)}>
                  Retomar o tour de onde parou (passo {tour.resumable + 1} de {tour.total})
                </button>
              </p>
            )}
            <p className="hero__note">
              <span className="demo-marker__dot" aria-hidden="true" />
              Dados fictícios, tudo no seu navegador: nenhuma requisição sai desta página.
            </p>
          </div>

          <figure className="specimen" aria-labelledby="specimen-caption">
            {example === null ? (
              <div className="specimen__loading" aria-hidden="true" />
            ) : (
              <>
                <div className="specimen__head">
                  <p className="specimen__who">
                    <strong>{example.specimen.candidate}</strong>
                    <span>
                      {example.jobId === null ? '' : (jobTitles[example.jobId] ?? example.jobId)}
                    </span>
                  </p>
                  <p className="specimen__score" aria-label={`Nota ${example.specimen.score} de 5`}>
                    {example.specimen.score}
                    <span>/5</span>
                  </p>
                </div>
                <p className="specimen__competency">{example.specimen.competency}</p>
                <p className="specimen__label">O modelo justificou a nota citando:</p>
                <blockquote className="specimen__quote">
                  <p>{example.specimen.quote}</p>
                </blockquote>
                <p className="specimen__stamp">
                  <Icon name="alert" />
                  Não está na transcrição
                </p>
                {example.specimen.nearest !== null && (
                  <p className="specimen__nearest">
                    <span>
                      O trecho mais parecido que a busca achou ({example.specimen.similarity}%):
                    </span>
                    <q>{example.specimen.nearest}</q>
                  </p>
                )}
                <a className="specimen__link" href={at('interview', EXAMPLE_ID)}>
                  Ver este scorecard na demo
                  <Icon name="arrowRight" />
                </a>
              </>
            )}
            <figcaption id="specimen-caption" className="sr-only">
              Exemplo real da demonstração: uma citação usada pelo modelo que não existe na
              transcrição, e o alarme do sistema.
            </figcaption>
          </figure>
        </section>

        <section className="flow" aria-labelledby="flow-title">
          <div className="flow__head">
            <h2 id="flow-title">Da gravação à decisão, em seis passos</h2>
            <button
              type="button"
              className="link-button"
              onClick={() => setReplay((value) => value + 1)}
            >
              <Icon name="rotate" />
              Ver de novo
            </button>
          </div>
          <ol className="flow__steps" key={replay}>
            {STATIONS.map((station, index) => (
              <li
                key={station.title}
                className={`station ${index === 4 ? 'station--check' : ''} ${
                  index === 5 ? 'station--human' : ''
                }`}
                style={{ '--i': index } as React.CSSProperties}
              >
                <span className="station__num" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="station__icon" aria-hidden="true">
                  <Icon name={station.icon} size="1.35rem" />
                </span>
                <span className="station__title">{station.title}</span>
                <span className="station__what">{station.what}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="problem" aria-labelledby="problem-title">
          <div className="problem__intro">
            <p className="kicker">O problema</p>
            <h2 id="problem-title">
              Um modelo de linguagem escreve justificativas convincentes — inclusive com citações
              que ninguém disse.
            </h2>
            <p>
              Numa decisão de contratação, isso é uma evidência falsa sobre uma pessoa, apresentada
              com a mesma confiança de uma verdadeira. O risco não é o modelo errar: é o erro parecer
              certo para quem decide com pressa.
            </p>
          </div>
          <ol className="principles">
            {PRINCIPLES.map((principle, index) => (
              <li key={principle.title} className="principle">
                <span className="principle__num" aria-hidden="true">
                  {index + 1}
                </span>
                <h3 className="principle__title">{principle.title}</h3>
                <p className="principle__body">{principle.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="engineering" aria-labelledby="eng-title">
          <div className="engineering__intro">
            <p className="kicker">A engenharia</p>
            <h2 id="eng-title">Um sistema de verdade por baixo da demonstração</h2>
            <p>
              A demo roda no navegador, mas encena um backend real que está no repositório: com
              fila, worker, máquina de estados, testes e CI.
            </p>
            <a className="btn btn--ghost" href={at('inside')}>
              Ver a arquitetura completa
              <Icon name="arrowRight" />
            </a>
          </div>
          <dl className="stack">
            {ENGINEERING.map((item) => (
              <div key={item.term} className="stack__row">
                <dt>{item.term}</dt>
                <dd>{item.detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <h2 id="closing-title">Veja acontecer.</h2>
          <p>
            Uma entrevista chega, atravessa a esteira, o sistema pega a citação inventada e a
            decisão fica com você.
          </p>
          <div className="closing__ctas">
            {tourCta}
            <a className="btn btn--ghost btn--xl" href={at('dashboard')}>
              Explorar por conta própria
            </a>
          </div>
          <ul className="closing__links">
            <li>
              <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
                <Icon name="github" />
                Código no GitHub
              </a>
            </li>
            <li>
              <a href={README_URL} target="_blank" rel="noreferrer noopener">
                <Icon name="book" />
                README
              </a>
            </li>
            <li>
              <a href={ADRS_URL} target="_blank" rel="noreferrer noopener">
                <Icon name="layers" />
                Decisões de arquitetura
              </a>
            </li>
          </ul>
        </section>
      </main>

      <footer className="landing-foot">
        <p>
          Feito por{' '}
          <a href={AUTHOR_URL} target="_blank" rel="noreferrer noopener">
            {AUTHOR_NAME}
          </a>
          . Código aberto, licença MIT. Pessoas, vagas e decisões desta demonstração são fictícias.
        </p>
      </footer>
    </div>
  );
}
