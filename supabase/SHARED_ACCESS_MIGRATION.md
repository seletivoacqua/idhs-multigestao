# Migrations de Acesso Compartilhado - Módulo Acadêmico

## Visão Geral

Este documento descreve as migrations aplicadas para permitir que todos os usuários acadêmicos tenham acesso compartilhado para visualizar, editar e deletar informações de todos os outros usuários dentro do módulo acadêmico.

## Migrations Aplicadas

### 1. `20260212160622_enable_shared_access_academic_users.sql`
**Descrição:** Migration principal que cria a função helper e atualiza políticas RLS

**Alterações:**
- Criação da função `is_academic_user()` - verifica se o usuário autenticado existe na tabela `users_academico`
- Remoção das políticas restritivas antigas (cada usuário via apenas seus dados)
- Criação de novas políticas permitindo acesso compartilhado

**Tabelas atualizadas:**
- `units` - Unidades
- `students` - Alunos
- `courses` - Cursos
- `classes` - Turmas
- `class_students` - Alunos por turma
- `attendance` - Frequência
- `ead_access` - Acesso EAD
- `class_makeup` - Reposições de aula
- `certificates` - Certificados

**Políticas criadas para cada tabela:**
- `Academic users can view all [table]` - SELECT
- `Academic users can insert any [table]` - INSERT
- `Academic users can update all [table]` - UPDATE
- `Academic users can delete all [table]` - DELETE

### 2. `20260212160643_enable_shared_access_cycles.sql`
**Descrição:** Estende o acesso compartilhado para a tabela de ciclos

**Alterações:**
- Remove políticas antigas da tabela `cycles`
- Cria novas políticas de acesso compartilhado para ciclos

### 3. `20260212160659_enable_shared_access_course_modules.sql`
**Descrição:** Estende o acesso compartilhado para módulos de cursos

**Alterações:**
- Remove políticas antigas da tabela `course_modules`
- Cria novas políticas de acesso compartilhado para módulos

### 4. `20260212161346_enable_shared_access_signatures.sql`
**Descrição:** Permite acesso compartilhado às assinaturas

**Alterações:**
- Remove políticas antigas da tabela `signatures`
- Cria novas políticas permitindo que qualquer usuário acadêmico use assinaturas de outros usuários

### 5. `20260212161357_enable_shared_access_signatures_storage.sql`
**Descrição:** Atualiza políticas de storage para assinaturas

**Alterações:**
- Remove políticas antigas do bucket `signatures` em `storage.objects`
- Cria novas políticas permitindo upload, visualização, atualização e deleção de arquivos por qualquer usuário acadêmico

## Função Helper

### `is_academic_user()`
```sql
CREATE FUNCTION is_academic_user()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users_academico
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

**Propósito:** Verifica se o usuário autenticado existe na tabela `users_academico`

**Uso:** Todas as políticas RLS utilizam esta função para garantir que apenas usuários acadêmicos tenham acesso aos dados

## Modelo de Segurança

### Antes das Migrations
- Cada usuário acadêmico via apenas seus próprios dados
- Políticas verificavam `auth.uid() = user_id`
- Isolamento completo entre usuários

### Depois das Migrations
- Todos os usuários acadêmicos veem dados de todos os outros usuários
- Políticas verificam apenas se o usuário é acadêmico via `is_academic_user()`
- Colaboração total entre usuários acadêmicos
- Usuários não-acadêmicos não têm acesso (segurança mantida)

## Tabelas com Acesso Compartilhado

| Tabela | Descrição | Operações Permitidas |
|--------|-----------|---------------------|
| `units` | Unidades educacionais | SELECT, INSERT, UPDATE, DELETE |
| `students` | Cadastro de alunos | SELECT, INSERT, UPDATE, DELETE |
| `courses` | Cursos disponíveis | SELECT, INSERT, UPDATE, DELETE |
| `classes` | Turmas/classes | SELECT, INSERT, UPDATE, DELETE |
| `class_students` | Matrículas | SELECT, INSERT, UPDATE, DELETE |
| `attendance` | Frequência | SELECT, INSERT, UPDATE, DELETE |
| `ead_access` | Acesso EAD | SELECT, INSERT, UPDATE, DELETE |
| `class_makeup` | Reposições | SELECT, INSERT, UPDATE, DELETE |
| `certificates` | Certificados | SELECT, INSERT, UPDATE, DELETE |
| `cycles` | Ciclos acadêmicos | SELECT, INSERT, UPDATE, DELETE |
| `course_modules` | Módulos de curso | SELECT, INSERT, UPDATE, DELETE |
| `signatures` | Assinaturas digitais | SELECT, INSERT, UPDATE, DELETE |
| `storage.objects` (bucket: signatures) | Arquivos de assinatura | SELECT, INSERT, UPDATE, DELETE |

## Exemplo de Política RLS

```sql
-- Exemplo para a tabela students
CREATE POLICY "Academic users can view all students"
  ON students FOR SELECT
  TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert any students"
  ON students FOR INSERT
  TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all students"
  ON students FOR UPDATE
  TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all students"
  ON students FOR DELETE
  TO authenticated
  USING (is_academic_user());
```

## Como Aplicar em Outro Ambiente

Se você precisar aplicar essas migrations em outro ambiente Supabase:

1. Execute as migrations na ordem listada acima
2. Certifique-se de que a função `is_academic_user()` foi criada primeiro
3. Verifique se a tabela `users_academico` existe e está populada
4. Teste as permissões com diferentes usuários acadêmicos

## Verificação de Funcionamento

Para verificar se as políticas estão funcionando corretamente:

```sql
-- Verificar se a função existe
SELECT proname, prosrc FROM pg_proc WHERE proname = 'is_academic_user';

-- Listar políticas de uma tabela
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'students';

-- Listar políticas do storage
SELECT policyname FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects';
```

## Notas Importantes

⚠️ **Segurança:**
- Apenas usuários autenticados que existem em `users_academico` têm acesso
- Usuários do módulo financeiro não têm acesso aos dados acadêmicos
- Usuários não autenticados não têm acesso algum

✅ **Benefícios:**
- Colaboração total entre usuários acadêmicos
- Compartilhamento de recursos (assinaturas, certificados, etc.)
- Gerenciamento centralizado de dados acadêmicos
- Flexibilidade para equipes trabalharem juntas

⚡ **Performance:**
- A função `is_academic_user()` é marcada como `STABLE` para melhor performance
- Índices existentes nas tabelas continuam funcionando normalmente

## Data de Aplicação

Migrations aplicadas em: 12/02/2026

## Status

✅ Todas as migrations foram aplicadas com sucesso
✅ Função `is_academic_user()` criada e funcionando
✅ Políticas RLS atualizadas em todas as tabelas
✅ Políticas de storage atualizadas
✅ Build do projeto executado com sucesso
