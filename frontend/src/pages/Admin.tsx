import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Trash2, UserPlus, Loader2 } from 'lucide-react';

interface UserData {
  _id: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

export default function Admin() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // New user form state
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  
  const { user: currentUser } = useAuth();

  const fetchUsers = async () => {
    try {
      const data = await api.get('/users');
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError('');
    
    try {
      await api.post('/users', {
        username: newUsername,
        password: newPassword,
        isAdmin: newIsAdmin
      });
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
      console.log(`Deleting user with ID: ${userToDelete._id}`);
      const response = await api.delete(`/users/${userToDelete._id}`);
      console.log('Delete response:', response);
      setDeleteModalOpen(false);
      setUserToDelete(null);
      await fetchUsers();
    } catch (err: any) {
      console.error('Delete error:', err);
      setError(err.message || 'Failed to delete user');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Administration</h1>
        <p className="page-subtitle">Manage users and system settings.</p>
      </div>

      {error && <div className="glass-card" style={{ marginBottom: '2rem', border: '1px solid var(--danger)' }}><div className="error-msg">{error}</div></div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
        <div className="glass-card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 600 }}>Users Directory</h2>
          
          {loading ? (
            <p>Loading users...</p>
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
                          color: u.isAdmin ? '#93c5fd' : '#cbd5e1'
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
                          title={u.username === currentUser?.username ? "Cannot delete yourself" : "Delete user"}
                        >
                          {isDeleting && userToDelete?._id === u._id ? (
                            <Loader2 size={16} className="lucide-spin" style={{ animation: 'spin 2s linear infinite' }} />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="glass-card" style={{ height: 'fit-content' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserPlus size={20} /> Add New User
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
            
            <button type="submit" className="btn" style={{ width: '100%', marginTop: '1.5rem' }} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>
      </div>

      {deleteModalOpen && userToDelete && (
        <div className="modal-overlay">
          <div className="glass-card modal-content">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--danger)', fontWeight: 600 }}>Confirm Deletion</h2>
            <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
              This action cannot be undone. To permanently delete the user, please type <strong>{userToDelete.username}</strong> below to confirm.
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
