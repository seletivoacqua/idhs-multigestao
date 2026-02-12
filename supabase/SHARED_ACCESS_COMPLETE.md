# Acesso Compartilhado - Sistema Acadêmico e Financeiro

## Visão Geral

Este documento descreve as alterações implementadas no sistema de permissões (RLS) do banco de dados Supabase para permitir acesso compartilhado entre usuários do mesmo módulo.

## Modelo de Permissões

### Módulo Acadêmico
Todos os usuários cadastrados em `users_academico` têm permissão completa (SELECT, INSERT, UPDATE, DELETE) sobre TODOS os dados do módulo acadêmico.

### Módulo Financeiro
Todos os usuários cadastrados em `users_financeiro` têm permissão completa (SELECT, INSERT, UPDATE, DELETE) sobre TODOS os dados do módulo financeiro.

### Isolamento entre Módulos
- Usuários acadêmicos NÃO podem acessar dados financeiros
- Usuários financeiros NÃO podem acessar dados acadêmicos
- O acesso é controlado por funções helper que verificam a presença do usuário na tabela correspondente

## Alterações Implementadas

### 1. Funções Helper

#### `is_academic_user()`
Verifica se o usuário autenticado está cadastrado em `users_academico`.

```sql
CREATE OR REPLACE FUNCTION is_academic_user()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users_academico
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### `is_financial_user()`
Verifica se o usuário autenticado está cadastrado em `users_financeiro`.

```sql
CREATE OR REPLACE FUNCTION is_financial_user()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users_financeiro
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2. Triggers para Auto-configuração de IDs

Ambas as tabelas de usuários (`users_academico` e `users_financeiro`) agora possuem triggers que automaticamente definem o campo `id` como `auth.uid()` durante operações de INSERT, garantindo que:

1. O ID do perfil sempre corresponde ao ID do usuário autenticado
2. Usuários não podem criar perfis para outros usuários
3. As políticas RLS são sempre satisfeitas automaticamente

```sql
CREATE OR REPLACE FUNCTION set_user_id_from_auth()
RETURNS TRIGGER AS $$
BEGIN
  NEW.id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3. Políticas RLS Atualizadas

Todas as tabelas do sistema agora usam políticas baseadas nas funções helper, permitindo acesso compartilhado dentro de cada módulo.

#### Tabelas do Módulo Acadêmico

**Tabelas com Acesso Compartilhado:**
- `users_academico`
- `courses`
- `classes`
- `students`
- `units`
- `attendance`
- `certificates`
- `class_makeup`
- `class_students`
- `course_modules`
- `cycles`
- `ead_access`

**Exemplo de Políticas (aplicado a todas as tabelas acima):**
```sql
-- SELECT
CREATE POLICY "Academic users can view all [table]"
  ON [table] FOR SELECT
  TO authenticated
  USING (is_academic_user());

-- INSERT
CREATE POLICY "Academic users can insert [table]"
  ON [table] FOR INSERT
  TO authenticated
  WITH CHECK (is_academic_user());

-- UPDATE
CREATE POLICY "Academic users can update all [table]"
  ON [table] FOR UPDATE
  TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

-- DELETE
CREATE POLICY "Academic users can delete all [table]"
  ON [table] FOR DELETE
  TO authenticated
  USING (is_academic_user());
```

#### Tabelas do Módulo Financeiro

**Tabelas com Acesso Compartilhado:**
- `users_financeiro`
- `invoices`
- `fixed_expenses`
- `cash_flow_transactions`
- `meeting_minutes`

**Exemplo de Políticas (aplicado a todas as tabelas acima):**
```sql
-- SELECT
CREATE POLICY "Financial users can view all [table]"
  ON [table] FOR SELECT
  TO authenticated
  USING (is_financial_user());

-- INSERT
CREATE POLICY "Financial users can insert [table]"
  ON [table] FOR INSERT
  TO authenticated
  WITH CHECK (is_financial_user());

-- UPDATE
CREATE POLICY "Financial users can update all [table]"
  ON [table] FOR UPDATE
  TO authenticated
  USING (is_financial_user())
  WITH CHECK (is_financial_user());

