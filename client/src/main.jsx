import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './services/push';
import { captureInstallPrompt } from './services/install';
import { unlockAudioOnFirstInteraction } from './utils/sounds';
import './index.css';

captureInstallPrompt();
unlockAudioOnFirstInteraction();
registerServiceWorker();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
