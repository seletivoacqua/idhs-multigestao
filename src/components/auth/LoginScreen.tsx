import { useState, useEffect } from 'react';
import { Building2, GraduationCap, LogIn, UserPlus, Key } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { UserModule } from '../../lib/supabase';
import logoImg from '../../assets/image.png';
import { supabase } from '../../lib/supabase';

interface LoginScreenProps {
  isResetPasswordRoute?: boolean;
}

export function LoginScreen({ isResetPasswordRoute = false }: LoginScreenProps) {
  const [selectedModule, setSelectedModule] = useState<UserModule | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(isResetPasswordRoute);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const { signIn, signUp, resetPassword, updatePassword } = useAuth();

 useEffect(() => {
  // Se a rota já for de reset, ativa direto
  if (isResetPasswordRoute) {
    setIsResetPassword(true);
  }

  // Fallback: verifica o hash da URL
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const type = hashParams.get('type');

  if (type === 'recovery') {
    setIsResetPassword(true);
  }

  // 🔥 ESSENCIAL: escuta o Supabase confirmar recuperação de senha
  const { data: listener } = supabase.auth.onAuthStateChange(
    (event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsResetPassword(true);
      }
    }
  );

  return () => {
    listener.subscription.unsubscribe();
  };
}, [isResetPasswordRoute]);

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    if (newPassword.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres');
      return;
    }

    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      await updatePassword(newPassword);
      setSuccessMessage('Senha atualizada com sucesso! Redirecionando...');

      setTimeout(() => {
        window.history.pushState({}, '', '/');
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar senha');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModule) return;

    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      if (isForgotPassword) {
        await resetPassword(email);
        setSuccessMessage('Email de recuperação enviado! Verifique sua caixa de entrada.');
        setEmail('');
      } else if (isSignUp) {
        await signUp(email, password, fullName, selectedModule);
      } else {
        await signIn(email, password, selectedModule);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao processar sua solicitação');
    } finally {
      setLoading(false);
    }
  };

  if (isResetPassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <Key className="w-8 h-8 text-blue-600" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">
              Redefinir Senha
            </h2>
            <p className="text-center text-slate-600 mb-6">
              Digite sua nova senha
            </p>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nova Senha
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Confirmar Nova Senha
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                  {successMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg font-semibold text-white flex items-center justify-center space-x-2 transition-colors bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Key className="w-5 h-5" />
                <span>{loading ? 'Atualizando...' : 'Atualizar Senha'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedModule) {
    return (
      <div className="min-h-screen bg-white from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-12">
            <img src={logoImg} alt="IDHS" className="h-24 mx-auto mb-6" />
            <h1 className="text-4xl font-bold text-slate-600 mb-3">IDHS Multigestão</h1>

          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <button
              onClick={() => setSelectedModule('financeiro')}
              className="bg-gradient-to-br  rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border-2 border-transparent hover:border-blue-500"
            >
              <div className="flex flex-col items-center space-y-4">
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
                  <Building2 className="w-10 h-10 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800">Financeiro</h2>
                <p className="text-slate-600 text-center">
                  Gestão de fluxo de caixa, pagamentos e controle institucional
                </p>
              </div>
            </button>

            <button
              onClick={() => setSelectedModule('academico')}
              className="bg-gradient-to-br rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border-2 border-transparent hover:border-green-500"
            >
              <div className="flex flex-col items-center space-y-4">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                  <GraduationCap className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800">Acadêmico</h2>
                <p className="text-slate-600 text-center">
                  Gestão de alunos, cursos, turmas e certificados
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <button
          onClick={() => {
            setSelectedModule(null);
            setIsSignUp(false);
            setIsForgotPassword(false);
            setError('');
            setSuccessMessage('');
          }}
          className="mb-6 text-slate-600 hover:text-slate-800 flex items-center space-x-2"
        >
          <span>←</span>
          <span>Voltar</span>
        </button>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex justify-center mb-6">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              selectedModule === 'financeiro' ? 'bg-blue-100' : 'bg-green-100'
            }`}>
              {selectedModule === 'financeiro' ? (
                <Building2 className={`w-8 h-8 ${selectedModule === 'financeiro' ? 'text-blue-600' : 'text-green-600'}`} />
              ) : (
                <GraduationCap className="w-8 h-8 text-green-600" />
              )}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">
            {selectedModule === 'financeiro' ? 'Módulo Financeiro' : 'Módulo Acadêmico'}
          </h2>
          <p className="text-center text-slate-600 mb-6">
            {isForgotPassword ? 'Recuperar senha' : isSignUp ? 'Criar nova conta' : 'Entre com suas credenciais'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && !isForgotPassword && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            {!isForgotPassword && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                {successMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-lg font-semibold text-white flex items-center justify-center space-x-2 transition-colors ${
                selectedModule === 'financeiro'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-green-600 hover:bg-green-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isSignUp ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
              <span>
                {loading
                  ? 'Processando...'
                  : isForgotPassword
                    ? 'Enviar Email'
                    : isSignUp
                      ? 'Criar Conta'
                      : 'Entrar'
                }
              </span>
            </button>
          </form>

          <div className="mt-6 text-center space-y-2">
            {!isForgotPassword && (
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError('');
                  setSuccessMessage('');
                }}
                className="block w-full text-slate-600 hover:text-slate-800 text-sm"
              >
                {isSignUp ? 'Já tem uma conta? Entrar' : 'Primeiro acesso? Criar conta'}
              </button>
            )}

            {!isSignUp && (
              <button
                onClick={() => {
                  setIsForgotPassword(!isForgotPassword);
                  setError('');
                  setSuccessMessage('');
                }}
                className="block w-full text-slate-600 hover:text-slate-800 text-sm"
              >
                {isForgotPassword ? 'Voltar para login' : 'Esqueci a senha'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
