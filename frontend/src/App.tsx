import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Onboarding from './pages/Onboarding';
import Login from './pages/Login';
import Logout from './pages/Logout';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Navbar from './components/Navbar';

function App() {
  const { user, isSetupComplete } = useAuth();

  if (isSetupComplete === null) {
    return <div className="center-container">Loading...</div>;
  }

  if (!isSetupComplete) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <div className="layout-container">
      {user && <Navbar />}
      <div className="page-container">
        <Routes>
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
          <Route path="/logout" element={<Logout />} />
          <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/admin" element={user?.isAdmin ? <Admin /> : <Navigate to={user ? "/dashboard" : "/login"} />} />
          <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
