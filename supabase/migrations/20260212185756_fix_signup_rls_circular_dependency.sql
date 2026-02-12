/*
  # Fix Signup RLS Circular Dependency

  ## Problem
  Users cannot sign up because INSERT policies check if user exists in table
  before allowing insert (chicken and egg problem). This causes INSERT failures
  and triggers rate limiting when users retry.

  ## Solution
  Allow authenticated users to insert their OWN profile (id = auth.uid()) without
  checking if they already exist in the table. After signup, normal policies apply.

  ## Changes
  1. Update users_academico INSERT policy to allow self-registration
  2. Update users_financeiro INSERT policy to allow self-registration
  3. Maintain security by forcing id = auth.uid() in trigger

  ## Security
  - Users can ONLY create their own profile (id = auth.uid())
  - Triggers enforce id = auth.uid() automatically
  - After creation, normal shared access policies apply
*/

-- ============================================================================
-- USERS_ACADEMICO INSERT POLICY
-- ============================================================================

DROP POLICY IF EXISTS "Academic users can insert academic profiles" ON users_academico;

CREATE POLICY "Users can create own academic profile"
  ON users_academico FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- ============================================================================
-- USERS_FINANCEIRO INSERT POLICY
-- ============================================================================

DROP POLICY IF EXISTS "Financial users can insert financial profiles" ON users_financeiro;

CREATE POLICY "Users can create own financial profile"
  ON users_financeiro FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());
