/*
  # Add Unique Constraint to Certificates

  1. Changes
    - Add unique constraint to prevent duplicate certificates for the same student in the same class
    - This ensures that each student can only have one certificate per class

  2. Security
    - Maintains existing RLS policies
    - Prevents data duplication errors
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'certificates_class_student_unique'
  ) THEN
    ALTER TABLE certificates 
    ADD CONSTRAINT certificates_class_student_unique 
    UNIQUE (class_id, student_id);
  END IF;
END $$;
