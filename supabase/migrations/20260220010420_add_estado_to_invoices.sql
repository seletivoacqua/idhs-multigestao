/*
  # Add Estado field to invoices table

  ## Summary
  Adds a 'estado' field to the invoices table to store state information (MA or PA).

  ## Changes
  1. Tables Modified
    - `invoices` table
      - Adds `estado` (text) - State identifier, can be 'MA' or 'PA'

  ## Security
  - Maintains existing RLS policies on invoices table
*/

-- Add estado column to invoices table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'estado'
  ) THEN
    ALTER TABLE invoices ADD COLUMN estado TEXT;
  END IF;
END $$;
