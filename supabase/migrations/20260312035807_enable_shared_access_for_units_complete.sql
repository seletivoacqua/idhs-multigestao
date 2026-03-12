/*
  # Enable Shared Access for Units Table

  ## Overview
  This migration enables shared access to the units table for all users.
  This allows any user to view and select all units when creating invoices,
  enrolling students, etc.

  ## Changes

  ### 1. Helper Functions
  - is_academic_user(): Check if user exists in users_academico
  - is_financial_user(): Check if user exists in users_financeiro

  ### 2. Updated RLS Policies for Units
  - Remove individual user-based policies
  - Add policies that allow all authenticated users to access all units
  - Both academic and financial users can view all units
  - Only the original creator can update/delete their units

  ## Security
  - All authenticated users can view all units
  - Cross-module collaboration is enabled
  - All operations require authentication
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
-- UNITS TABLE - SHARED ACCESS POLICIES
-- ============================================================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view own units" ON units;
DROP POLICY IF EXISTS "Users can insert own units" ON units;
DROP POLICY IF EXISTS "Users can update own units" ON units;
DROP POLICY IF EXISTS "Users can delete own units" ON units;

-- Create new shared access policies
CREATE POLICY "All authenticated users can view all units"
  ON units FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Academic users can insert units"
  ON units FOR INSERT
  TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Users can update own units"
  ON units FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own units"
  ON units FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
