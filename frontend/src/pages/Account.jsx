import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { PublicShell } from '../App';
import { useAuth } from '../auth';
import { fmtRange, inr } from '../format';
import { Empty, ErrorState, Skeleton, useFetch } from '../ui';

export default function Account() {
  const { user } = useAuth();
  const q = useFetch((signal) => (user ? api('/auth/me/bookings', { signal }) : Promise.resolve(null)), [user?.id]);
  if (user === null) return <Navigate to="/login" replace />;
  return (
    <PublicShell>
      <div className="wrap">
        <div className="page-title"><h1 style={{ fontSize: '2.4rem' }}>Your stays</h1><p className="muted">{user?.email}</p></div>
        <div className="stack" style={{ maxWidth: 720 }}>
          {q.loading && <Skeleton h={90} r={8} />}
          {q.error && <ErrorState error={q.error} onRetry={q.reload} />}
          {q.data && !q.data.bookings.length && <Empty title="No bookings yet">When you book while signed in, your stays appear here.</Empty>}
          {q.data?.bookings.map((b) => (
            <div key={b.code} className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div><strong>{b.roomName}</strong><p className="muted small">{fmtRange(b.checkIn, b.checkOut)} · {b.code}</p></div>
                <div style={{ textAlign: 'right' }}><span className={`badge ${b.status === 'confirmed' ? 'badge-ok' : 'badge-red'}`}>{b.status}</span><p className="small">{inr(b.pricing?.total)}</p></div>
              </div>
            </div>
          ))}
          <p className="muted small">Booked as a guest? <Link to="/booking">Find a booking by reference and email</Link>.</p>
        </div>
      </div>
    </PublicShell>
  );
}
