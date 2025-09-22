import React from 'react';
import ReactDOM from 'react-dom/client';
import './popup.css';
import CookieBackupManager from '../components/CookieBackupManager';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <CookieBackupManager />
  </React.StrictMode>
);
