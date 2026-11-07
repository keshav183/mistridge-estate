import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export const Spinner = ({ label = 'Loading' }) => <span className="spinner" role="status" aria-label={label} />;
export const Skeleton = ({ h = 16, w = '100%', r = 6, style }) => <span className="skeleton" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden="true" />;

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state" role="alert">
      <p className="state-title">{error?.message || 'Something went wrong.'}</p>
      {onRetry && <button className="btn btn-quiet" onClick={onRetry}>Try again</button>}
    </div>
  );
}
export const Empty = ({ title, children }) => (
  <div className="state"><p className="state-title">{title}</p>{children && <p className="muted">{children}</p>}</div>
);

export function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={`field ${error ? 'has-error' : ''} ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </label>
  );
}

// Photos are sized by aspect-ratio so the page never jumps while they load.
export const Photo = ({ src, alt, ratio = '4 / 3', eager = false, className = '' }) => (
  <div className={`photo ${className}`} style={{ aspectRatio: ratio }}>
    <img src={src} alt={alt} width="1600" height="1000" loading={eager ? 'eager' : 'lazy'} decoding="async" fetchpriority={eager ? 'high' : 'auto'} />
  </div>
);

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const id = useRef(0);
  const push = useCallback((text, tone = 'ok') => {
    const n = ++id.current;
    setItems((s) => [...s, { n, text, tone }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.n !== n)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">{items.map((t) => <div key={t.n} className={`toast toast-${t.tone}`}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}

/** Small data hook: { data, error, loading, reload } with abort on unmount / param change. */
export function useFetch(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fn(ac.signal).then((data) => setState({ data, error: null, loading: false })).catch((error) => { if (error.name !== 'AbortError') setState({ data: null, error, loading: false }); });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
