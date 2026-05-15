import { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { LogIn } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoConfig, setSsoConfig] = useState<any>(null);
  const [checkingSso, setCheckingSso] = useState(true);
  const { login } = useAuth();

  useEffect(() => {
    const checkSso = async () => {
      try {
        const config = await api.get('/sso/config');
        setSsoConfig(config);
        
        const params = new URLSearchParams(window.location.search);
        const forceLocal = params.get('local') === 'true';

        if (config.enabled && config.autoLogin && !forceLocal) {
          window.location.href = '/api/sso/login';
        } else {
          setCheckingSso(false);
        }
      } catch (err) {
        setCheckingSso(false);
      }
    };
    checkSso();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await api.post('/auth/login', { username, password });
      login(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSso) {
    return (
      <div className="center-container">
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <p>Preparing login...</p>
        </div>
      </div>
    );
  }

  const params = new URLSearchParams(window.location.search);
  const forceLocal = params.get('local') === 'true';
  const showLocalForm = !ssoConfig?.enabled || forceLocal;

  return (
    <div className="center-container">
      <div className="glass-card" style={{ maxWidth: '400px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <LogIn size={48} color="var(--accent-primary)" style={{ marginBottom: '1rem' }} />
          <h1 className="page-title" style={{ fontSize: '1.5rem' }}>Welcome Back</h1>
          <p className="page-subtitle">Sign in to your account.</p>
        </div>

        {ssoConfig?.enabled && !forceLocal && (
          <div style={{ marginBottom: '2rem' }}>
            <button 
              className="btn" 
              style={{ width: '100%', backgroundColor: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              onClick={() => window.location.href = '/api/sso/login'}
            >
              <LogIn size={20} />
              Login with Single Sign-On
            </button>
            
            {showLocalForm && (
              <div style={{ display: 'flex', alignItems: 'center', margin: '1.5rem 0' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }}></div>
                <span style={{ padding: '0 1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>OR</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }}></div>
              </div>
            )}
          </div>
        )}

        {showLocalForm && (
          <form onSubmit={handleLogin}>
            <div className="input-group">
              <label>Username</label>
              <input 
                type="text" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                required 
                placeholder="Enter your username"
              />
            </div>
            <div className="input-group">
              <label>Password</label>
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
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
