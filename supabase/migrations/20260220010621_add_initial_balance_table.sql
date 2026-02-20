/*
  # Add Initial Balance table for FluxoCaixa

  ## Summary
  Creates a table to store initial balances for each month in the cash flow system.

  ## Changes
  1. New Tables
    - `initial_balances`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `month` (integer) - Month number (1-12)
      - `year` (integer) - Year
      - `balance` (numeric) - Initial balance amount
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
      - Unique constraint on (user_id, month, year)

  ## Security
    - Enable RLS on initial_balances table
    - Add policy for users to manage their own initial balances
*/

-- Create initial_balances table
CREATE TABLE IF NOT EXISTS initial_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  year integer NOT NULL CHECK (year >= 2000),
  balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, month, year)
);

-- Enable RLS
ALTER TABLE initial_balances ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Users can view own initial balances" ON initial_balances;
CREATE POLICY "Users can view own initial balances"
  ON initial_balances
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own initial balances" ON initial_balances;
CREATE POLICY "Users can insert own initial balances"
  ON initial_balances
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own initial balances" ON initial_balances;
CREATE POLICY "Users can update own initial balances"
  ON initial_balances
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own initial balances" ON initial_balances;
CREATE POLICY "Users can delete own initial balances"
  ON initial_balances
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
