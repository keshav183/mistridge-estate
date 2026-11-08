import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { BRAND, ago } from '../format';

const ROLE = { gm: 'General Manager', reservations: 'Reservations', sales: 'Sales' };

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [notes, setNotes] = useState([]);
  const [open, setOpen] = useState(false);
  const desk = user.role === 'reservations' || user.role === 'gm';

  useEffect(() => {
    let live = true;
    const load = () => api('/admin/notifications').then((d) => live && setNotes(d.notifications)).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => { live = false; clearInterval(t); };
  }, []);
  const unread = notes.filter((n) => !n.read).length;
  const toggle = async () => { setOpen((o) => !o); if (!open && unread) { await api('/admin/notifications/read', { method: 'POST' }).catch(() => {}); setNotes((n) => n.map((x) => ({ ...x, read: true }))); } };

  return (
    <div className="admin">
      <aside className="side">
        <Link to="/" className="brand">{BRAND}</Link>
        <nav aria-label="Staff">
          <NavLink to="inbox">Enquiry inbox</NavLink>
          {desk && <NavLink to="rates">Rates &amp; allotment</NavLink>}
          {desk && <NavLink to="bookings">Bookings</NavLink>}
          {desk && <NavLink to="promos">Promo codes</NavLink>}
        </nav>
        <div className="who"><div>{user.name}</div><div style={{ opacity: .7 }}>{ROLE[user.role]}</div><button onClick={async () => { await logout(); nav('/'); }}>Sign out</button></div>
      </aside>
      <div className="admin-main">
        <div className="topbar" style={{ justifyContent: 'flex-end' }}>
          <div className="bell">
            <button className="btn btn-quiet btn-sm" onClick={toggle} aria-label={`Alerts${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}>Alerts</button>
            {unread > 0 && <span className="dot" aria-hidden="true">{unread}</span>}
            {open && (
              <div className="dropdown" role="menu">
                {!notes.length && <p className="muted small" style={{ padding: '.6rem' }}>No alerts.</p>}
                {notes.map((n) => <Link key={n.id} to="inbox" state={{ open: n.enquiryId }} onClick={() => setOpen(false)}><strong style={{ color: 'var(--cherry)' }}>Complaint</strong> · {n.text}<br /><span className="muted small">{ago(n.at)}</span></Link>)}
              </div>
            )}
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
