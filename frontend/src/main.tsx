import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './index.css';

// Number inputs should change only when the user types a value.
document.addEventListener('wheel', (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type === 'number' && target === document.activeElement) {
    event.preventDefault();
  }
}, { capture: true, passive: false });

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type === 'number' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
  }
}, true);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
