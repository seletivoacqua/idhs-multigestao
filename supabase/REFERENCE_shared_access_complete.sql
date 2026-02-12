/*
  ===========================================
  REFERÊNCIA COMPLETA: ACESSO COMPARTILHADO
  ===========================================

  Este arquivo consolida todas as migrations de acesso compartilhado
  aplicadas no módulo acadêmico.

  IMPORTANTE: Este é um arquivo de REFERÊNCIA apenas.
  As migrations já foram aplicadas no banco de dados via:
  - 20260212160622_enable_shared_access_academic_users.sql
  - 20260212160643_enable_shared_access_cycles.sql
  - 20260212160659_enable_shared_access_course_modules.sql
  - 20260212161346_enable_shared_access_signatures.sql
  - 20260212161357_enable_shared_access_signatures_storage.sql

  Data de aplicação: 12/02/2026
*/

-- ============================================
-- PARTE 1: FUNÇÃO HELPER
-- ============================================

-- Função para verificar se o usuário é um usuário acadêmico
CREATE OR REPLACE FUNCTION is_academic_user()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users_academico
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- PARTE 2: TABELA UNITS (Unidades)
-- ============================================

DROP POLICY IF EXISTS "Users can view own units" ON units;
DROP POLICY IF EXISTS "Users can insert own units" ON units;
DROP POLICY IF EXISTS "Users can update own units" ON units;
DROP POLICY IF EXISTS "Users can delete own units" ON units;

CREATE POLICY "Academic users can view all units"
  ON units FOR SELECT TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert any units"
  ON units FOR INSERT TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all units"
  ON units FOR UPDATE TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all units"
  ON units FOR DELETE TO authenticated
  USING (is_academic_user());

-- ============================================
-- PARTE 3: TABELA STUDENTS (Alunos)
-- ============================================

DROP POLICY IF EXISTS "Users can view own students" ON students;
DROP POLICY IF EXISTS "Users can insert own students" ON students;
DROP POLICY IF EXISTS "Users can update own students" ON students;
DROP POLICY IF EXISTS "Users can delete own students" ON students;

CREATE POLICY "Academic users can view all students"
  ON students FOR SELECT TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert any students"
  ON students FOR INSERT TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all students"
  ON students FOR UPDATE TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all students"
  ON students FOR DELETE TO authenticated
  USING (is_academic_user());

-- ============================================
-- PARTE 4: TABELA COURSES (Cursos)
-- ============================================

DROP POLICY IF EXISTS "Users can view own courses" ON courses;
DROP POLICY IF EXISTS "Users can insert own courses" ON courses;
DROP POLICY IF EXISTS "Users can update own courses" ON courses;
DROP POLICY IF EXISTS "Users can delete own courses" ON courses;

CREATE POLICY "Academic users can view all courses"
  ON courses FOR SELECT TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert any courses"
  ON courses FOR INSERT TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all courses"
  ON courses FOR UPDATE TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all courses"
  ON courses FOR DELETE TO authenticated
  USING (is_academic_user());

-- ============================================
-- PARTE 5: TABELA CLASSES (Turmas)
-- ============================================

DROP POLICY IF EXISTS "Users can view own classes" ON classes;
DROP POLICY IF EXISTS "Users can insert own classes" ON classes;
DROP POLICY IF EXISTS "Users can update own classes" ON classes;
DROP POLICY IF EXISTS "Users can delete own classes" ON classes;

CREATE POLICY "Academic users can view all classes"
  ON classes FOR SELECT TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert any classes"
  ON classes FOR INSERT TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all classes"
  ON classes FOR UPDATE TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all classes"
  ON classes FOR DELETE TO authenticated
  USING (is_academic_user());

-- ============================================
-- PARTE 6: TABELA CLASS_STUDENTS (Matrículas)
-- ============================================

DROP POLICY IF EXISTS "Users can view class students" ON class_students;
DROP POLICY IF EXISTS "Users can insert class students" ON class_students;
DROP POLICY IF EXISTS "Users can delete class students" ON class_students;

CREATE POLICY "Academic users can view all class students"
  ON class_students FOR SELECT TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert any class students"
  ON class_students FOR INSERT TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all class students"
  ON class_students FOR UPDATE TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all class students"
  ON class_students FOR DELETE TO authenticated
  USING (is_academic_user());

-- ============================================
-- PARTE 7: TABELA ATTENDANCE (Frequência)
-- ============================================

DROP POLICY IF EXISTS "Users can view attendance" ON attendance;
DROP POLICY IF EXISTS "Users can insert attendance" ON attendance;
DROP POLICY IF EXISTS "Users can update attendance" ON attendance;
DROP POLICY IF EXISTS "Users can delete attendance" ON attendance;

CREATE POLICY "Academic users can view all attendance"
  ON attendance FOR SELECT TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert any attendance"
  ON attendance FOR INSERT TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all attendance"
  ON attendance FOR UPDATE TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all attendance"
  ON attendance FOR DELETE TO authenticated
  USING (is_academic_user());

-- ============================================
-- PARTE 8: TABELA EAD_ACCESS (Acesso EAD)
-- ============================================

DROP POLICY IF EXISTS "Users can view ead access" ON ead_access;
DROP POLICY IF EXISTS "Users can insert ead access" ON ead_access;
DROP POLICY IF EXISTS "Users can update ead access" ON ead_access;
DROP POLICY IF EXISTS "Users can delete ead access" ON ead_access;

