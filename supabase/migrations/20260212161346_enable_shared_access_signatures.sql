/*
  # Enable Shared Access for Signatures Table

  ## Overview
  This migration extends the shared access model to the signatures table,
  allowing all academic users to view and use signatures from all users.

  ## Security Changes
  
  ### Modified Policies
  
  The signatures table will have its policies updated to allow any authenticated user 
  who exists in the `users_academico` table to:
  - SELECT (view) all signatures
  - INSERT signatures
  - UPDATE all signatures
  - DELETE all signatures
  
  ## Important Notes
  - This allows academic users to share and use signatures collaboratively
  - Signatures can now be used by any academic user in certificates
*/

-- Drop old restrictive policies for signatures
DROP POLICY IF EXISTS "Users can view own signatures" ON signatures;
DROP POLICY IF EXISTS "Users can insert own signatures" ON signatures;
DROP POLICY IF EXISTS "Users can update own signatures" ON signatures;
DROP POLICY IF EXISTS "Users can delete own signatures" ON signatures;

-- Create new shared access policies for signatures
CREATE POLICY "Academic users can view all signatures"
  ON signatures FOR SELECT
  TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert any signatures"
  ON signatures FOR INSERT
  TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all signatures"
  ON signatures FOR UPDATE
  TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all signatures"
  ON signatures FOR DELETE
  TO authenticated
  USING (is_academic_user());