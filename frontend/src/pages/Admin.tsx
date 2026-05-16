import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Trash2, UserPlus, Loader2, Key, Copy, Check, Users, Activity, Container, ScrollText, Play, Square, RotateCcw, Zap, Trash, Cpu, HardDrive, Network } from 'lucide-react';
import PasswordStrength, { isPasswordValid } from '../components/PasswordStrength';

// ── Types ────────────────────────────────────────────────────────────────────

interface UserData {
  _id: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

interface SSOConfigState {
  enabled: boolean;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  groupClaimName: string;
  adminGroupName: string;
  autoProvision: boolean;
  autoLogin: boolean;
}

interface LogEntry {
  _id: string;
  timestamp: string;
  level: string;
  service: string;
  message: string;
  containerId?: string;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  stats?: {
    cpuPercent: number;
    memoryUsage: number;
    memoryLimit: number;
    memoryPercent: number;
    netIO: { rx: number; tx: number };
    blockIO: { read: number; write: number };
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'users',  label: 'User Management', icon: <Users size={15} /> },
  { id: 'auth',   label: 'Authentication',  icon: <Key size={15} /> },
  { id: 'docker', label: 'Docker Stats',    icon: <Container size={15} /> },
  { id: 'logs',   label: 'System Logs',     icon: <ScrollText size={15} /> },
];

const DEFAULT_SSO: SSOConfigState = {
  enabled: false,
  issuerUrl: '',
  clientId: '',
  clientSecret: '',
  scopes: 'openid profile email',
  groupClaimName: 'groups',
  adminGroupName: 'admins',
  autoProvision: false,
  autoLogin: false,
};

// ── Component ────────────────────────────────────────────────────────────────

export default function Admin() {
  // Tab state
  const [activeTab, setActiveTab] = useState('users');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  // User management state
  const [users, setUsers] = useState<UserData[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState('');

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // SSO state
  const [ssoConfig, setSsoConfig] = useState<SSOConfigState>(DEFAULT_SSO);
  const [savingSso, setSavingSso] = useState(false);
  const [ssoMessage, setSsoMessage] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Logs state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilter, setLogFilter] = useState({ service: '', level: '' });
  const [autoRefresh, setAutoRefresh] = useState(() => localStorage.getItem('essentials_auto_refresh') === 'true');
  const [availableServices, setAvailableServices] = useState<string[]>([]);

  // Docker state
  const [dockerContainers, setDockerContainers] = useState<DockerContainer[]>([]);
  const [savedWorkspaces, setSavedWorkspaces] = useState<string[]>([]);
  const [dockerLoading, setDockerLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { user: currentUser } = useAuth();

  // ── Indicator animation ───────────────────────────────────────────────────

  useLayoutEffect(() => {
    const el = tabRefs.current[activeTab];
    if (el) setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeTab]);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchUsers = async () => {
    try {
      const data = await api.get('/users');
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchSsoConfig = async () => {
    try {
      const data = await api.get('/sso/config');
      if (data) setSsoConfig((prev) => ({ ...prev, ...data }));
    } catch {
      // Non-critical — defaults remain in place
    }
  };

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (logFilter.service) params.append('service', logFilter.service);
      if (logFilter.level) params.append('level', logFilter.level);
      params.append('limit', '200');

      const data = await api.get(`/logs?${params.toString()}`);
      setLogs(data);
      
      // Update available services list without removing existing ones
      if (data && Array.isArray(data)) {
        const newServices = [...new Set(data.map((l: any) => l.service))];
        setAvailableServices(prev => {
          const merged = [...new Set([...prev, ...newServices])];
          return merged.sort();
        });
      }
    } catch (err: any) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchDockerContainers = async () => {
    try {
      const data = await api.get('/docker/containers');
      setDockerContainers(data);
      
      const workspaces = await api.get('/docker/workspaces');
      setSavedWorkspaces(workspaces);

      // Fetch stats for running containers
      data.forEach((c: DockerContainer) => {
        if (c.state === 'running') {
          fetchContainerStats(c.id);
        }
      });
    } catch (err: any) {
      console.error('Failed to fetch containers:', err);
    } finally {
      setDockerLoading(false);
    }
  };

  const fetchContainerStats = async (id: string) => {
    try {
      const stats = await api.get(`/docker/containers/${id}/stats`);
      setDockerContainers(prev => prev.map(c => c.id === id ? { ...c, stats } : c));
    } catch (err: any) {
      console.error(`Failed to fetch stats for ${id}:`, err);
    }
  };

  const handleContainerAction = async (id: string, action: string) => {
    setActionLoading(`${id}-${action}`);
    try {
      await api.post(`/docker/containers/${id}/action`, { action });
      await fetchDockerContainers();
    } catch (err: any) {
      setError(err.message || `Failed to ${action} container`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteWorkspace = async (username: string) => {
    if (!window.confirm(`Are you sure you want to delete all saved data for workspace "${username}"?`)) return;
    setActionLoading(`workspace-${username}`);
    try {
      await api.delete(`/docker/workspaces/${username}`);
      await fetchDockerContainers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete workspace volume');
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchSsoConfig();
  }, []);

  useEffect(() => {
    localStorage.setItem('essentials_auto_refresh', autoRefresh.toString());
  }, [autoRefresh]);

  useEffect(() => {
    if (activeTab === 'logs') {
      setLogsLoading(true);
      fetchLogs();
    }
    if (activeTab === 'docker') {
      setDockerLoading(true);
      fetchDockerContainers();
    }
  }, [activeTab, logFilter]);

  useEffect(() => {
    let interval: any;
    if (activeTab === 'logs' && autoRefresh) {
      interval = setInterval(fetchLogs, 5000);
    }
    return () => clearInterval(interval);
  }, [activeTab, autoRefresh, logFilter]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid(newPassword)) return;
    setIsCreating(true);
    setError('');
    try {
      await api.post('/users', { username: newUsername, password: newPassword, isAdmin: newIsAdmin });
      setNewUsername('');
      setNewPassword('');
      setNewIsAdmin(false);
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveSso = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSso(true);
    setSsoMessage('');
    setError('');
    try {
      await api.put('/sso/config', ssoConfig);
      setSsoMessage('SSO configuration saved successfully.');
      setTimeout(() => setSsoMessage(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save SSO config');
    } finally {
      setSavingSso(false);
    }
  };

  const promptDeleteUser = (user: UserData) => {
    setUserToDelete(user);
    setDeleteConfirmText('');
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete || deleteConfirmText !== userToDelete.username) return;
    setIsDeleting(true);
    setError('');
    try {
      await api.delete(`/users/${userToDelete._id}`);
      setDeleteModalOpen(false);
      setUserToDelete(null);
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setIsDeleting(false);
    }
  };

  const copyUrl = (value: string) => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopiedUrl(value);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  // ── Tab Panels ────────────────────────────────────────────────────────────

  const renderUsers = () => (
    <div className="admin-tab-content">
      {error && (
        <div className="glass-card" style={{ marginBottom: '2rem', border: '1px solid var(--danger)' }}>
          <div className="error-msg">{error}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
        {/* Users table */}
        <div className="glass-card">
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', fontWeight: 600 }}>Users Directory</h2>
          {usersLoading ? (
            <p style={{ color: 'var(--text-secondary)' }}>Loading users...</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id}>
                      <td style={{ fontWeight: 500 }}>{u.username}</td>
                      <td>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          backgroundColor: u.isAdmin ? 'rgba(59, 130, 246, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                          color: u.isAdmin ? '#93c5fd' : '#cbd5e1',
                        }}>
                          {u.isAdmin ? 'Admin' : 'User'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          onClick={() => promptDeleteUser(u)}
                          className="btn btn-danger"
                          style={{ padding: '0.5rem', display: 'flex', alignItems: 'center' }}
                          disabled={u.username === currentUser?.username || (isDeleting && userToDelete?._id === u._id)}
                          title={u.username === currentUser?.username ? 'Cannot delete yourself' : 'Delete user'}
                        >
                          {isDeleting && userToDelete?._id === u._id
                            ? <Loader2 size={16} style={{ animation: 'spin 2s linear infinite' }} />
                            : <Trash2 size={16} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add user form */}
        <div className="glass-card" style={{ height: 'fit-content' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserPlus size={18} /> Add New User
          </h2>
          <form onSubmit={handleCreateUser}>
            <div className="input-group">
              <label>Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <PasswordStrength password={newPassword} />
            <div className="checkbox-wrapper">
              <input
                type="checkbox"
                id="isAdmin"
                checked={newIsAdmin}
                onChange={(e) => setNewIsAdmin(e.target.checked)}
                className="custom-checkbox"
              />
              <label htmlFor="isAdmin">Administrator privileges</label>
            </div>
            <button
              type="submit"
              className="btn"
              style={{ width: '100%', marginTop: '1.5rem' }}
              disabled={isCreating || !isPasswordValid(newPassword)}
            >
              {isCreating ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  const renderAuth = () => (
    <div className="admin-tab-content">
      <div className="glass-card">
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Key size={18} /> OpenID Connect
        </h2>

        {ssoMessage && (
          <div style={{ color: 'var(--accent-primary)', marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '0.5rem' }}>
            {ssoMessage}
          </div>
        )}

        {/* Provider Configuration URLs */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(148, 163, 184, 0.05)', border: '1px solid var(--border)', borderRadius: '0.75rem' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', fontWeight: 600 }}>
            Provider Configuration URLs
          </p>
          {[
            { label: 'Redirect / Callback URI', value: `${window.location.origin}/api/sso/callback` },
            { label: 'Post-Logout Redirect URI', value: `${window.location.origin}/logout` },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>{label}</p>
                <code style={{ fontSize: '0.8rem', color: 'var(--text-primary)', backgroundColor: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.5rem', borderRadius: '0.35rem', display: 'block', wordBreak: 'break-all' }}>
                  {value}
                </code>
              </div>
              <button
                type="button"
                onClick={() => copyUrl(value)}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.4rem', cursor: 'pointer', color: copiedUrl === value ? 'var(--accent-primary)' : 'var(--text-secondary)', flexShrink: 0, display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
                title="Copy to clipboard"
              >
                {copiedUrl === value ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={handleSaveSso}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <div className="checkbox-wrapper" style={{ marginBottom: '1.5rem' }}>
                <input type="checkbox" id="ssoEnabled" checked={ssoConfig.enabled} onChange={(e) => setSsoConfig({ ...ssoConfig, enabled: e.target.checked })} className="custom-checkbox" />
                <label htmlFor="ssoEnabled">Enable OpenID Connect SSO</label>
              </div>
              <div className="input-group">
                <label>Issuer URL</label>
                <input type="url" value={ssoConfig.issuerUrl} onChange={(e) => setSsoConfig({ ...ssoConfig, issuerUrl: e.target.value })} placeholder="https://accounts.google.com" disabled={!ssoConfig.enabled} />
              </div>
              <div className="input-group">
                <label>Client ID</label>
                <input type="text" value={ssoConfig.clientId} onChange={(e) => setSsoConfig({ ...ssoConfig, clientId: e.target.value })} disabled={!ssoConfig.enabled} />
              </div>
              <div className="input-group">
                <label>Client Secret</label>
                <input type="password" value={ssoConfig.clientSecret || ''} onChange={(e) => setSsoConfig({ ...ssoConfig, clientSecret: e.target.value })} disabled={!ssoConfig.enabled} placeholder="••••••••••••" />
              </div>
              <div className="input-group">
                <label>Scopes</label>
                <input type="text" value={ssoConfig.scopes} onChange={(e) => setSsoConfig({ ...ssoConfig, scopes: e.target.value })} disabled={!ssoConfig.enabled} placeholder="openid profile email" />
              </div>
            </div>
            <div>
              <div className="checkbox-wrapper" style={{ marginBottom: '1.5rem' }}>
                <input type="checkbox" id="autoLogin" checked={ssoConfig.autoLogin} onChange={(e) => setSsoConfig({ ...ssoConfig, autoLogin: e.target.checked })} className="custom-checkbox" disabled={!ssoConfig.enabled} />
                <label htmlFor="autoLogin">Auto-redirect to SSO on login page</label>
              </div>
              <div className="checkbox-wrapper" style={{ marginBottom: '1.5rem' }}>
                <input type="checkbox" id="autoProvision" checked={ssoConfig.autoProvision} onChange={(e) => setSsoConfig({ ...ssoConfig, autoProvision: e.target.checked })} className="custom-checkbox" disabled={!ssoConfig.enabled} />
                <label htmlFor="autoProvision">Auto-provision new users</label>
              </div>
              <div className="input-group">
                <label>Group Claim Name</label>
                <input type="text" value={ssoConfig.groupClaimName} onChange={(e) => setSsoConfig({ ...ssoConfig, groupClaimName: e.target.value })} disabled={!ssoConfig.enabled} placeholder="groups" />
              </div>
              <div className="input-group">
                <label>Admin Group Value</label>
                <input type="text" value={ssoConfig.adminGroupName} onChange={(e) => setSsoConfig({ ...ssoConfig, adminGroupName: e.target.value })} disabled={!ssoConfig.enabled} placeholder="admins" />
              </div>
            </div>
          </div>
          <button type="submit" className="btn" style={{ marginTop: '1rem' }} disabled={savingSso}>
            {savingSso ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  );

  const renderDocker = () => {
    const formatBytes = (bytes: number) => {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const systemServices = dockerContainers.filter(c => !c.name.startsWith('essentials-chrome-'));
    const activeWorkspaces = dockerContainers.filter(c => c.name.startsWith('essentials-chrome-'));
    
    // Ghost workspaces: saved volumes that don't have an active container
    const ghostWorkspaces = savedWorkspaces.filter(username => 
      !activeWorkspaces.some(c => c.name === `essentials-chrome-${username}`)
    );

    const renderContainerRow = (c: DockerContainer | any, isGhost = false) => (
      <tr key={isGhost ? `ghost-${c.username}` : c.id}>
        <td>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {isGhost ? `essentials-chrome-${c.username}` : c.name}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
              {isGhost ? 'VOL_ONLY' : c.id.substring(0, 12)}
            </span>
          </div>
        </td>
        <td>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {isGhost ? 'N/A' : c.image}
          </span>
        </td>
        <td>
          <span style={{
            padding: '0.25rem 0.6rem',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor: isGhost ? 'rgba(234, 179, 8, 0.1)' : (c.state === 'running' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(148, 163, 184, 0.2)'),
            color: isGhost ? '#eab308' : (c.state === 'running' ? '#4ade80' : '#94a3b8'),
            textTransform: 'capitalize',
            whiteSpace: 'nowrap',
            display: 'inline-block'
          }}>
            {isGhost ? 'Saved Volume' : c.status}
          </span>
        </td>
        <td>
          {!isGhost && c.stats ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                <Cpu size={12} color="var(--text-secondary)" />
                <span>{c.stats.cpuPercent}%</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                <Activity size={12} color="var(--text-secondary)" />
                <span>{formatBytes(c.stats.memoryUsage)} / {formatBytes(c.stats.memoryLimit)} ({c.stats.memoryPercent}%)</span>
              </div>
            </div>
          ) : (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>--</span>
          )}
        </td>
        <td>
          {!isGhost && c.stats ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                <Network size={12} color="var(--text-secondary)" />
                <span>RX: {formatBytes(c.stats.netIO.rx)} | TX: {formatBytes(c.stats.netIO.tx)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                <HardDrive size={12} color="var(--text-secondary)" />
                <span>R: {formatBytes(c.stats.blockIO.read)} | W: {formatBytes(c.stats.blockIO.write)}</span>
              </div>
            </div>
          ) : (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>--</span>
          )}
        </td>
        <td style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            {isGhost ? (
              <button 
                className="btn-icon btn-icon-danger" 
                title="Delete Data (Volume Bind)"
                onClick={() => handleDeleteWorkspace(c.username)}
                disabled={!!actionLoading}
              >
                {actionLoading === `workspace-${c.username}` ? <Loader2 size={16} className="spin" /> : <Trash size={16} />}
              </button>
            ) : (
              <>
                {c.state !== 'running' ? (
                  <button 
                    className="btn-icon" 
                    title="Start"
                    onClick={() => handleContainerAction(c.id, 'start')}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === `${c.id}-start` ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
                  </button>
                ) : (
                  <>
                    <button 
                      className="btn-icon" 
                      title="Stop"
                      onClick={() => handleContainerAction(c.id, 'stop')}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === `${c.id}-stop` ? <Loader2 size={16} className="spin" /> : <Square size={16} />}
                    </button>
                    <button 
                      className="btn-icon" 
                      title="Restart"
                      onClick={() => handleContainerAction(c.id, 'restart')}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === `${c.id}-restart` ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />}
                    </button>
                    <button 
                      className="btn-icon btn-icon-danger" 
                      title="Kill"
                      onClick={() => handleContainerAction(c.id, 'kill')}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === `${c.id}-kill` ? <Loader2 size={16} className="spin" /> : <Zap size={16} />}
                    </button>
                  </>
                )}
                <button 
                  className="btn-icon btn-icon-danger" 
                  title="Remove"
                  onClick={() => handleContainerAction(c.id, 'remove')}
                  disabled={!!actionLoading}
                >
                  {actionLoading === `${c.id}-remove` ? <Loader2 size={16} className="spin" /> : <Trash size={16} />}
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );

    return (
      <div className="admin-tab-content">
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Container size={22} className="accent-text" /> Container Management
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                Monitor and manage all system containers and resource usage.
              </p>
            </div>
            <button 
              className="btn" 
              onClick={() => { setDockerLoading(true); fetchDockerContainers(); }}
              disabled={dockerLoading}
            >
              {dockerLoading ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />}
              Refresh Stats
            </button>
          </div>

          <div className="table-container">
            <table className="docker-table">
              <thead>
                <tr>
                  <th>Container</th>
                  <th>Image</th>
                  <th>Status</th>
                  <th>CPU / MEM</th>
                  <th>Network / IO</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* System Services Section */}
                <tr className="table-section-header">
                  <td colSpan={6}>System Services</td>
                </tr>
                {systemServices.map(c => renderContainerRow(c))}

                {/* Separator / Workspaces Section */}
                {(activeWorkspaces.length > 0 || ghostWorkspaces.length > 0) && (
                  <>
                    <tr className="table-section-header">
                      <td colSpan={6} style={{ paddingTop: '2rem' }}>User Workspaces (Disposable)</td>
                    </tr>
                    {activeWorkspaces.map(c => renderContainerRow(c))}
                    {ghostWorkspaces.map(username => renderContainerRow({ username }, true))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderLogs = () => {
    const getLevelColor = (level: string) => {
      switch (level.toLowerCase()) {
        case 'error': return '#f87171';
        case 'warn':  return '#fbbf24';
        case 'debug': return '#94a3b8';
        default:      return '#60a5fa';
      }
    };

    return (
      <div className="admin-tab-content">
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 350px)', minHeight: '500px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ScrollText size={18} /> System Logs
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select 
                  className="btn" 
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
                  value={logFilter.service}
                  onChange={(e) => setLogFilter({ ...logFilter, service: e.target.value })}
                >
                  <option value="" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>All Services</option>
                  {availableServices.map(s => (
                    <option key={s} value={s} style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{s}</option>
                  ))}
                </select>
                <select 
                  className="btn" 
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
                  value={logFilter.level}
                  onChange={(e) => setLogFilter({ ...logFilter, level: e.target.value })}
                >
                  <option value="" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>All Levels</option>
                  <option value="info" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Info</option>
                  <option value="warn" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Warning</option>
                  <option value="error" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Error</option>
                  <option value="debug" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Debug</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className="checkbox-wrapper" style={{ margin: 0 }}>
                <input 
                  type="checkbox" 
                  id="autoRefresh" 
                  checked={autoRefresh} 
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="custom-checkbox" 
                />
                <label htmlFor="autoRefresh" style={{ fontSize: '0.8rem' }}>Auto-refresh</label>
              </div>
              <button 
                className="btn" 
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                onClick={() => { setLogsLoading(true); fetchLogs(); }}
                disabled={logsLoading}
              >
                {logsLoading ? <Loader2 size={14} className="spin" /> : 'Refresh Now'}
              </button>
            </div>
          </div>

          <div style={{ 
            flex: 1, 
            overflow: 'auto', 
            backgroundColor: 'rgba(0,0,0,0.3)', 
            borderRadius: '0.75rem', 
            padding: '1rem',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: '0.85rem',
            lineHeight: '1.5'
          }}>
            {logs.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                <Activity size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p>No logs found matching filters.</p>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log._id} style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '0.35rem 0' }}>
                  <span style={{ color: 'var(--text-secondary)', flexShrink: 0, width: '160px' }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                  <span style={{ 
                    color: getLevelColor(log.level), 
                    fontWeight: 600, 
                    textTransform: 'uppercase', 
                    flexShrink: 0, 
                    width: '60px',
                    fontSize: '0.75rem'
                  }}>
                    {log.level}
                  </span>
                  <span style={{ color: 'var(--accent-primary)', flexShrink: 0, width: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    [{log.service}]
                  </span>
                  <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const panels: Record<string, () => React.ReactNode> = {
    users: renderUsers,
    auth: renderAuth,
    docker: renderDocker,
    logs: renderLogs,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Administration</h1>
        <p className="page-subtitle">Manage users, authentication, and system settings.</p>
      </div>

      {/* Tab Bar */}
      <div className="admin-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[tab.id] = el; }}
            className={`admin-tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        <div className="admin-tab-indicator" style={{ left: indicatorStyle.left, width: indicatorStyle.width }} />
      </div>

      {/* Tab Content */}
      {panels[activeTab]?.()}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && userToDelete && (
        <div className="modal-overlay">
          <div className="glass-card modal-content">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--danger)', fontWeight: 600 }}>
              Confirm Deletion
            </h2>
            <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
              This action cannot be undone. Type <strong>{userToDelete.username}</strong> to confirm.
            </p>
            <div className="input-group">
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={userToDelete.username}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button
                className="btn"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                onClick={() => setDeleteModalOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleConfirmDelete}
                disabled={deleteConfirmText !== userToDelete.username || isDeleting}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {isDeleting && <Loader2 size={16} style={{ animation: 'spin 2s linear infinite' }} />}
                {isDeleting ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
