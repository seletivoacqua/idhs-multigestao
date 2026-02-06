/*
  # Create Financial Module Tables

  ## New Tables
  
  ### users_financeiro
  - `id` (uuid, primary key, references auth.users)
  - `email` (text, unique, not null)
  - `full_name` (text, not null)
  - `created_at` (timestamptz, default now())
  
  ### cash_flow_transactions
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users_financeiro)
  - `type` (text, not null) - 'income' or 'expense'
  - `amount` (numeric, not null)
  - `method` (text, not null) - pix, transferencia, dinheiro, boleto
  - `category` (text) - despesas_fixas, despesas_variaveis (null for income)
  - `description` (text)
  - `transaction_date` (date, not null)
  - `created_at` (timestamptz, default now())
  
  ### fixed_expenses
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users_financeiro)
  - `name` (text, not null)
  - `amount` (numeric, not null)
  - `method` (text, not null)
  - `description` (text)
  - `active` (boolean, default true)
  - `created_at` (timestamptz, default now())
  
  ### invoices
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users_financeiro)
  - `item_number` (integer, not null, auto-increment per user)
  - `unit_name` (text, not null)
  - `cnpj_cpf` (text, not null)
  - `exercise_month` (integer, not null)
  - `exercise_year` (integer, not null)
  - `document_type` (text, not null)
  - `invoice_number` (text, not null)
  - `issue_date` (date, not null)
  - `due_date` (date, not null)
  - `net_value` (numeric, not null)
  - `payment_status` (text, not null) - PAGO, EM ABERTO, ATRASADO
  - `payment_date` (date)
  - `paid_value` (numeric)
  - `deletion_reason` (text)
  - `deleted_at` (timestamptz)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
  
  ### meeting_minutes
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users_financeiro)
  - `title` (text, not null)
  - `header_text` (text, not null)
  - `logo_url` (text)
  - `content` (text, not null)
  - `meeting_date` (date, not null)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

  ## Security
  - Enable RLS on all tables
  - Add policies for authenticated users to manage their own data
*/

-- Create users_financeiro table
CREATE TABLE IF NOT EXISTS users_financeiro (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users_financeiro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON users_financeiro FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users_financeiro FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users_financeiro FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create cash_flow_transactions table
CREATE TABLE IF NOT EXISTS cash_flow_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users_financeiro(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  amount numeric NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('pix', 'transferencia', 'dinheiro', 'boleto')),
  category text CHECK (category IN ('despesas_fixas', 'despesas_variaveis', NULL)),
  description text,
  transaction_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cash_flow_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON cash_flow_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own transactions"
  ON cash_flow_transactions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own transactions"
  ON cash_flow_transactions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own transactions"
  ON cash_flow_transactions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create fixed_expenses table
CREATE TABLE IF NOT EXISTS fixed_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users_financeiro(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('boleto', 'pix', 'transferencia')),
  description text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fixed_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fixed expenses"
  ON fixed_expenses FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own fixed expenses"
  ON fixed_expenses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own fixed expenses"
  ON fixed_expenses FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own fixed expenses"
  ON fixed_expenses FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users_financeiro(id) ON DELETE CASCADE NOT NULL,
  item_number integer NOT NULL,
  unit_name text NOT NULL,
  cnpj_cpf text NOT NULL,
  exercise_month integer NOT NULL CHECK (exercise_month BETWEEN 1 AND 12),
  exercise_year integer NOT NULL CHECK (exercise_year >= 2000),
  document_type text NOT NULL,
  invoice_number text NOT NULL,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  net_value numeric NOT NULL CHECK (net_value > 0),
  payment_status text NOT NULL CHECK (payment_status IN ('PAGO', 'EM ABERTO', 'ATRASADO')),
  payment_date date,
  paid_value numeric CHECK (paid_value >= 0),
  deletion_reason text,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Create function to auto-increment item_number per user
CREATE OR REPLACE FUNCTION get_next_item_number(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(item_number), 0) + 1
  INTO next_num
  FROM invoices
  WHERE user_id = p_user_id AND deleted_at IS NULL;
  
  RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- Create meeting_minutes table
CREATE TABLE IF NOT EXISTS meeting_minutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users_financeiro(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  header_text text NOT NULL DEFAULT 'ATA DE SESSÃO ORDINÁRIA MENSAL DA DIRETORIA EXECUTIVA DO INSTITUTO DO DESENVOLVIMENTO HUMANO E SOCIAL – IDHS',
  logo_url text,
  content text NOT NULL,
  meeting_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE meeting_minutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meeting minutes"
  ON meeting_minutes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own meeting minutes"
  ON meeting_minutes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own meeting minutes"
  ON meeting_minutes FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own meeting minutes"
  ON meeting_minutes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_cash_flow_user_date ON cash_flow_transactions(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_invoices_user_status ON invoices(user_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_user_date ON meeting_minutes(user_id, meeting_date);