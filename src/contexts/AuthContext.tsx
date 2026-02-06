import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, UserModule } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  module: UserModule | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string,
    module: UserModule
  ) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    module: UserModule
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [module, setModule] = useState<UserModule | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      const storedModule = localStorage.getItem(
        'userModule'
      ) as UserModule | null;
      setModule(storedModule);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);

      if (!session) {
        setModule(null);
        localStorage.removeItem('userModule');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // =========================
  // SIGN IN (login correto)
  // =========================
  const signIn = async (
    email: string,
    password: string,
    selectedModule: UserModule
  ) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (!data.user) throw new Error('Usuário não autenticado');

    const tableName =
      selectedModule === 'financeiro'
        ? 'users_financeiro'
        : 'users_academico';

    const { data: profile, error: selectError } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (selectError) throw selectError;

    // 🔹 cria perfil do módulo se não existir
    if (!profile) {
      const fullName = data.user.user_metadata?.full_name || 'Usuário';

      const { error: insertError } = await supabase.from(tableName).insert({
        id: data.user.id,
        email: data.user.email,
        full_name: fullName,
      });

      if (insertError) throw insertError;
    }

    setModule(selectedModule);
    localStorage.setItem('userModule', selectedModule);
  };

  // =========================
  // SIGN UP
  // =========================
  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    selectedModule: UserModule
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) throw error;
    if (!data.user) throw new Error('Falha ao criar usuário');

    const tableName =
      selectedModule === 'financeiro'
        ? 'users_financeiro'
        : 'users_academico';

    const { error: insertError } = await supabase.from(tableName).insert({
      id: data.user.id,
      email: data.user.email,
      full_name: fullName,
    });

    if (insertError) throw insertError;

    setModule(selectedModule);
    localStorage.setItem('userModule', selectedModule);
  };

  // =========================
  // SIGN OUT
  // =========================
  const signOut = async () => {
    await supabase.auth.signOut();
    setModule(null);
    localStorage.removeItem('userModule');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        module,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

