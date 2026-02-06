/*
  # Add Course Modules

  1. New Tables
    - `course_modules`
      - `id` (uuid, primary key) - Unique identifier for the module
      - `course_id` (uuid, foreign key) - Reference to the course
      - `name` (text) - Name of the module
      - `order_number` (integer) - Order of the module within the course
      - `created_at` (timestamptz) - When the module was created

  2. Security
    - Enable RLS on `course_modules` table
    - Add policy for authenticated users to read their own course modules
    - Add policy for authenticated users to insert their own course modules
    - Add policy for authenticated users to update their own course modules
    - Add policy for authenticated users to delete their own course modules

  3. Important Notes
    - Modules are ordered by `order_number` to maintain sequence
    - Each module belongs to a single course
    - When a course is deleted, all its modules should be deleted (cascade)
*/

CREATE TABLE IF NOT EXISTS course_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name text NOT NULL,
  order_number integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE course_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own course modules"
  ON course_modules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_modules.course_id
      AND courses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own course modules"
  ON course_modules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_modules.course_id
      AND courses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own course modules"
  ON course_modules
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_modules.course_id
      AND courses.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_modules.course_id
      AND courses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own course modules"
  ON course_modules
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_modules.course_id
      AND courses.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_course_modules_course_id ON course_modules(course_id);
CREATE INDEX IF NOT EXISTS idx_course_modules_order ON course_modules(course_id, order_number);
