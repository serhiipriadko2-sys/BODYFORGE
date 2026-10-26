import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './fonts.css';
import './index.css';
import './forge.css';
import './world.css';
import './premium.css';
import './appearance.css';
import { applyAppearance, loadAppearance } from './lib/appearance';

applyAppearance(loadAppearance().settings);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
