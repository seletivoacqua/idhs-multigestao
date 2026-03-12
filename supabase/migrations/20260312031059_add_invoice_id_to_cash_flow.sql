/*
  # Adiciona rastreamento de notas fiscais no fluxo de caixa

  1. Mudanças
    - Adiciona coluna `invoice_id` na tabela `cash_flow_transactions`
    - Adiciona foreign key para rastrear qual nota fiscal gerou a transação
    - Adiciona índice para melhorar performance de buscas
    
  2. Objetivo
    - Evitar duplicação de transações para a mesma nota fiscal
    - Permitir verificar se uma nota fiscal já tem transação associada
    - Facilitar auditoria e rastreamento
*/

-- Adiciona coluna invoice_id se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_flow_transactions' AND column_name = 'invoice_id'
  ) THEN
    ALTER TABLE cash_flow_transactions ADD COLUMN invoice_id uuid;
    
    -- Adiciona foreign key
    ALTER TABLE cash_flow_transactions 
    ADD CONSTRAINT cash_flow_transactions_invoice_id_fkey 
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
    
    -- Adiciona índice para melhorar buscas
    CREATE INDEX idx_cash_flow_transactions_invoice_id 
    ON cash_flow_transactions(invoice_id);
  END IF;
END $$;
