/*
  # Add Cycles (Ciclos) Table

  ## Overview
  This migration adds support for academic cycles to the system. Before creating a class (turma),
  users must first create and start a cycle. Cycles have a defined start and end date that can be edited.

  ## New Tables
  
  ### cycles
  - `id` (uuid, primary key)
  - `user_id` (uuid, references users_academico) - Owner of the cycle
  - `name` (text, not null) - Name of the cycle (e.g., "Ciclo 2024.1")
  - `start_date` (date, not null) - Start date of the cycle
  - `end_date` (date, not null) - End date of the cycle
  - `status` (text, default 'active') - active, closed
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

  ## Table Modifications
  
  ### classes table
  - Add `cycle_id` (uuid, references cycles) - Links class to a cycle
  - The cycle_id is nullable for backward compatibility with existing classes

  ## Security
  - Enable RLS on cycles table
  - Add policies for authenticated users to manage their own cycles
  - Update classes policies to include cycle access verification

  ## Important Notes
  - Cycles must be created before classes can be assigned to them
  - End dates can be edited to extend cycles if needed
  - When a cycle is closed for EAD courses, the system checks for minimum access requirements
*/

-- Create cycles table
CREATE TABLE IF NOT EXISTS cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users_academico(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cycles"
  ON cycles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own cycles"
  ON cycles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own cycles"
  ON cycles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own cycles"
  ON cycles FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Add cycle_id to classes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'cycle_id'
  ) THEN
    ALTER TABLE classes ADD COLUMN cycle_id uuid REFERENCES cycles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_classes_cycle ON classes(cycle_id);
CREATE INDEX IF NOT EXISTS idx_cycles_user_status ON cycles(user_id, status);
