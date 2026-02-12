import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
if (typeof window !== 'undefined') {
  (window as any).supabase = supabase;
  console.log('Supabase anexado ao window');
}
export type UserModule = 'financeiro' | 'academico';
