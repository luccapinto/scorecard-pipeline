import { useState } from 'react';

import { ConfigPanel } from './components/ConfigPanel';
import { Header } from './components/Header';
import { useConfig } from './hooks/useConfig';
import { navigate, useHashRoute } from './hooks/useHashRoute';
import { InterviewDetailView } from './features/interviews/InterviewDetailView';
import { InterviewListView } from './features/interviews/InterviewListView';
import { NewInterviewView } from './features/interviews/NewInterviewView';

export function App() {
  const { config, updateConfig } = useConfig();
  const route = useHashRoute();
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div className="app">
      <Header
        config={config}
        configOpen={configOpen}
        onOpenList={() => navigate({ name: 'list' })}
        onOpenNew={() => navigate({ name: 'new' })}
        onToggleConfig={() => setConfigOpen((open) => !open)}
      />

      {configOpen && (
        <ConfigPanel
          config={config}
          onSave={(next) => updateConfig(next)}
          onClose={() => setConfigOpen(false)}
        />
      )}

      <main className="app__main">
        {route.name === 'list' && (
          <InterviewListView
            config={config}
            onOpen={(id) => navigate({ name: 'detail', id })}
            onNew={() => navigate({ name: 'new' })}
            onOpenConfig={() => setConfigOpen(true)}
          />
        )}
        {route.name === 'new' && (
          <NewInterviewView
            config={config}
            onCreated={(id) => navigate({ name: 'detail', id })}
            onCancel={() => navigate({ name: 'list' })}
            onOpenConfig={() => setConfigOpen(true)}
          />
        )}
        {route.name === 'detail' && (
          <InterviewDetailView
            config={config}
            id={route.id}
            onBack={() => navigate({ name: 'list' })}
            onOpenConfig={() => setConfigOpen(true)}
          />
        )}
      </main>
    </div>
  );
}
