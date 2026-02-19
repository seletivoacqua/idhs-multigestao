/*
  # Adicionar campo fornecedor e status de pagamento

  ## Resumo
  Adiciona campo fornecedor em transações de despesa e campo de controle de pagamento 
  realizado para despesas fixas, além de adicionar novas formas de pagamento.

  ## Mudanças

  ### 1. Tabela cash_flow_transactions
  - Adiciona `fornecedor` (text) - identificação do fornecedor em despesas (opcional)

  ### 2. Tabela fixed_expenses
  - Adiciona `pagamento_realizado` (boolean) - indica se o pagamento foi realizado no mês

  ## Segurança
  - Mantém RLS em todas as tabelas existentes
  - Novos campos seguem as mesmas políticas de acesso
*/

-- ============================================================================
-- ATUALIZAR TABELA cash_flow_transactions
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_flow_transactions' AND column_name = 'fornecedor'
  ) THEN
    ALTER TABLE cash_flow_transactions ADD COLUMN fornecedor TEXT;
  END IF;
END $$;

-- ============================================================================
-- ATUALIZAR TABELA fixed_expenses
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_expenses' AND column_name = 'pagamento_realizado'
  ) THEN
    ALTER TABLE fixed_expenses ADD COLUMN pagamento_realizado BOOLEAN DEFAULT false;
  END IF;
END $$;