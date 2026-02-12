/*
  # Fix users_academico INSERT Policy

  ## Overview
  Adds a trigger to automatically set the user ID to auth.uid() when inserting
  into users_academico table, ensuring the RLS policy is satisfied.

  ## Changes
  1. Creates a trigger function to set id = auth.uid() before insert
  2. Creates a trigger on users_academico table
  3. This ensures users can successfully create their profile

  ## Security
  - Maintains security by forcing id to always be auth.uid()
  - Prevents users from creating profiles for other users
*/

-- Create trigger function to set id to auth.uid()
CREATE OR REPLACE FUNCTION set_user_id_from_auth()
RETURNS TRIGGER AS $$
BEGIN
  -- Always set id to the authenticated user's id
  NEW.id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on users_academico
DROP TRIGGER IF EXISTS set_user_id_trigger ON users_academico;

CREATE TRIGGER set_user_id_trigger
  BEFORE INSERT ON users_academico
  FOR EACH ROW
  EXECUTE FUNCTION set_user_id_from_auth();
