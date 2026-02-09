/*
  # Add Missing RLS Policies

  ## Overview
  This migration adds missing RLS policies for better data management within the academic module.

  ## New Policies Added

  ### attendance table
  - Add DELETE policy for users to delete attendance records of their own classes

  ### certificates table
  - Add UPDATE policy for users to update certificates of their own classes
  - Add DELETE policy for users to delete certificates if needed

  ## Security
  - All policies verify ownership through the classes table
  - Maintains the principle that users can only manage data from their own classes
*/

-- Add DELETE policy for attendance
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'attendance'
    AND policyname = 'Users can delete attendance'
  ) THEN
    CREATE POLICY "Users can delete attendance"
      ON attendance FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM classes
          WHERE classes.id = attendance.class_id
          AND classes.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Add UPDATE policy for certificates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'certificates'
    AND policyname = 'Users can update certificates'
  ) THEN
    CREATE POLICY "Users can update certificates"
      ON certificates FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM classes
          WHERE classes.id = certificates.class_id
          AND classes.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM classes
          WHERE classes.id = certificates.class_id
          AND classes.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Add DELETE policy for certificates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'certificates'
    AND policyname = 'Users can delete certificates'
  ) THEN
    CREATE POLICY "Users can delete certificates"
      ON certificates FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM classes
          WHERE classes.id = certificates.class_id
          AND classes.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Add DELETE policy for class_makeup
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'class_makeup'
    AND policyname = 'Users can delete class makeup'
  ) THEN
    CREATE POLICY "Users can delete class makeup"
      ON class_makeup FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM classes
          WHERE classes.id = class_makeup.class_id
          AND classes.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Add UPDATE policy for class_makeup
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'class_makeup'
    AND policyname = 'Users can update class makeup'
  ) THEN
    CREATE POLICY "Users can update class makeup"
      ON class_makeup FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM classes
          WHERE classes.id = class_makeup.class_id
          AND classes.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM classes
          WHERE classes.id = class_makeup.class_id
          AND classes.user_id = auth.uid()
        )
      );
  END IF;
END $$;