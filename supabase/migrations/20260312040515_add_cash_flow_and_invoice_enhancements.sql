/*
  # Melhorias em Fluxo de Caixa e Controle de Pagamento

  ## Resumo
  Adiciona novos campos e funcionalidades para os módulos de fluxo de caixa e controle de pagamento,
  incluindo campos para fonte pagadora, checkboxes de nota/recibo, subcategorias de despesas fixas,
  e suporte para upload de documentos.

  ## Mudanças

  ### 1. Tabela cash_flow_transactions
  - Adiciona `fonte_pagadora` (text) - identificação da fonte pagadora em entradas
  - Adiciona `com_nota` (boolean) - indica se saída possui nota fiscal
  - Adiciona `so_recibo` (boolean) - indica se saída possui apenas recibo
  - Adiciona `subcategoria` (text) - subcategoria de despesas fixas

  ### 2. Tabela invoices  
  - Adiciona `document_url` (text) - URL do documento no storage
  - Adiciona `document_name` (text) - nome do arquivo
  - Adiciona `document_type` (text) - tipo MIME do documento

  ### 3. Storage
  - Cria bucket `invoice-documents` para armazenar documentos
  - Configura políticas de acesso seguro

  ### 4. Função Automática
  - Cria função para atualizar status de invoices atrasadas automaticamente

  ## Segurança
  - Mantém RLS em todas as tabelas
  - Storage bucket com acesso controlado por usuário autenticado
  - Políticas de leitura/escrita baseadas em auth.uid()
*/

-- ============================================================================
-- ATUALIZAR TABELA cash_flow_transactions
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_flow_transactions' AND column_name = 'fonte_pagadora'
  ) THEN
    ALTER TABLE cash_flow_transactions ADD COLUMN fonte_pagadora TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_flow_transactions' AND column_name = 'com_nota'
  ) THEN
    ALTER TABLE cash_flow_transactions ADD COLUMN com_nota BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_flow_transactions' AND column_name = 'so_recibo'
  ) THEN
    ALTER TABLE cash_flow_transactions ADD COLUMN so_recibo BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_flow_transactions' AND column_name = 'subcategoria'
  ) THEN
    ALTER TABLE cash_flow_transactions ADD COLUMN subcategoria TEXT;
  END IF;
END $$;

-- ============================================================================
-- ATUALIZAR TABELA invoices
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'document_url'
  ) THEN
    ALTER TABLE invoices ADD COLUMN document_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'document_name'
  ) THEN
    ALTER TABLE invoices ADD COLUMN document_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'document_type'
  ) THEN
    ALTER TABLE invoices ADD COLUMN document_type TEXT;
  END IF;
END $$;

-- ============================================================================
-- CRIAR STORAGE BUCKET PARA DOCUMENTOS
-- ============================================================================

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('invoice-documents', 'invoice-documents', false)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ============================================================================
-- POLÍTICAS DE STORAGE
-- ============================================================================

DROP POLICY IF EXISTS "Users can upload their own invoice documents" ON storage.objects;
CREATE POLICY "Users can upload their own invoice documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can view their own invoice documents" ON storage.objects;
CREATE POLICY "Users can view their own invoice documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoice-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete their own invoice documents" ON storage.objects;
CREATE POLICY "Users can delete their own invoice documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'invoice-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- FUNÇÃO PARA ATUALIZAR STATUS DE INVOICES ATRASADAS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_overdue_invoices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE invoices
  SET 
    payment_status = 'ATRASADO',
    updated_at = now()
  WHERE 
    payment_status = 'EM ABERTO'
    AND due_date < CURRENT_DATE - INTERVAL '1 day'
    AND deleted_at IS NULL;
END;
$$;
