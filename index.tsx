import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Admin from './Admin';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// Simple routing
const path = window.location.pathname;
const Component = path === '/admin' ? Admin : App;

root.render(
  <React.StrictMode>
    <Component />
  </React.StrictMode>
);
