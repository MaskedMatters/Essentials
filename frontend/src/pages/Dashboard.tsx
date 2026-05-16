import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import {
  Monitor, Play, Square, Trash2, Loader2,
  Globe, X, RefreshCw, AlertCircle,
} from 'lucide-react';

type SessionStatus = 'none' | 'running' | 'saved' | 'loading';

export default function Dashboard() {
  const { user, token } = useAuth();
  const [status, setStatus]     = useState<SessionStatus>('loading');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const [iframeOpen, setIframeOpen] = useState(false);

  // ── Status polling ──────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.get('/containers/status');
      setStatus(data.status as SessionStatus);
    } catch {
      setStatus('none');
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll while a container is running so the UI stays in sync
  useEffect(() => {
    if (status !== 'running') return;
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [status, fetchStatus]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () => withBusy(async () => {
    await api.post('/containers/create', {});
    await fetchStatus();
  });

  const handleStop = () => withBusy(async () => {
    setIframeOpen(false);
    await api.post('/containers/stop', {});
    await fetchStatus();
  });

  const handleDelete = () => withBusy(async () => {
    await api.delete('/containers/volume');
    await fetchStatus();
  });

  const handleOpen = async () => {
    setIframeOpen(true);
  };

  // ── Proxy URL ────────────────────────────────────────────────────────────
  // Pass the JWT via query param so the iframe src carries auth.
  // The ?autoconnect=1 & password params auto-login into the kasmweb UI.
  const proxyUrl = token
    ? `/api/containers/proxy/vnc.html?token=${encodeURIComponent(token)}&autoconnect=1&password=${encodeURIComponent('password')}&username=${encodeURIComponent('kasm_user')}`
    : '';

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Welcome back, <strong>{user?.username}</strong>.</p>
      </div>

      {/* Session Card */}
      <div className="glass-card session-card">
        <div className="session-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className={`session-icon ${status === 'running' ? 'session-icon--running' : ''}`}>
              <Monitor size={22} />
            </div>
            <div>
              <h2 style={{ fontWeight: 600, fontSize: '1.1rem' }}>Browser Session</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Personal Chromium container with persistent storage
              </p>
            </div>
          </div>
          <SessionBadge status={status} />
        </div>

        {error && (
          <div className="session-error">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        <div className="session-body">
          {status === 'loading' && (
            <div className="session-placeholder">
              <Loader2 size={32} className="spin" />
              <p>Checking session status…</p>
            </div>
          )}

          {status === 'none' && (
            <div className="session-placeholder">
              <Globe size={48} style={{ opacity: 0.2 }} />
              <p>No active or saved session. Start a new one below.</p>
              <button className="btn" onClick={handleCreate} disabled={busy} style={{ marginTop: '0.5rem' }}>
                {busy ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
                {busy ? 'Starting…' : 'Create Session'}
              </button>
            </div>
          )}

          {status === 'running' && (
            <div className="session-actions">
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Your Chromium container is running. Opening the session...
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn" onClick={handleOpen} disabled={busy}>
                  <Monitor size={16} />
                  Open in App
                </button>
                <button className="btn btn-danger" onClick={handleStop} disabled={busy}>
                  {busy ? <Loader2 size={16} className="spin" /> : <Square size={16} />}
                  {busy ? 'Stopping…' : 'Stop & Save'}
                </button>
              </div>
            </div>
          )}

          {status === 'saved' && (
            <div className="session-actions">
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                You have a saved session. Resume it to pick up where you left off, or delete it to start fresh.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn" onClick={handleCreate} disabled={busy}>
                  {busy ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
                  {busy ? 'Starting…' : 'Resume Session'}
                </button>
                <button className="btn btn-danger" onClick={handleDelete} disabled={busy}>
                  {busy ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                  {busy ? 'Deleting…' : 'Delete Session'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Browser Overlay */}
      {iframeOpen && (
        <div className="browser-overlay">
          <div className="browser-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Monitor size={16} />
              <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                Browser Session — {user?.username}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="toolbar-btn"
                onClick={() => { const f = document.getElementById('kasm-frame') as HTMLIFrameElement; if (f) f.src = f.src; }}
                title="Reload"
              >
                <RefreshCw size={15} />
              </button>
              <button className="toolbar-btn toolbar-btn--danger" onClick={() => setIframeOpen(false)} title="Close">
                <X size={15} />
              </button>
            </div>
          </div>
          <iframe
            id="kasm-frame"
            src={proxyUrl}
            title="Browser Session"
            className="browser-frame"
            allow="clipboard-read; clipboard-write"
          />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SessionBadge({ status }: { status: SessionStatus }) {
  const map: Record<SessionStatus, { label: string; color: string; bg: string }> = {
    loading: { label: 'Checking…', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
    none:    { label: 'No Session', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
    running: { label: 'Running',    color: '#4ade80', bg: 'rgba(74,222,128,0.15)'  },
    saved:   { label: 'Saved',      color: '#fb923c', bg: 'rgba(251,146,60,0.15)'  },
  };
  const { label, color, bg } = map[status];
  return (
    <span style={{ padding: '0.3rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, color, backgroundColor: bg }}>
      {label}
    </span>
  );
}
