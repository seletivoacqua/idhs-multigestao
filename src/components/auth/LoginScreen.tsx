import { useState, useEffect } from 'react';
import {
  Building2, GraduationCap, LogIn, UserPlus, Key,
  ArrowLeft, Mail, Lock, User, AlertCircle, CheckCircle2, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { UserModule } from '../../lib/supabase';
import logoImg from '../../assets/Gemini_Generated_Image_dimyf6dimyf6dimy.png';
import { supabase } from '../../lib/supabase';

interface LoginScreenProps {
  isResetPasswordRoute?: boolean;
}

// ─── Fundo decorativo compartilhado (escuro, para a logo branca ganhar contraste) ──
function AuthBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      {/* Glow decorativo */}
      <div className="pointer-events-none absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-violet-600/20 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl" />

      {/* Textura sutil de pontos */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Faixa de destaque no topo */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500" />

      <div className="relative z-10 w-full flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

function FieldSuccess({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
      <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
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

  // ─── TELA DE REDEFINIÇÃO DE SENHA ──────────────────────────────────────────
  if (isResetPassword) {
    return (
      <AuthBackdrop>
        <div className="max-w-md w-full">
          <div className="flex justify-center mb-6">
            <img src={logoImg} alt="IDHS" className="h-14 drop-shadow-[0_0_20px_rgba(129,140,248,0.35)]" />
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-8 border border-white/10">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center ring-4 ring-indigo-50">
                <Key className="w-8 h-8 text-indigo-600" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">
              Redefinir Senha
            </h2>
            <p className="text-center text-slate-500 mb-6 text-sm">
              Digite sua nova senha para continuar
            </p>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nova Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Confirmar Nova Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow"
                  />
                </div>
              </div>

              {error && <FieldError message={error} />}
              {successMessage && <FieldSuccess message={successMessage} />}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Key className="w-5 h-5" />}
                <span>{loading ? 'Atualizando...' : 'Atualizar Senha'}</span>
              </button>
            </form>
          </div>
        </div>
      </AuthBackdrop>
    );
  }

  // ─── TELA DE SELEÇÃO DE MÓDULO ──────────────────────────────────────────────
  if (!selectedModule) {
    return (
      <AuthBackdrop>
        <div className="max-w-4xl w-full">
          <div className="text-center mb-12">
            <img
              src={logoImg}
              alt="IDHS"
              className="h-28 mx-auto mb-6 drop-shadow-[0_0_35px_rgba(129,140,248,0.35)]"
            />
            <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">IDHS Multigestão</h1>
            <p className="text-slate-400 text-sm">Selecione o módulo que deseja acessar</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <button
              onClick={() => setSelectedModule('financeiro')}
              className="group relative overflow-hidden bg-white rounded-2xl p-8 shadow-2xl hover:shadow-blue-500/20 transition-all duration-300 hover:-translate-y-1 border border-white/10"
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-blue-500" />
              <div className="flex flex-col items-center space-y-4">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center ring-4 ring-blue-50/60 group-hover:ring-blue-100 transition-all">
                  <Building2 className="w-10 h-10 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800">Financeiro</h2>
                <p className="text-slate-500 text-center text-sm">
                  Gestão de fluxo de caixa, pagamentos e controle institucional
                </p>
              </div>
            </button>

            <button
              onClick={() => setSelectedModule('academico')}
              className="group relative overflow-hidden bg-white rounded-2xl p-8 shadow-2xl hover:shadow-emerald-500/20 transition-all duration-300 hover:-translate-y-1 border border-white/10"
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500" />
              <div className="flex flex-col items-center space-y-4">
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center ring-4 ring-emerald-50/60 group-hover:ring-emerald-100 transition-all">
                  <GraduationCap className="w-10 h-10 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800">Acadêmico</h2>
                <p className="text-slate-500 text-center text-sm">
                  Gestão de alunos, cursos, turmas e certificados
                </p>
              </div>
            </button>
          </div>
        </div>
      </AuthBackdrop>
    );
  }

  // ─── TELA DE LOGIN / CADASTRO / ESQUECI A SENHA ─────────────────────────────
  const moduleColor = selectedModule === 'financeiro'
    ? { ring: 'ring-blue-50', bg: 'bg-blue-50', text: 'text-blue-600', focus: 'focus:ring-blue-500', button: 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' }
    : { ring: 'ring-emerald-50', bg: 'bg-emerald-50', text: 'text-emerald-600', focus: 'focus:ring-emerald-500', button: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' };

  return (
    <AuthBackdrop>
      <div className="max-w-md w-full">
        <div className="flex justify-center mb-6">
          <img src={logoImg} alt="IDHS" className="h-12 drop-shadow-[0_0_20px_rgba(129,140,248,0.35)]" />
        </div>

        <button
          onClick={() => {
            setSelectedModule(null);
            setIsSignUp(false);
            setIsForgotPassword(false);
            setError('');
            setSuccessMessage('');
          }}
          className="mb-4 text-slate-400 hover:text-white flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>

        <div className="bg-white rounded-2xl shadow-2xl p-8 border border-white/10">
          <div className="flex justify-center mb-6">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ring-4 ${moduleColor.bg} ${moduleColor.ring}`}>
              {selectedModule === 'financeiro' ? (
                <Building2 className={`w-8 h-8 ${moduleColor.text}`} />
              ) : (
                <GraduationCap className={`w-8 h-8 ${moduleColor.text}`} />
              )}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">
            {selectedModule === 'financeiro' ? 'Módulo Financeiro' : 'Módulo Acadêmico'}
          </h2>
          <p className="text-center text-slate-500 mb-6 text-sm">
            {isForgotPassword ? 'Recuperar senha' : isSignUp ? 'Criar nova conta' : 'Entre com suas credenciais'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && !isForgotPassword && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nome Completo
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 ${moduleColor.focus} focus:border-transparent outline-none transition-shadow`}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 ${moduleColor.focus} focus:border-transparent outline-none transition-shadow`}
                />
              </div>
            </div>

            {!isForgotPassword && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 ${moduleColor.focus} focus:border-transparent outline-none transition-shadow`}
                  />
                </div>
              </div>
            )}

            {error && <FieldError message={error} />}
            {successMessage && <FieldSuccess message={successMessage} />}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all shadow-sm ${moduleColor.button} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : isSignUp ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
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
                className="block w-full text-slate-500 hover:text-slate-800 text-sm transition-colors"
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
                className="block w-full text-slate-500 hover:text-slate-800 text-sm transition-colors"
              >
                {isForgotPassword ? 'Voltar para login' : 'Esqueci a senha'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-slate-500 text-xs">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Ambiente seguro • IDHS Multigestão</span>
        </div>
      </div>
    </AuthBackdrop>
  );
}
