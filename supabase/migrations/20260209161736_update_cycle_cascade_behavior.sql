/*
  # Update Cycle Cascade Behavior

  ## Overview
  This migration updates the relationship between cycles and classes to use CASCADE deletion
  instead of SET NULL. This ensures data integrity with the new architecture where classes
  must be managed within cycles.

  ## Changes Made

  ### classes table - cycle_id foreign key
  - Change from `ON DELETE SET NULL` to `ON DELETE CASCADE`
  - When a cycle is deleted, all associated classes are also deleted
  - This prevents orphaned classes without a cycle

  ## Rationale
  With the new UI structure where classes are managed exclusively within cycles (no separate
  "Classes" tab), it makes sense that when a cycle is deleted, its classes should also be
  deleted. This maintains data consistency and prevents orphaned records.

  ## Data Safety
  - This operation only affects the foreign key constraint behavior
  - Existing data is not modified
  - Future deletions will cascade automatically
*/

-- Drop the existing foreign key constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'classes_cycle_id_fkey'
    AND table_name = 'classes'
  ) THEN
    ALTER TABLE classes DROP CONSTRAINT classes_cycle_id_fkey;
  END IF;
END $$;

-- Add the new foreign key constraint with CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'cycle_id'
  ) THEN
    ALTER TABLE classes
      ADD CONSTRAINT classes_cycle_id_fkey
      FOREIGN KEY (cycle_id)
      REFERENCES cycles(id)
      ON DELETE CASCADE;
  END IF;
END $$;