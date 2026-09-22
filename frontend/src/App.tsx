import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';

import { AppShell } from './components/shell/AppShell';
import { DemoToolbar } from './components/shell/DemoToolbar';
import { LiveStatus } from './components/shell/LiveStatus';
import { AnnouncerProvider } from './components/ui/Announcer';
import { SkeletonCards } from './components/ui/Skeleton';
import { createApiSource } from './data/apiSource';
import { InterviewsProvider, useInterviews } from './data/InterviewsProvider';
import { useDemoControls } from './data/demoControls';
import { DataSourceProvider } from './data/source';
import { useConfig } from './hooks/useConfig';
import { useHashRoute } from './hooks/useHashRoute';
import { usePreferences } from './hooks/usePreferences';
import { ApprovalsView } from './features/approvals/ApprovalsView';
import { DashboardView } from './features/dashboard/DashboardView';
import { HealthView } from './features/health/HealthView';
import { IngestionView } from './features/ingestion/IngestionView';
import { IntegrationsView } from './features/integrations/IntegrationsView';
import { InterviewDetailView } from './features/interviews/InterviewDetailView';
import { InterviewListView } from './features/interviews/InterviewListView';
import { SettingsView } from './features/settings/SettingsView';

// Code-split: API-mode users never download the demo dataset, dialogues or
// BARS reference. This is also the ONLY place in the app allowed to reach into
// `demo/` — enforced by data/isolation.test.ts.
const DemoProvider = lazy(() =>
  import('./demo/DemoProvider').then((module) => ({ default: module.DemoProvider })),
);
const FunnelView = lazy(() =>
  import('./features/funnel/FunnelView').then((module) => ({ default: module.FunnelView })),
);

export function App() {
  const { config, updateConfig, epoch } = useConfig();
  const { preferences, setPreferences } = usePreferences();
  const route = useHashRoute();

  // Remember the last explicit mode, so a bare `#/` reopens where the user
  // left off. The URL still wins whenever it carries a mode.
  useEffect(() => {
    if (preferences.lastMode !== route.mode) setPreferences({ lastMode: route.mode });
  }, [route.mode, preferences.lastMode, setPreferences]);

  // Stable for the lifetime of the page: re-anchoring on every render would
  // make demo timestamps crawl forward and break reproducibility.
  const loadAnchor = useRef(Date.now());
  const anchor = route.clockAnchor ?? loadAnchor.current;

  const apiSource = useMemo(() => createApiSource(config, epoch), [config, epoch]);

  const shell = (
    <Shell
      config={config}
      onConfigChange={updateConfig}
      preferencesTheme={preferences.theme}
      onThemeChange={(theme) => setPreferences({ theme })}
      pollIntervalMs={preferences.pollIntervalMs}
    />
  );

  return (
    <AnnouncerProvider>
      {route.mode === 'demo' ? (
        <Suspense fallback={<BootFallback />}>
          <DemoProvider anchor={anchor}>{shell}</DemoProvider>
        </Suspense>
      ) : (
        <DataSourceProvider value={apiSource}>{shell}</DataSourceProvider>
      )}
    </AnnouncerProvider>
  );
}

interface ShellProps {
  config: { baseUrl: string; apiKey: string };
  onConfigChange: (next: { baseUrl: string; apiKey: string }) => void;
  preferencesTheme: 'light' | 'dark' | 'system';
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void;
  pollIntervalMs: number;
}

function Shell({
  config,
  onConfigChange,
  preferencesTheme,
  onThemeChange,
  pollIntervalMs,
}: ShellProps) {
  return (
    <InterviewsProvider activeIntervalMs={pollIntervalMs}>
      <Chrome
        config={config}
        onConfigChange={onConfigChange}
        preferencesTheme={preferencesTheme}
        onThemeChange={onThemeChange}
      />
    </InterviewsProvider>
  );
}

function Chrome({
  config,
  onConfigChange,
  preferencesTheme,
  onThemeChange,
}: Omit<ShellProps, 'pollIntervalMs'>) {
  const route = useHashRoute();
  const { summaries } = useInterviews();
  const demo = useDemoControls();

  const pendingCount =
    summaries === null
      ? null
      : summaries.filter((summary) => summary.status === 'aguardando_aprovacao').length;


  return (
    <AppShell
      route={route}
      theme={preferencesTheme}
      onThemeChange={onThemeChange}
      onResetDemo={() => demo?.reset()}
      pendingCount={pendingCount}
      statusSlot={
        route.mode === 'demo' ? <DemoToolbar /> : <LiveStatus route={route} />
      }
    >
      {route.name === 'dashboard' && <DashboardView route={route} />}
      {route.name === 'interviews' && <InterviewListView route={route} />}
      {route.name === 'interview' && route.id !== undefined && (
        <InterviewDetailView id={route.id} />
      )}
      {route.name === 'new' && <IngestionView route={route} />}
      {route.name === 'approvals' && <ApprovalsView route={route} />}
      {route.name === 'integrations' && (
        <IntegrationsView route={route} apiBaseUrl={config.baseUrl} />
      )}
      {route.name === 'health' && <HealthView />}
      {route.name === 'settings' && (
        <SettingsView config={config} onConfigChange={onConfigChange} />
      )}
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
      <SkeletonCards cards={4} label="Carregando modo demonstração…" />
    </div>
  );
}
