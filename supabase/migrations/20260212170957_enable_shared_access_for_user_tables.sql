/*
  # Enable Shared Access for User Tables and Financial Module

  ## Overview
  This migration completes the shared access configuration by updating:
  - users_academico: Allow all academic users to access all academic profiles
  - users_financeiro: Allow all financial users to access all financial profiles
  - All financial module tables: invoices, fixed_expenses, cash_flow_transactions, meeting_minutes

  ## Changes

  ### 1. Helper Functions
  - is_academic_user(): Check if user is in users_academico
  - is_financial_user(): Check if user is in users_financeiro

  ### 2. Auto-set ID Triggers
  - Automatically set id = auth.uid() on INSERT for both user tables

  ### 3. Updated Policies
  - users_academico: All academic users can manage all academic profiles
  - users_financeiro: All financial users can manage all financial profiles
  - invoices: All financial users can manage all invoices
  - fixed_expenses: All financial users can manage all expenses
  - cash_flow_transactions: All financial users can manage all transactions
  - meeting_minutes: All financial users can manage all meeting minutes

  ## Security
  - Academic users ONLY access academic data
  - Financial users ONLY access financial data
  - All operations require authentication
  - Cross-module access is prevented
*/

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION is_academic_user()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users_academico 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_financial_user()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users_financeiro 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- AUTO-SET ID TRIGGERS
-- ============================================================================

-- Function for users_financeiro
CREATE OR REPLACE FUNCTION set_user_id_from_auth_financeiro()
RETURNS TRIGGER AS $$
BEGIN
  NEW.id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for users_financeiro
DROP TRIGGER IF EXISTS set_user_id_trigger_financeiro ON users_financeiro;
CREATE TRIGGER set_user_id_trigger_financeiro
  BEFORE INSERT ON users_financeiro
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id_from_auth_financeiro();

-- ============================================================================
-- USERS_ACADEMICO POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Academic users can view own profile" ON users_academico;
DROP POLICY IF EXISTS "Academic users can insert own profile" ON users_academico;
DROP POLICY IF EXISTS "Academic users can update own profile" ON users_academico;
DROP POLICY IF EXISTS "Academic users can delete own profile" ON users_academico;

CREATE POLICY "Academic users can view all academic profiles"
  ON users_academico FOR SELECT
  TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert academic profiles"
  ON users_academico FOR INSERT
  TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all academic profiles"
  ON users_academico FOR UPDATE
  TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all academic profiles"
  ON users_academico FOR DELETE
  TO authenticated
  USING (is_academic_user());

-- ============================================================================
-- USERS_FINANCEIRO POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own profile" ON users_financeiro;
DROP POLICY IF EXISTS "Users can insert own profile" ON users_financeiro;
DROP POLICY IF EXISTS "Users can update own profile" ON users_financeiro;
DROP POLICY IF EXISTS "Users can delete own profile" ON users_financeiro;

CREATE POLICY "Financial users can view all financial profiles"
  ON users_financeiro FOR SELECT
  TO authenticated
  USING (is_financial_user());

CREATE POLICY "Financial users can insert financial profiles"
  ON users_financeiro FOR INSERT
  TO authenticated
  WITH CHECK (is_financial_user());

CREATE POLICY "Financial users can update all financial profiles"
  ON users_financeiro FOR UPDATE
  TO authenticated
  USING (is_financial_user())
  WITH CHECK (is_financial_user());

CREATE POLICY "Financial users can delete all financial profiles"
  ON users_financeiro FOR DELETE
  TO authenticated
  USING (is_financial_user());

-- ============================================================================
-- INVOICES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can insert own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can update own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can delete own invoices" ON invoices;

CREATE POLICY "Financial users can view all invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (is_financial_user());

CREATE POLICY "Financial users can insert invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (is_financial_user());

CREATE POLICY "Financial users can update all invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (is_financial_user())
  WITH CHECK (is_financial_user());

CREATE POLICY "Financial users can delete all invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (is_financial_user());

-- ============================================================================
-- FIXED_EXPENSES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own fixed expenses" ON fixed_expenses;
DROP POLICY IF EXISTS "Users can insert own fixed expenses" ON fixed_expenses;
DROP POLICY IF EXISTS "Users can update own fixed expenses" ON fixed_expenses;
DROP POLICY IF EXISTS "Users can delete own fixed expenses" ON fixed_expenses;

CREATE POLICY "Financial users can view all fixed expenses"
  ON fixed_expenses FOR SELECT
  TO authenticated
  USING (is_financial_user());

CREATE POLICY "Financial users can insert fixed expenses"
  ON fixed_expenses FOR INSERT
  TO authenticated
  WITH CHECK (is_financial_user());

CREATE POLICY "Financial users can update all fixed expenses"
  ON fixed_expenses FOR UPDATE
  TO authenticated
  USING (is_financial_user())
  WITH CHECK (is_financial_user());

CREATE POLICY "Financial users can delete all fixed expenses"
  ON fixed_expenses FOR DELETE
  TO authenticated
  USING (is_financial_user());

-- ============================================================================
-- CASH_FLOW_TRANSACTIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own transactions" ON cash_flow_transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON cash_flow_transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON cash_flow_transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON cash_flow_transactions;

CREATE POLICY "Financial users can view all transactions"
  ON cash_flow_transactions FOR SELECT
  TO authenticated
  USING (is_financial_user());

CREATE POLICY "Financial users can insert transactions"
  ON cash_flow_transactions FOR INSERT
  TO authenticated
  WITH CHECK (is_financial_user());

CREATE POLICY "Financial users can update all transactions"
  ON cash_flow_transactions FOR UPDATE
  TO authenticated
  USING (is_financial_user())
  WITH CHECK (is_financial_user());

CREATE POLICY "Financial users can delete all transactions"
  ON cash_flow_transactions FOR DELETE
  TO authenticated
  USING (is_financial_user());

-- ============================================================================
-- MEETING_MINUTES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own meeting minutes" ON meeting_minutes;
DROP POLICY IF EXISTS "Users can insert own meeting minutes" ON meeting_minutes;
DROP POLICY IF EXISTS "Users can update own meeting minutes" ON meeting_minutes;
DROP POLICY IF EXISTS "Users can delete own meeting minutes" ON meeting_minutes;

CREATE POLICY "Financial users can view all meeting minutes"
  ON meeting_minutes FOR SELECT
  TO authenticated
  USING (is_financial_user());

CREATE POLICY "Financial users can insert meeting minutes"
  ON meeting_minutes FOR INSERT
  TO authenticated
  WITH CHECK (is_financial_user());

CREATE POLICY "Financial users can update all meeting minutes"
  ON meeting_minutes FOR UPDATE
  TO authenticated
  USING (is_financial_user())
  WITH CHECK (is_financial_user());

CREATE POLICY "Financial users can delete all meeting minutes"
  ON meeting_minutes FOR DELETE
  TO authenticated
  USING (is_financial_user());
