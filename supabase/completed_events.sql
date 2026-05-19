-- =========================================================================
-- Flux — Tabla completed_events para Persistencia Total
-- Copia y pega este código en: Supabase Dashboard > SQL Editor > New Query
-- y presiona "Run" para habilitar la sincronización en la nube de tus tareas.
-- =========================================================================

-- 1. Crear la tabla completed_events para almacenar el estado de finalización
CREATE TABLE IF NOT EXISTS public.completed_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_id TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id, event_id)
);

-- 2. Habilitar la seguridad a nivel de fila (Row Level Security - RLS)
ALTER TABLE public.completed_events ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas RLS para que los usuarios solo accedan a sus propios estados de eventos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'completed_events' AND policyname = 'Users can view their own completed events'
  ) THEN
    CREATE POLICY "Users can view their own completed events"
      ON public.completed_events FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'completed_events' AND policyname = 'Users can insert their own completed events'
  ) THEN
    CREATE POLICY "Users can insert their own completed events"
      ON public.completed_events FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'completed_events' AND policyname = 'Users can update their own completed events'
  ) THEN
    CREATE POLICY "Users can update their own completed events"
      ON public.completed_events FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'completed_events' AND policyname = 'Users can delete their own completed events'
  ) THEN
    CREATE POLICY "Users can delete their own completed events"
      ON public.completed_events FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END
$$;

-- 4. Crear índice de rendimiento optimizado
CREATE INDEX IF NOT EXISTS idx_completed_events_user_event 
  ON public.completed_events (user_id, event_id);
