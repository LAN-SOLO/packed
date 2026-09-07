import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { readStoredTheme } from './theme';

// Theme synchron VOR dem ersten Render setzen — kein Flackern beim Start.
document.documentElement.dataset.theme = readStoredTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
