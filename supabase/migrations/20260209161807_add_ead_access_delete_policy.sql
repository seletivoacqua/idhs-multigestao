/*
  # Add DELETE Policy for EAD Access

  ## Overview
  This migration adds the missing DELETE policy for the ead_access table.

  ## New Policy

  ### ead_access table
  - Add DELETE policy for users to delete EAD access records of their own classes
  - Maintains consistency with other tables that have full CRUD policies

  ## Security
  - Policy verifies ownership through the classes table
  - Users can only delete EAD access data from their own classes
*/

-- Add DELETE policy for ead_access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ead_access'
    AND policyname = 'Users can delete ead access'
  ) THEN
    CREATE POLICY "Users can delete ead access"
      ON ead_access FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM classes
          WHERE classes.id = ead_access.class_id
          AND classes.user_id = auth.uid()
        )
      );
  END IF;
END $$;