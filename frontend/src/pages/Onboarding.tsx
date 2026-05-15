import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { ShieldCheck } from 'lucide-react';

export default function Onboarding() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, checkSetupStatus } = useAuth();

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await api.post('/auth/setup', { username, password });
      login(data.token, data.user);
      await checkSetupStatus();
    } catch (err: any) {
      setError(err.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="center-container">
      <div className="glass-card" style={{ maxWidth: '400px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <ShieldCheck size={48} color="var(--accent-primary)" style={{ marginBottom: '1rem' }} />
          <h1 className="page-title" style={{ fontSize: '1.5rem' }}>Welcome to Essentials</h1>
          <p className="page-subtitle">Create your initial admin account to get started.</p>
        </div>

        <form onSubmit={handleSetup}>
          <div className="input-group">
            <label>Admin Username</label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              required 
              placeholder="e.g. admin"
            />
          </div>
          <div className="input-group">
            <label>Admin Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              placeholder="••••••••"
            />
          </div>

          {error && <div className="error-msg" style={{ marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}

          <button type="submit" className="btn" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Creating...' : 'Complete Setup'}
          </button>
        </form>
      </div>
    </div>
  );
}
