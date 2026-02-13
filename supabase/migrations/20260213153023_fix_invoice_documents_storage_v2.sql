/*
  # Corrigir Storage de Documentos de Invoices

  ## Resumo
  Atualiza o bucket de storage para documentos de invoices como público,
  garantindo acesso adequado aos arquivos PDF e imagens.

  ## Mudanças
  1. Atualiza o bucket para público
  2. Recria políticas de acesso

  ## Segurança
  - Políticas RLS garantem que apenas o dono pode fazer upload/deletar
  - Bucket público permite visualização via URL pública
*/

-- Atualizar bucket para público
UPDATE storage.buckets
SET public = true
WHERE id = 'invoice-documents';

-- Limpar políticas antigas e recriar
DROP POLICY IF EXISTS "Users can upload their own invoice documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own invoice documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own invoice documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own invoice documents" ON storage.objects;

-- Política para upload
CREATE POLICY "Users can upload their own invoice documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Política para visualização
CREATE POLICY "Users can view their own invoice documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoice-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Política para deleção
CREATE POLICY "Users can delete their own invoice documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'invoice-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Política para atualização
CREATE POLICY "Users can update their own invoice documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'invoice-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
