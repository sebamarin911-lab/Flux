import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co'
// Eliminar cualquier barra diagonal '/' final para evitar errores de doble slash en el ruteo de Edge Functions
const supabaseUrl = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'example-key'

console.log('[Flux-Supabase] URL Activo en Frontend:', supabaseUrl);
console.log('[Flux-Supabase] Longitud de Anon Key:', supabaseAnonKey ? supabaseAnonKey.length : 0);

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
