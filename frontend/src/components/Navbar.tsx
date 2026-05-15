import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { LayoutDashboard, Users, LogOut } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user) return null;

  return (
    <nav className="navbar">
      <Link to="/dashboard" className="navbar-brand">
        Essentials
      </Link>
      <div className="navbar-nav">
        <Link to="/dashboard" className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LayoutDashboard size={18} /> Dashboard
        </Link>
        {user.isAdmin && (
          <Link to="/admin" className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} /> Administration
          </Link>
        )}
        <button onClick={logout} className="btn btn-danger" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
          <LogOut size={16} /> Logout
        </button>
      </div>
    </nav>
  );
}