-- DELETE
CREATE POLICY "Financial users can delete all [table]"
  ON [table] FOR DELETE
  TO authenticated
  USING (is_financial_user());
```

## Migrations Aplicadas

### 1. `fix_users_academico_insert_policy`
- Criou o trigger para auto-configuração do ID em `users_academico`
- Corrigiu o erro 403 (Forbidden) durante o cadastro de usuários acadêmicos

### 2. `enable_shared_access_for_user_tables`
- Criou as funções helper `is_academic_user()` e `is_financial_user()`
- Atualizou todas as políticas RLS para permitir acesso compartilhado
- Criou o trigger para auto-configuração do ID em `users_financeiro`
- Substituiu políticas baseadas em "own" (próprio usuário) por políticas baseadas em "all" (todos do módulo)

## Comportamento Atual

### Para Usuários Acadêmicos:
1. Ao fazer login, o sistema verifica se o usuário existe em `users_academico`
2. Se existir, o usuário tem acesso completo a TODOS os dados do módulo acadêmico
3. O usuário pode:
   - Visualizar todos os cursos, turmas, alunos, unidades, etc.
   - Criar novos registros em qualquer tabela acadêmica
   - Editar qualquer registro acadêmico
   - Deletar qualquer registro acadêmico
4. O usuário NÃO pode acessar dados do módulo financeiro

### Para Usuários Financeiros:
1. Ao fazer login, o sistema verifica se o usuário existe em `users_financeiro`
2. Se existir, o usuário tem acesso completo a TODOS os dados do módulo financeiro
3. O usuário pode:
   - Visualizar todas as faturas, despesas, transações, atas, etc.
   - Criar novos registros em qualquer tabela financeira
   - Editar qualquer registro financeiro
   - Deletar qualquer registro financeiro
4. O usuário NÃO pode acessar dados do módulo acadêmico

## Segurança

### Princípios de Segurança Implementados:

1. **Autenticação Obrigatória**: Todas as políticas exigem que o usuário esteja autenticado (`TO authenticated`)

2. **Isolamento de Módulos**: As funções helper garantem que usuários de um módulo não podem acessar dados de outro módulo

3. **Prevenção de Escalação de Privilégios**: Os triggers garantem que usuários não podem se passar por outros usuários ao criar perfis

4. **Verificação Dupla**: Políticas de UPDATE usam tanto `USING` quanto `WITH CHECK` para garantir que apenas usuários autorizados podem modificar dados

5. **SECURITY DEFINER**: Todas as funções helper usam `SECURITY DEFINER` para garantir execução consistente

## Troubleshooting

### Erro 403 (Forbidden) ao Criar Usuário
**Solução**: Este erro foi corrigido pelos triggers. Certifique-se de que os triggers `set_user_id_trigger` e `set_user_id_trigger_financeiro` estão ativos.

### Usuário não Consegue Ver Dados de Outros Usuários
**Solução**: Verifique se o usuário está cadastrado na tabela correta:
- Para acesso acadêmico: deve existir em `users_academico`
- Para acesso financeiro: deve existir em `users_financeiro`

### Cross-Module Access Denied
**Comportamento Esperado**: Este é o comportamento correto. Usuários não devem ter acesso a módulos diferentes do seu.

## Próximos Passos

Caso seja necessário implementar permissões mais granulares no futuro:

1. **Roles/Grupos**: Criar tabela de roles dentro de cada módulo (admin, editor, viewer)
2. **Permissões por Campo**: Restringir acesso a campos específicos
3. **Auditoria**: Implementar logging de todas as operações
4. **Histórico de Alterações**: Criar triggers para rastrear mudanças

## Referências

- Migrations: `/supabase/migrations/`
  - `20260212XXXXXX_fix_users_academico_insert_policy.sql`
  - `20260212XXXXXX_enable_shared_access_for_user_tables.sql`
- Documentação Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
- Documentação PostgreSQL Policies: https://www.postgresql.org/docs/current/sql-createpolicy.html
