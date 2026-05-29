-- =========================================================================
-- Flux — Migración para Sistema RAG Personalizado de Bienestar y Agenda
-- Crea las tablas de perfil acumulativo (RAG) y bitácora de reflexiones diarias.
-- =========================================================================

-- 1. Crear la tabla user_rag_profile para almacenar las preferencias y rutinas detectadas
CREATE TABLE IF NOT EXISTS public.user_rag_profile (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  profile_data JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Crear la tabla daily_reflections para registrar reflexiones, feedback y preguntas de seguimiento
CREATE TABLE IF NOT EXISTS public.daily_reflections (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reflection_date DATE DEFAULT CURRENT_DATE NOT NULL,
  reflection TEXT NOT NULL,
  feedback TEXT,
  question TEXT,
  question_answered BOOLEAN DEFAULT FALSE NOT NULL,
  answer TEXT,
  completed_events JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id, reflection_date)
);

-- 3. Habilitar la seguridad a nivel de fila (Row Level Security - RLS)
ALTER TABLE public.user_rag_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reflections ENABLE ROW LEVEL SECURITY;

-- 4. Crear políticas RLS para user_rag_profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_rag_profile' AND policyname = 'Users can view their own RAG profile'
  ) THEN
    CREATE POLICY "Users can view their own RAG profile"
      ON public.user_rag_profile FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_rag_profile' AND policyname = 'Users can insert their own RAG profile'
  ) THEN
    CREATE POLICY "Users can insert their own RAG profile"
      ON public.user_rag_profile FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_rag_profile' AND policyname = 'Users can update their own RAG profile'
  ) THEN
    CREATE POLICY "Users can update their own RAG profile"
      ON public.user_rag_profile FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- 5. Crear políticas RLS para daily_reflections
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_reflections' AND policyname = 'Users can view their own reflections'
  ) THEN
    CREATE POLICY "Users can view their own reflections"
      ON public.daily_reflections FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_reflections' AND policyname = 'Users can insert their own reflections'
  ) THEN
    CREATE POLICY "Users can insert their own reflections"
      ON public.daily_reflections FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_reflections' AND policyname = 'Users can update their own reflections'
  ) THEN
    CREATE POLICY "Users can update their own reflections"
      ON public.daily_reflections FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- 6. Crear índices de rendimiento optimizados
CREATE INDEX IF NOT EXISTS idx_user_rag_profile_user 
  ON public.user_rag_profile (user_id);

CREATE INDEX IF NOT EXISTS idx_daily_reflections_user_date 
  ON public.daily_reflections (user_id, reflection_date);