CREATE POLICY "Academic users can view all ead access"
  ON ead_access FOR SELECT TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert any ead access"
  ON ead_access FOR INSERT TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all ead access"
  ON ead_access FOR UPDATE TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all ead access"
  ON ead_access FOR DELETE TO authenticated
  USING (is_academic_user());

-- ============================================
-- PARTE 9: TABELA CLASS_MAKEUP (Reposições)
-- ============================================

DROP POLICY IF EXISTS "Users can view class makeup" ON class_makeup;
DROP POLICY IF EXISTS "Users can insert class makeup" ON class_makeup;
DROP POLICY IF EXISTS "Users can update class makeup" ON class_makeup;
DROP POLICY IF EXISTS "Users can delete class makeup" ON class_makeup;

CREATE POLICY "Academic users can view all class makeup"
  ON class_makeup FOR SELECT TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert any class makeup"
  ON class_makeup FOR INSERT TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all class makeup"
  ON class_makeup FOR UPDATE TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all class makeup"
  ON class_makeup FOR DELETE TO authenticated
  USING (is_academic_user());

-- ============================================
-- PARTE 10: TABELA CERTIFICATES (Certificados)
-- ============================================

DROP POLICY IF EXISTS "Users can view certificates" ON certificates;
DROP POLICY IF EXISTS "Users can insert certificates" ON certificates;
DROP POLICY IF EXISTS "Users can update certificates" ON certificates;
DROP POLICY IF EXISTS "Users can delete certificates" ON certificates;

CREATE POLICY "Academic users can view all certificates"
  ON certificates FOR SELECT TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert any certificates"
  ON certificates FOR INSERT TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all certificates"
  ON certificates FOR UPDATE TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all certificates"
  ON certificates FOR DELETE TO authenticated
  USING (is_academic_user());

-- ============================================
-- PARTE 11: TABELA CYCLES (Ciclos)
-- ============================================

DROP POLICY IF EXISTS "Users can view own cycles" ON cycles;
DROP POLICY IF EXISTS "Users can insert own cycles" ON cycles;
DROP POLICY IF EXISTS "Users can update own cycles" ON cycles;
DROP POLICY IF EXISTS "Users can delete own cycles" ON cycles;

CREATE POLICY "Academic users can view all cycles"
  ON cycles FOR SELECT TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert any cycles"
  ON cycles FOR INSERT TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all cycles"
  ON cycles FOR UPDATE TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all cycles"
  ON cycles FOR DELETE TO authenticated
  USING (is_academic_user());

-- ============================================
-- PARTE 12: TABELA COURSE_MODULES (Módulos)
-- ============================================

DROP POLICY IF EXISTS "Users can view own course modules" ON course_modules;
DROP POLICY IF EXISTS "Users can insert own course modules" ON course_modules;
DROP POLICY IF EXISTS "Users can update own course modules" ON course_modules;
DROP POLICY IF EXISTS "Users can delete own course modules" ON course_modules;

CREATE POLICY "Academic users can view all course modules"
  ON course_modules FOR SELECT TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert any course modules"
  ON course_modules FOR INSERT TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all course modules"
  ON course_modules FOR UPDATE TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all course modules"
  ON course_modules FOR DELETE TO authenticated
  USING (is_academic_user());

-- ============================================
-- PARTE 13: TABELA SIGNATURES (Assinaturas)
-- ============================================

DROP POLICY IF EXISTS "Users can view own signatures" ON signatures;
DROP POLICY IF EXISTS "Users can insert own signatures" ON signatures;
DROP POLICY IF EXISTS "Users can update own signatures" ON signatures;
DROP POLICY IF EXISTS "Users can delete own signatures" ON signatures;

CREATE POLICY "Academic users can view all signatures"
  ON signatures FOR SELECT TO authenticated
  USING (is_academic_user());

CREATE POLICY "Academic users can insert any signatures"
  ON signatures FOR INSERT TO authenticated
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can update all signatures"
  ON signatures FOR UPDATE TO authenticated
  USING (is_academic_user())
  WITH CHECK (is_academic_user());

CREATE POLICY "Academic users can delete all signatures"
  ON signatures FOR DELETE TO authenticated
  USING (is_academic_user());

-- ============================================
-- PARTE 14: STORAGE - BUCKET SIGNATURES
-- ============================================

DROP POLICY IF EXISTS "Users can upload their own signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users can view signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own signatures" ON storage.objects;

CREATE POLICY "Academic users can upload any signatures"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'signatures' AND is_academic_user());

CREATE POLICY "Academic users can view all signatures"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'signatures' AND is_academic_user());

CREATE POLICY "Academic users can update any signatures"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'signatures' AND is_academic_user())
  WITH CHECK (bucket_id = 'signatures' AND is_academic_user());

CREATE POLICY "Academic users can delete any signatures"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'signatures' AND is_academic_user());

-- ============================================
-- FIM DO ARQUIVO DE REFERÊNCIA
-- ============================================

/*
  RESUMO DAS ALTERAÇÕES:

  ✅ 1 função criada: is_academic_user()
  ✅ 12 tabelas atualizadas com acesso compartilhado
  ✅ 48 políticas RLS criadas (4 por tabela)
  ✅ 4 políticas de storage criadas

  TABELAS ATUALIZADAS:
  - units
  - students
  - courses
  - classes
  - class_students
  - attendance
  - ead_access
  - class_makeup
  - certificates
  - cycles
  - course_modules
  - signatures

  MODELO DE SEGURANÇA:
  Antes: Cada usuário via apenas seus próprios dados
  Depois: Todos os usuários acadêmicos veem e gerenciam dados de todos

  Para mais detalhes, consulte: SHARED_ACCESS_MIGRATION.md
*/
