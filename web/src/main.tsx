import './zod-config.ts';
import './pwa/install.ts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-ext-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-ext-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-ext-600.css';
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/silkscreen/latin-ext-400.css';
import { App } from './App.tsx';
import { reloadOnChunkLoadError } from './pwa/chunk-reload.ts';
import { registerServiceWorker } from './pwa/register-service-worker.ts';
import './styles/tokens.css';
import './styles/app.css';

reloadOnChunkLoadError();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
