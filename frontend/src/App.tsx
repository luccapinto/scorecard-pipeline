import { lazy, Suspense, useMemo, useRef } from 'react';

import { SHOWCASE } from './app/edition';
import type { Route } from './app/routes';
import { hrefFor } from './hooks/useHashRoute';
import { AppShell } from './components/shell/AppShell';
import { DemoMarker } from './components/shell/DemoMarker';
import { LiveStatus } from './components/shell/LiveStatus';
import { ModeSwitch } from './components/shell/ModeSwitch';
import { ShellMenu } from './components/shell/ShellMenu';
import { AnnouncerProvider } from './components/ui/Announcer';
import { SkeletonCards } from './components/ui/Skeleton';
import type { ThemePreference } from './config/preferences';
import { createApiSource } from './data/apiSource';
import { useDemoControls } from './data/demoControls';
import { InterviewsProvider, useInterviews } from './data/InterviewsProvider';
import { DataSourceProvider } from './data/source';
import { useConfig } from './hooks/useConfig';
import { useHashRoute } from './hooks/useHashRoute';
import { usePreferences } from './hooks/usePreferences';
import { ApprovalsView } from './features/approvals/ApprovalsView';
import { DashboardView } from './features/dashboard/DashboardView';
import { HealthView } from './features/health/HealthView';
import { LandingView } from './features/home/LandingView';
import { IngestionView } from './features/ingestion/IngestionView';
import { InsideView } from './features/inside/InsideView';
import { IntegrationsView } from './features/integrations/IntegrationsView';
import { InterviewDetailView } from './features/interviews/InterviewDetailView';
import { InterviewListView } from './features/interviews/InterviewListView';
import { SettingsView } from './features/settings/SettingsView';
import { tourRequirement } from './features/tour/steps';
import { TourLauncher } from './features/tour/TourLauncher';
import { TourProvider } from './features/tour/TourProvider';

// Code-split: API-mode users never download the demo dataset, dialogues or
// BARS reference. This is also the ONLY place in the app allowed to reach into
// `demo/` — enforced by data/isolation.test.ts.
const DemoProvider = lazy(() =>
  import('./demo/DemoProvider').then((module) => ({ default: module.DemoProvider })),
);
const FunnelView = lazy(() =>
  import('./features/funnel/FunnelView').then((module) => ({ default: module.FunnelView })),
);

/**
 * Base URL the demo's Slack preview writes into its decision links. There is
 * no backend in the showcase, so this is the backend's documented dev
 * default rather than anything a visitor's browser would call.
 */
const DEMO_API_BASE = 'http://localhost:8000';

// Two editions of one application (docs/adr/0006). `SHOWCASE` is a build-time
// literal, so the edition that is not built is deleted by the bundler — the
// public demo does not merely hide API mode, it does not contain it.
export function App() {
  return SHOWCASE ? <ShowcaseApp /> : <FullApp />;
}

/** The public demo: demonstration mode only, landing page first. */
function ShowcaseApp() {
  const { preferences, setPreferences } = usePreferences();
  const route = useHashRoute();
  // Stable for the lifetime of the page: re-anchoring on every render would
  // make demo timestamps crawl forward and break reproducibility.
  const loadAnchor = useRef(Date.now());

  return (
    <AnnouncerProvider>
      <Suspense fallback={<BootFallback />}>
        <DemoProvider
          anchor={route.clockAnchor ?? loadAnchor.current}
          prepare={tourRequirement(route)}
        >
          <Screens
            route={route}
            theme={preferences.theme}
            onThemeChange={(theme) => setPreferences({ theme })}
            pollIntervalMs={preferences.pollIntervalMs}
            apiBaseUrl={DEMO_API_BASE}
          />
        </DemoProvider>
      </Suspense>
    </AnnouncerProvider>
  );
}

