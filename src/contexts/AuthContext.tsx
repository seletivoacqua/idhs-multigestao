import { supabase, UserModule } from '../lib/supabase';  // ✅ import único
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { User } from '@supabase/supabase-js';

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

// =====================================
// Helper: aguarda sessão e confirma usuário
// =====================================
const waitForUserAndSession = async () => {
  // Aguarda sessão
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) return session;

  return new Promise((resolve) => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        subscription.unsubscribe();
        resolve(session);
      }
    });
  });
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [module, setModule] = useState<UserModule | null>(null);
  const [loading, setLoading] = useState(true);

  // =====================================
  // Bootstrap da sessão
  // =====================================
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

  // =====================================
  // SIGN IN - CORRIGIDO
  // =====================================
  const signIn = async (
    email: string,
    password: string,
    selectedModule: UserModule
  ) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error('Usuário não autenticado');

      // Aguarda sessão estar completamente estabelecida
      await waitForUserAndSession();

      const tableName =
        selectedModule === 'financeiro'
          ? 'users_financeiro'
          : 'users_academico';

      // Tenta buscar o perfil com retry
      let profile = null;
      let retries = 3;
      
      while (retries > 0 && !profile) {
        const { data: profileData, error: selectError } = await supabase
          .from(tableName)
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle();

        if (selectError && selectError.code !== 'PGRST116') {
          // Se for erro diferente de "nenhum resultado encontrado"
          throw selectError;
        }

        profile = profileData;
        
        if (!profile) {
          // Aguarda 1 segundo antes de tentar novamente
          await new Promise(resolve => setTimeout(resolve, 1000));
          retries--;
        }
      }

      // Se não encontrou perfil após retries, tenta criar
      if (!profile) {
        const fullName =
          data.user.user_metadata?.full_name || email.split('@')[0];

        const { error: insertError } = await supabase
          .from(tableName)
          .insert({
            id: data.user.id,
            email: data.user.email,
            full_name: fullName,
          });

        if (insertError) {
          console.error('Erro ao criar perfil:', insertError);
          throw insertError;
        }
      }

      setModule(selectedModule);
      localStorage.setItem('userModule', selectedModule);
    } catch (error) {
      console.error('Erro no signIn:', error);
      throw error;
    }
  };

  // =====================================
  // SIGN UP - CORRIGIDO
  // =====================================
  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    selectedModule: UserModule
  ) => {
    try {
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

      // Aguarda confirmação do usuário (importante para email confirmation)
      await waitForUserAndSession();

      const tableName =
        selectedModule === 'financeiro'
          ? 'users_financeiro'
          : 'users_academico';

      // Aguarda um pouco antes de tentar inserir
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Tenta inserir com retry
      let insertSuccess = false;
      let retries = 3;
      
      while (retries > 0 && !insertSuccess) {
        const { error: insertError } = await supabase
          .from(tableName)
          .insert({
            id: data.user.id,
            email: data.user.email,
            full_name: fullName,
          });

        if (!insertError) {
          insertSuccess = true;
          break;
        }

        if (insertError.code === '23505') {
          // Duplicate key - já existe, pode considerar sucesso
          insertSuccess = true;
          break;
        }

        console.log(`Tentativa ${4-retries} falhou, retentando...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        retries--;
      }

      if (!insertSuccess) {
        throw new Error('Falha ao criar perfil do usuário após múltiplas tentativas');
      }

      setModule(selectedModule);
      localStorage.setItem('userModule', selectedModule);
    } catch (error) {
      console.error('Erro no signUp:', error);
      throw error;
    }
  };

  // =====================================
  // SIGN OUT
  // =====================================
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
    throw new Error(
      'useAuth must be used within an AuthProvider'
    );
  }
  return context;
}
