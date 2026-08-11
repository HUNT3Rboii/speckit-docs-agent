import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { registerMermaidHandler } from './mermaid';
import './styles.css';

// Registered before the first render: the host may ask for a diagram as soon as
// the panel exists, and a request arriving before its handler is a silent
// "no handler for renderMermaid".
registerMermaidHandler();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Webview root element is missing');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
