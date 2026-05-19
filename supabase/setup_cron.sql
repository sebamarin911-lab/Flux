-- =========================================================================
-- Flux — Configuración del Cron del Servidor para el Brief Matutino
-- Copia y pega este código en: Supabase Dashboard > SQL Editor > New Query
-- =========================================================================

-- 1. Habilitar la extensión de tareas programadas (pg_cron)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- 2. Habilitar la extensión de peticiones web HTTP (pg_net)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;

-- 3. Desprogramar cualquier cron previo para evitar duplicaciones
SELECT cron.unschedule('morning-brief-cron');

-- 4. Programar la invocación diaria a las 11:30 UTC (07:30 AM en horario de invierno de Chile, UTC-4)
-- Modifica '11:30' si deseas cambiar la hora (ej: '10:30' para UTC-3 en horario de verano).
SELECT cron.schedule(
  'morning-brief-cron',
  '30 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mdpwyqqzzdwlcdiebkds.supabase.co/functions/v1/morning-brief-push',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_SC5KvuBE0yzx5F-mGIDfHg_VfWcDG9X"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
