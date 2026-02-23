/*
  # Add status tracking columns to class_students table
  
  1. New Columns
    - `current_status` (text) - Tracks the student's current status in the class
      - Possible values: 'matriculado', 'em_andamento', 'aprovado', 'reprovado'
      - Default: 'matriculado' (student just enrolled)
    - `status_updated_at` (timestamptz) - Timestamp of last status change
  
  2. Changes
    - Students will start with 'matriculado' status when enrolled
    - Status can be updated to 'em_andamento' when cycle is active
    - Status changes to 'aprovado' or 'reprovado' when cycle is closed
  
  3. Security
    - No RLS changes needed as class_students already has policies
*/

-- Add current_status column
ALTER TABLE class_students 
ADD COLUMN IF NOT EXISTS current_status text 
DEFAULT 'matriculado'
CHECK (current_status = ANY (ARRAY['matriculado'::text, 'em_andamento'::text, 'aprovado'::text, 'reprovado'::text]));

-- Add status_updated_at column
ALTER TABLE class_students 
ADD COLUMN IF NOT EXISTS status_updated_at timestamp with time zone;

-- Update existing records to have 'matriculado' status if they don't have one
UPDATE class_students 
SET current_status = 'matriculado' 
WHERE current_status IS NULL;
