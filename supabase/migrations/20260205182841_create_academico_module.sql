/*
  # Create Academic Module Tables

  ## New Tables
  
  ### users_academico
  - `id` (uuid, primary key, references auth.users)
  - `email` (text, unique, not null)
  - `full_name` (text, not null)
  - `created_at` (timestamptz, default now())
  
  ### units
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users_academico)
  - `name` (text, not null)
  - `municipality` (text, not null)
  - `created_at` (timestamptz, default now())
  
  ### students
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users_academico)
  - `full_name` (text, not null)
  - `cpf` (text, unique, not null)
  - `email` (text, not null)
  - `phone` (text, not null)
  - `unit_id` (uuid, references units)
  - `created_at` (timestamptz, default now())
  
  ### courses
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users_academico)
  - `name` (text, not null)
  - `teacher_name` (text, not null)
  - `workload` (integer, not null)
  - `modality` (text, not null) - EAD, VIDEOCONFERENCIA
  - `created_at` (timestamptz, default now())
  
  ### classes
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users_academico)
  - `course_id` (uuid, references courses)
  - `name` (text, not null)
  - `day_of_week` (text, not null)
  - `class_time` (text, not null)
  - `total_classes` (integer, not null)
  - `modality` (text, not null) - EAD, VIDEOCONFERENCIA
  - `status` (text, default 'active') - active, closed
  - `created_at` (timestamptz, default now())
  
  ### class_students
  - `id` (uuid, primary key)
  - `class_id` (uuid, references classes)
  - `student_id` (uuid, references students)
  - `enrollment_date` (timestamptz, default now())
  
  ### attendance (for videoconferência)
  - `id` (uuid, primary key)
  - `class_id` (uuid, references classes)
  - `student_id` (uuid, references students)
  - `class_number` (integer, not null)
  - `class_date` (date, not null)
  - `present` (boolean, not null)
  - `created_at` (timestamptz, default now())
  
  ### ead_access (for EAD 24h)
  - `id` (uuid, primary key)
  - `class_id` (uuid, references classes)
  - `student_id` (uuid, references students)
  - `access_date_1` (date)
  - `access_date_2` (date)
  - `access_date_3` (date)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
  
  ### class_makeup
  - `id` (uuid, primary key)
  - `class_id` (uuid, references classes)
  - `original_class_number` (integer, not null)
  - `original_date` (date, not null)
  - `makeup_day` (text, not null)
  - `makeup_time` (text, not null)
  - `makeup_date` (date, not null)
  - `created_at` (timestamptz, default now())
  
  ### certificates
  - `id` (uuid, primary key)
  - `class_id` (uuid, references classes)
  - `student_id` (uuid, references students)
  - `issue_date` (date, not null)
  - `attendance_percentage` (numeric, not null)
  - `created_at` (timestamptz, default now())

  ## Security
  - Enable RLS on all tables
  - Add policies for authenticated users to manage their own data
*/

-- Create users_academico table
CREATE TABLE IF NOT EXISTS users_academico (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users_academico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Academic users can view own profile"
  ON users_academico FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Academic users can insert own profile"
  ON users_academico FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Academic users can update own profile"
  ON users_academico FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create units table
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users_academico(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  municipality text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own units"
  ON units FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own units"
  ON units FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own units"
  ON units FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own units"
  ON units FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create students table
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users_academico(id) ON DELETE CASCADE NOT NULL,
  full_name text NOT NULL,
  cpf text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, cpf)
);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own students"
  ON students FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own students"
  ON students FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own students"
  ON students FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own students"
  ON students FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create courses table
CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users_academico(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  teacher_name text NOT NULL,
  workload integer NOT NULL CHECK (workload > 0),
  modality text NOT NULL CHECK (modality IN ('EAD', 'VIDEOCONFERENCIA')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own courses"
  ON courses FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own courses"
  ON courses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own courses"
  ON courses FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own courses"
  ON courses FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create classes table
CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users_academico(id) ON DELETE CASCADE NOT NULL,
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  day_of_week text NOT NULL,
  class_time text NOT NULL,
  total_classes integer NOT NULL CHECK (total_classes > 0),
  modality text NOT NULL CHECK (modality IN ('EAD', 'VIDEOCONFERENCIA')),
  status text DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own classes"
  ON classes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own classes"
  ON classes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own classes"
  ON classes FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own classes"
  ON classes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create class_students table
CREATE TABLE IF NOT EXISTS class_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  enrollment_date timestamptz DEFAULT now(),
  UNIQUE(class_id, student_id)
);

ALTER TABLE class_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view class students"
  ON class_students FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_students.class_id
      AND classes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert class students"
  ON class_students FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_students.class_id
      AND classes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete class students"
  ON class_students FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_students.class_id
      AND classes.user_id = auth.uid()
    )
  );

-- Create attendance table (for videoconferência)
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  class_number integer NOT NULL,
  class_date date NOT NULL,
  present boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(class_id, student_id, class_number)
);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attendance"
  ON attendance FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = attendance.class_id
      AND classes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert attendance"
  ON attendance FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = attendance.class_id
      AND classes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update attendance"
  ON attendance FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = attendance.class_id
      AND classes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = attendance.class_id
      AND classes.user_id = auth.uid()
    )
  );

-- Create ead_access table (for EAD 24h)
CREATE TABLE IF NOT EXISTS ead_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  access_date_1 date,
  access_date_2 date,
  access_date_3 date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(class_id, student_id)
);

ALTER TABLE ead_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ead access"
  ON ead_access FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = ead_access.class_id
      AND classes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert ead access"
  ON ead_access FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = ead_access.class_id
      AND classes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update ead access"
  ON ead_access FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = ead_access.class_id
      AND classes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = ead_access.class_id
      AND classes.user_id = auth.uid()
    )
  );

-- Create class_makeup table
CREATE TABLE IF NOT EXISTS class_makeup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  original_class_number integer NOT NULL,
  original_date date NOT NULL,
  makeup_day text NOT NULL,
  makeup_time text NOT NULL,
  makeup_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE class_makeup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view class makeup"
  ON class_makeup FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_makeup.class_id
      AND classes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert class makeup"
  ON class_makeup FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_makeup.class_id
      AND classes.user_id = auth.uid()
    )
  );

-- Create certificates table
CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  issue_date date NOT NULL,
  attendance_percentage numeric NOT NULL CHECK (attendance_percentage >= 60 AND attendance_percentage <= 100),
  created_at timestamptz DEFAULT now(),
  UNIQUE(class_id, student_id)
);

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view certificates"
  ON certificates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = certificates.class_id
      AND classes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert certificates"
  ON certificates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = certificates.class_id
      AND classes.user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_students_user_cpf ON students(user_id, cpf);
CREATE INDEX IF NOT EXISTS idx_classes_user_status ON classes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_class_students_class ON class_students(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_class_student ON attendance(class_id, student_id);
CREATE INDEX IF NOT EXISTS idx_ead_access_class_student ON ead_access(class_id, student_id);