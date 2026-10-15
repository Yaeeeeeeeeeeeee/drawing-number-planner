import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';
import './workspace-theme.css';
import './styles.css';
import './batch2-ui.css';
import './integrated-ui.css';
import './approved-ui.css';
import './module-workspace.css';
import './p3-module-alignment.css';
import './p4-workspace-refinement.css';
import './p4-adaptive-data.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
