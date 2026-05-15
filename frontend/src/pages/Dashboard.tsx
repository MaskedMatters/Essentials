import { useAuth } from '../AuthContext';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Overview of your account.</p>
      </div>
      
      <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h2 style={{ fontSize: '2.5rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--accent-primary)' }}>
          Hello, {user?.username}!
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
          Welcome to your Essentials dashboard.
        </p>
      </div>
    </div>
  );
}