/** docker compose / dev: the real API, plus the demonstration on `#/demo`. */
function FullApp() {
  const { config, updateConfig, epoch } = useConfig();
  const { preferences, setPreferences } = usePreferences();
  const route = useHashRoute();
  const loadAnchor = useRef(Date.now());

  const apiSource = useMemo(() => createApiSource(config, epoch), [config, epoch]);

  const screens = (
    <Screens
      route={route}
      theme={preferences.theme}
      onThemeChange={(theme) => setPreferences({ theme })}
      pollIntervalMs={preferences.pollIntervalMs}
      apiBaseUrl={route.mode === 'demo' ? DEMO_API_BASE : config.baseUrl}
      api={{
        modeSwitch: <ModeSwitch route={route} />,
        liveStatus: route.mode === 'api' ? <LiveStatus route={route} /> : null,
        settings: <SettingsView route={route} config={config} onConfigChange={updateConfig} />,
        settingsLink: (
          <a
            className="btn btn--ghost btn--sm btn--block"
            href={hrefFor({ mode: route.mode, name: 'settings', clockAnchor: route.clockAnchor })}
          >
            Configurar a API
          </a>
        ),
      }}
    />
  );

  return (
    <AnnouncerProvider>
      {route.mode === 'demo' ? (
        <Suspense fallback={<BootFallback />}>
          <DemoProvider
            anchor={route.clockAnchor ?? loadAnchor.current}
            prepare={tourRequirement(route)}
          >
            {screens}
          </DemoProvider>
        </Suspense>
      ) : (
        <DataSourceProvider value={apiSource}>{screens}</DataSourceProvider>
      )}
    </AnnouncerProvider>
  );
}

/** What only the full build contributes to the chrome. */
interface ApiChrome {
  modeSwitch: React.ReactNode;
  liveStatus: React.ReactNode;
  settings: React.ReactNode;
  settingsLink: React.ReactNode;
}

interface ScreensProps {
  route: Route;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  pollIntervalMs: number;
  apiBaseUrl: string;
  api?: ApiChrome;
}

function Screens({ pollIntervalMs, ...props }: ScreensProps) {
  return (
    <InterviewsProvider activeIntervalMs={pollIntervalMs}>
      {props.route.mode === 'demo' ? (
        <TourProvider route={props.route}>
          <Chrome {...props} />
        </TourProvider>
      ) : (
        <Chrome {...props} />
      )}
    </InterviewsProvider>
  );
}

function Chrome({ route, theme, onThemeChange, apiBaseUrl, api }: Omit<ScreensProps, 'pollIntervalMs'>) {
  const { summaries } = useInterviews();
  const demo = useDemoControls();

  if (route.name === 'home') {
    return <LandingView route={route} theme={theme} onThemeChange={onThemeChange} />;
  }

  const pendingCount =
    summaries === null
      ? null
      : summaries.filter((summary) => summary.status === 'aguardando_aprovacao').length;

  return (
    <AppShell
      route={route}
      pendingCount={pendingCount}
      actions={
        <>
          {route.mode === 'demo' && <TourLauncher />}
          {route.mode === 'demo' && <DemoMarker />}
          {api?.liveStatus}
          {api?.modeSwitch}
          <ShellMenu
            theme={theme}
            onThemeChange={onThemeChange}
            onReset={demo === null ? undefined : demo.reset}
          >
            {api?.settingsLink}
          </ShellMenu>
        </>
      }
    >
      {route.name === 'dashboard' && <DashboardView route={route} />}
      {route.name === 'interviews' && <InterviewListView route={route} />}
      {route.name === 'interview' && route.id !== undefined && (
        <InterviewDetailView route={route} id={route.id} />
      )}
      {route.name === 'approvals' && <ApprovalsView route={route} />}
      {route.name === 'inside' && <InsideView route={route} />}
      {route.name === 'new' && <IngestionView route={route} />}
      {route.name === 'integrations' && <IntegrationsView route={route} apiBaseUrl={apiBaseUrl} />}
      {route.name === 'health' && <HealthView route={route} />}
      {route.name === 'settings' && api?.settings}
      {route.name === 'funnel' && (
        <Suspense fallback={<SkeletonCards cards={3} label="Carregando funil…" />}>
          <FunnelView route={route} />
        </Suspense>
      )}
    </AppShell>
  );
}

function BootFallback() {
  return (
    <div className="boot">
      <SkeletonCards cards={4} label="Carregando demonstração…" />
    </div>
  );
}
