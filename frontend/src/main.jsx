import { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { ToastProvider } from './ui';
import './styles.css';

class Boundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return <div style={{ maxWidth: 520, margin: '4rem auto', padding: '0 1rem', fontFamily: 'system-ui' }}><h2>Something went wrong</h2><p>{String(this.state.error.message)}</p><button onClick={() => { window.location.href = '/'; }}>Back to the home page</button></div>;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Boundary><BrowserRouter>
      <AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider>
    </BrowserRouter></Boundary>
  </StrictMode>,
);
