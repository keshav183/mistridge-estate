import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { BRAND } from './format';
import { Spinner } from './ui';
import Book from './pages/Book';
import Events from './pages/Events';
import Home from './pages/Home';
import Login from './pages/Login';
import Lookup from './pages/Lookup';
import Room from './pages/Room';

// Staff screens are code-split: guests on slow networks never download them.
const AdminLayout = lazy(() => import('./admin/AdminLayout'));
const Rates = lazy(() => import('./admin/Rates'));
const Inbox = lazy(() => import('./admin/Inbox'));
const Bookings = lazy(() => import('./admin/Bookings'));
const Promos = lazy(() => import('./admin/Promos'));

export function SiteHeader({ solid }) {
  const { user, logout, isStaff } = useAuth();
  return (
    <header className={`site-head ${solid ? 'solid' : ''}`}>
      <div className="wrap">
        <Link to="/" className="brand">{BRAND}</Link>
        <nav className="nav" aria-label="Main">
          <Link to="/events" className="hide-sm">Weddings &amp; events</Link>
          <Link to="/booking" className="hide-sm">My booking</Link>
          {isStaff ? (<><Link to="/admin/inbox">Staff desk</Link><button onClick={logout}>Sign out</button></>) : <Link to="/login" className="hide-sm">Staff</Link>}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="wrap">
        <div><strong>{BRAND}</strong><p>A coffee-estate resort in Chikkamagaluru, Karnataka. 64 rooms and 12 villas among shade-grown coffee.</p></div>
        <div><h4>Stay</h4><Link to="/">Rooms &amp; villas</Link><Link to="/events">Weddings &amp; offsites</Link><Link to="/booking">Find my booking</Link></div>
        <div><h4>Your data</h4><p>We use your details only to manage your booking or enquiry, as required under the DPDP Act, 2023. Passport details for foreign guests are collected at check-in, not online.</p></div>
      </div>
    </footer>
  );
}

export const PublicShell = ({ children, solid = true }) => (<><SiteHeader solid={solid} /><main id="main">{children}</main><SiteFooter /></>);

function NotFound() {
  return <PublicShell><div className="narrow"><h1>Page not found</h1><p className="muted">That page does not exist.</p><Link className="btn" to="/">Back to rooms</Link></div></PublicShell>;
}

function Staff({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === undefined) return <div className="state" style={{ margin: '4rem auto', maxWidth: 320 }}><Spinner /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<div className="state" style={{ margin: '4rem auto', maxWidth: 320 }}><Spinner /></div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/rooms/:slug" element={<Room />} />
        <Route path="/book" element={<Book />} />
        <Route path="/booking" element={<Lookup />} />
        <Route path="/events" element={<Events />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Staff><AdminLayout /></Staff>}>
          <Route index element={<Navigate to="inbox" replace />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="rates" element={<Rates />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="promos" element={<Promos />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
