/*
  # Add unit_id foreign key to invoices table

  ## Changes
  1. Add unit_id column to invoices table
    - `unit_id` (uuid, nullable, references units table)
  
  2. Notes
    - Keeps unit_name for backward compatibility
    - unit_id will be used for new records
    - unit_name can be deprecated later after data migration
*/

-- Add unit_id column to invoices table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'unit_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN unit_id uuid REFERENCES units(id) ON DELETE SET NULL;
  END IF;
END $$;