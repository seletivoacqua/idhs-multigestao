-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL,
  student_id uuid NOT NULL,
  class_number integer NOT NULL,
  class_date date NOT NULL,
  present boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT attendance_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.cash_flow_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['income'::text, 'expense'::text])),
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  method text NOT NULL CHECK (method = ANY (ARRAY['pix'::text, 'transferencia'::text, 'dinheiro'::text, 'boleto'::text, 'cartao_debito'::text, 'cartao_credito'::text])),
  category text CHECK (category = ANY (ARRAY['despesas_fixas'::text, 'despesas_variaveis'::text, NULL::text])),
  description text,
  transaction_date date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  fonte_pagadora text,
  com_nota boolean DEFAULT false,
  so_recibo boolean DEFAULT false,
  subcategoria text,
  fornecedor text,
  CONSTRAINT cash_flow_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT cash_flow_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_financeiro(id)
);
CREATE TABLE public.certificates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL,
  student_id uuid NOT NULL,
  issue_date date NOT NULL,
  attendance_percentage numeric NOT NULL CHECK (attendance_percentage >= 60::numeric AND attendance_percentage <= 100::numeric),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT certificates_pkey PRIMARY KEY (id),
  CONSTRAINT certificates_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT certificates_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.class_makeup (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL,
  original_class_number integer NOT NULL,
  original_date date NOT NULL,
  makeup_day text NOT NULL,
  makeup_time text NOT NULL,
  makeup_date date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT class_makeup_pkey PRIMARY KEY (id),
  CONSTRAINT class_makeup_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id)
);
CREATE TABLE public.class_students (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL,
  student_id uuid NOT NULL,
  enrollment_date timestamp with time zone DEFAULT now(),
  enrollment_type text DEFAULT 'regular'::text CHECK (enrollment_type = ANY (ARRAY['regular'::text, 'exceptional'::text])),
  current_status text CHECK (current_status = ANY (ARRAY['em_andamento'::text, 'aprovado'::text, 'reprovado'::text])),
  status_updated_at timestamp with time zone,
  CONSTRAINT class_students_pkey PRIMARY KEY (id),
  CONSTRAINT class_students_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT class_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.classes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  name text NOT NULL,
  day_of_week text NOT NULL,
  class_time text NOT NULL,
  total_classes integer NOT NULL CHECK (total_classes > 0),
  modality text NOT NULL CHECK (modality = ANY (ARRAY['EAD'::text, 'VIDEOCONFERENCIA'::text])),
  status text DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'closed'::text])),
  created_at timestamp with time zone DEFAULT now(),
  cycle_id uuid,
  CONSTRAINT classes_pkey PRIMARY KEY (id),
  CONSTRAINT classes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_academico(id),
  CONSTRAINT classes_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT classes_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.cycles(id)
);
CREATE TABLE public.course_modules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  name text NOT NULL,
  order_number integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT course_modules_pkey PRIMARY KEY (id),
  CONSTRAINT course_modules_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id)
);
CREATE TABLE public.courses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  teacher_name text NOT NULL,
  workload integer NOT NULL CHECK (workload > 0),
  modality text NOT NULL CHECK (modality = ANY (ARRAY['EAD'::text, 'VIDEOCONFERENCIA'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT courses_pkey PRIMARY KEY (id),
  CONSTRAINT courses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_academico(id)
);
CREATE TABLE public.cycles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'closed'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cycles_pkey PRIMARY KEY (id),
  CONSTRAINT cycles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_academico(id)
);
CREATE TABLE public.ead_access (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL,
  student_id uuid NOT NULL,
  access_date_1 date,
  access_date_2 date,
  access_date_3 date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ead_access_pkey PRIMARY KEY (id),
  CONSTRAINT ead_access_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT ead_access_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.fixed_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  method text NOT NULL CHECK (method = ANY (ARRAY['boleto'::text, 'pix'::text, 'transferencia'::text])),
  description text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  pagamento_realizado boolean DEFAULT false,
  CONSTRAINT fixed_expenses_pkey PRIMARY KEY (id),
  CONSTRAINT fixed_expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_financeiro(id)
);
CREATE TABLE public.initial_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  year integer NOT NULL CHECK (year >= 2000),
  balance numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT initial_balances_pkey PRIMARY KEY (id),
  CONSTRAINT initial_balances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_number integer NOT NULL,
  unit_name text NOT NULL,
  cnpj_cpf text NOT NULL,
  exercise_month integer NOT NULL CHECK (exercise_month >= 1 AND exercise_month <= 12),
  exercise_year integer NOT NULL CHECK (exercise_year >= 2000),
  document_type text NOT NULL,
  invoice_number text NOT NULL,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  net_value numeric NOT NULL CHECK (net_value > 0::numeric),
  payment_status text NOT NULL CHECK (payment_status = ANY (ARRAY['PAGO'::text, 'EM ABERTO'::text, 'ATRASADO'::text])),
  payment_date date,
  paid_value numeric CHECK (paid_value >= 0::numeric),
  deletion_reason text,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  document_url text,
  document_name text,
  estado text,
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_financeiro(id)
);
CREATE TABLE public.meeting_minutes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  header_text text NOT NULL DEFAULT 'ATA DE SESSÃO ORDINÁRIA MENSAL DA DIRETORIA EXECUTIVA DO INSTITUTO DO DESENVOLVIMENTO HUMANO E SOCIAL – IDHS'::text,
  logo_url text,
  content text NOT NULL,
  meeting_date date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT meeting_minutes_pkey PRIMARY KEY (id),
  CONSTRAINT meeting_minutes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_financeiro(id)
);
CREATE TABLE public.signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  image_url text NOT NULL,
  name text NOT NULL DEFAULT 'Assinatura'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT signatures_pkey PRIMARY KEY (id),
  CONSTRAINT signatures_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.students (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  cpf text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  unit_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT students_pkey PRIMARY KEY (id),
  CONSTRAINT students_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_academico(id),
  CONSTRAINT students_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id)
);
CREATE TABLE public.units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  municipality text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT units_pkey PRIMARY KEY (id),
  CONSTRAINT units_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users_academico(id)
);
CREATE TABLE public.users_academico (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_academico_pkey PRIMARY KEY (id),
  CONSTRAINT users_academico_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.users_financeiro (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_financeiro_pkey PRIMARY KEY (id),
  CONSTRAINT users_financeiro_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
