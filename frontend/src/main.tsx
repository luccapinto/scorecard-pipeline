import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
// Self-hosted, bundled fonts (fontsource). Each face ships per-script subsets
// behind `unicode-range`, so a Portuguese page downloads only the Latin files.
import '@fontsource-variable/newsreader/wght.css';
import '@fontsource-variable/newsreader/wght-italic.css';
import '@fontsource-variable/schibsted-grotesk/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Elemento #root não encontrado no index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
