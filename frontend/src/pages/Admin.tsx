import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Trash2, UserPlus, Loader2, Key, Copy, Check, Users, Activity, Container, ScrollText } from 'lucide-react';
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

  useEffect(() => {
    fetchUsers();
    fetchSsoConfig();
  }, []);

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

  const renderDocker = () => (
    <div className="admin-tab-content">
      <div className="glass-card placeholder-tab">
        <Activity size={48} />
        <h3 style={{ fontWeight: 600 }}>Docker Stats</h3>
        <p>Container resource usage and live monitoring will appear here once Docker management is implemented.</p>
      </div>
    </div>
  );

  const renderLogs = () => (
    <div className="admin-tab-content">
      <div className="glass-card placeholder-tab">
        <ScrollText size={48} />
        <h3 style={{ fontWeight: 600 }}>System Logs</h3>
        <p>Application and container logs will be streamed here in a future update.</p>
      </div>
    </div>
  );

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
