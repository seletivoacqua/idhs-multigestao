/*
  # Adicionar status AGENDADO para notas fiscais

  1. Alterações
    - Adiciona coluna `data_prevista` (data prevista de pagamento) na tabela `invoices`
    - O campo `payment_status` já é text, então aceita 'AGENDADO' sem necessidade de alteração
    - Adiciona índice para melhorar performance de consultas por status

  2. Notas
    - A coluna `data_prevista` é opcional e só será preenchida quando status for AGENDADO
    - Mantém compatibilidade com dados existentes
*/

-- Adiciona coluna data_prevista se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'data_prevista'
  ) THEN
    ALTER TABLE invoices ADD COLUMN data_prevista date;
  END IF;
END $$;

-- Adiciona índice para melhorar consultas por status e data prevista
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_invoices_status_data_prevista'
  ) THEN
    CREATE INDEX idx_invoices_status_data_prevista ON invoices(payment_status, data_prevista);
  END IF;
END $$;

-- Adiciona comentário na coluna
COMMENT ON COLUMN invoices.data_prevista IS 'Data prevista de pagamento quando status é AGENDADO';