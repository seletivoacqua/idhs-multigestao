/*
  # Add get_class_attendance_stats RPC function

  1. New Functions
    - `get_class_attendance_stats(p_class_id)` - Retorna estatísticas unificadas de frequência
      - `unique_classes` (integer) - Total de aulas únicas já realizadas
      - `max_number` (integer) - Maior número de aula registrado
      - `next_number` (integer) - Próximo número de aula a ser usado
  
  2. Purpose
    - Substituir múltiplas chamadas separadas por uma única RPC
    - Garantir consistência de dados entre total de aulas e próximo número
    - Melhorar performance evitando múltiplas queries
  
  3. Security
    - Function executes with SECURITY DEFINER
    - No sensitive data exposed
*/

CREATE OR REPLACE FUNCTION get_class_attendance_stats(p_class_id uuid)
RETURNS TABLE(
  unique_classes integer,
  max_number integer,
  next_number integer
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_unique_count integer;
  v_max_number integer;
BEGIN
  -- Contar aulas únicas realizadas
  SELECT COUNT(DISTINCT class_number)
  INTO v_unique_count
  FROM attendance
  WHERE class_id = p_class_id;

  -- Pegar o maior número de aula
  SELECT COALESCE(MAX(class_number), 0)
  INTO v_max_number
  FROM attendance
  WHERE class_id = p_class_id;

  -- Retornar dados unificados
  RETURN QUERY
  SELECT 
    COALESCE(v_unique_count, 0)::integer,
    COALESCE(v_max_number, 0)::integer,
    COALESCE(v_max_number, 0)::integer + 1;
END;
$$;