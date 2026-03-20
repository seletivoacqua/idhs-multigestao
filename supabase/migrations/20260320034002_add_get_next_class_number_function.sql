/*
  # Add get_next_class_number RPC function

  1. New Functions
    - `get_next_class_number(p_class_id uuid)`
      - Returns the next class number to be used for a given class
      - Calculates based on the maximum class_number already recorded in attendance table
      - Returns 1 if no attendance records exist yet
  
  2. Purpose
    - Fixes the issue where the front-end was not updating the next class number correctly
    - After manipulating attendance records directly in the database, this ensures consistency
    - Example: If class 6 has attendance recorded, this will correctly return 7 as the next class
*/

CREATE OR REPLACE FUNCTION get_next_class_number(p_class_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_class_number integer;
BEGIN
  -- Get the maximum class_number for the given class_id
  SELECT COALESCE(MAX(class_number), 0)
  INTO v_max_class_number
  FROM attendance
  WHERE class_id = p_class_id;
  
  -- Return the next class number (max + 1)
  RETURN v_max_class_number + 1;
END;
$$;