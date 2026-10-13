import './zod-config.ts';
import './pwa/install.ts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/silkscreen/400.css';
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
