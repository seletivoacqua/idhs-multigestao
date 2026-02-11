/*
  # Add Enrollment Types to Class Students

  ## Overview
  This migration adds support for two types of student enrollment:
  - Regular enrollment: Students are enrolled from the beginning and all classes count towards attendance
  - Exceptional enrollment: Students enrolled after classes have started, attendance is calculated only from enrollment date

  ## Table Modifications
  
  ### class_students table
  - Add `enrollment_type` (text, default 'regular') - Type of enrollment: 'regular' or 'exceptional'
  - Add `enrollment_date` (date, not null, default CURRENT_DATE) - Date when student was enrolled
  
  ## Security
  - No changes to existing RLS policies
  
  ## Important Notes
  - Regular enrollment: Attendance percentage is calculated based on all classes in the cycle
  - Exceptional enrollment: Attendance percentage is calculated based only on classes from enrollment date forward
  - For example: If a cycle has 16 classes and a student enrolls exceptionally after class 3,
    their attendance will be calculated based on the remaining 13 classes only
*/

-- Add enrollment_type and enrollment_date columns to class_students table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'class_students' AND column_name = 'enrollment_type'
  ) THEN
    ALTER TABLE class_students ADD COLUMN enrollment_type text DEFAULT 'regular' CHECK (enrollment_type IN ('regular', 'exceptional'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'class_students' AND column_name = 'enrollment_date'
  ) THEN
    ALTER TABLE class_students ADD COLUMN enrollment_date date DEFAULT CURRENT_DATE NOT NULL;
  END IF;
END $$;

-- Create index for better performance when filtering by enrollment type
CREATE INDEX IF NOT EXISTS idx_class_students_enrollment ON class_students(class_id, enrollment_type);
