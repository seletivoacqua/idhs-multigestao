import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginScreen } from './components/auth/LoginScreen';
import { FinanceiroDashboard } from './components/financeiro/FinanceiroDashboard';
import { AcademicoDashboard } from './components/academico/AcademicoDashboard';
import { useEffect, useState } from 'react';

function AppContent() {
  const { user, module, loading } = useAuth();
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (currentPath === '/reset-password') {
    return <LoginScreen isResetPasswordRoute={true} />;
  }

  if (!user || !module) {
    return <LoginScreen />;
  }

  if (module === 'financeiro') {
    return <FinanceiroDashboard />;
  }

  return <AcademicoDashboard />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
