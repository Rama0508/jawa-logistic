-- ============================================================
-- Jawa Logistic — Cache de consultas a VUCE (posición arancelaria)
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0024_oportunidades_home_img_propias.sql ya se
-- hayan corrido antes.
-- ============================================================
-- La Edge Function `vuce-posicion` consulta la API interna de VUCE
-- (www.vuce.gob.ar) para traer, dado un código HS/NCM, la tributación real
-- (DII/DIE/AEC/IVA/IVA adicional/Ganancias/IIBB/tasa estadística), las
-- intervenciones de organismos (SENASA, ANMAT, etc.) y la descripción
-- oficial de la posición. VUCE actualiza esos datos con baja frecuencia
-- ("información actualizada al ..."), así que cacheamos cada consulta 7 días
-- para no golpear la API del Estado en cada carga y para que la ficha
-- aparezca al instante en la segunda visita.

create table public.vuce_posicion_cache (
  posicion text not null,       -- código con puntos, ej. 3926.90.90.999A
  operacion text not null,      -- 'importacion' | 'exportacion'
  pais text not null,           -- ISO-3166 numérico, ej. '156' (China), '840' (EEUU)
  data jsonb not null,          -- respuesta ya normalizada por la Edge Function
  actualizado_en timestamptz not null default now(),
  primary key (posicion, operacion, pais)
);
alter table public.vuce_posicion_cache enable row level security;

-- Son datos oficiales públicos (cualquiera los ve en vuce.gob.ar sin login).
-- Cualquier usuario logueado puede leer el cache y refrescarlo — no hay nada
-- sensible ni por cliente acá.
create policy "vuce_cache_auth_read" on public.vuce_posicion_cache
  for select using (auth.role() = 'authenticated');
create policy "vuce_cache_auth_insert" on public.vuce_posicion_cache
  for insert with check (auth.role() = 'authenticated');
create policy "vuce_cache_auth_update" on public.vuce_posicion_cache
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create index on public.vuce_posicion_cache (actualizado_en);

-- ------------------------------------------------------------
-- Límite anti-abuso para la Edge Function (mismo patrón que
-- 0023_limite_uso_ia.sql). Consultar VUCE no cuesta crédito de Anthropic,
-- pero enumerar miles de posiciones sí golpearía la API del Estado — un tope
-- generoso (40 por cuenta Y 40 por IP cada 24 h) frena el scraping masivo
-- sin molestar el uso normal.
-- ------------------------------------------------------------
alter table public.ia_uso_limite drop constraint if exists ia_uso_limite_tipo_check;
alter table public.ia_uso_limite add constraint ia_uso_limite_tipo_check
  check (tipo in ('despachante_virtual', 'clasificar_producto', 'extract_product', 'vuce_posicion'));

create or replace function public.chequear_limite_vuce(p_user_id uuid, p_ip text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite constant int := 40;
  v_ventana constant interval := interval '24 hours';
  v_count_usuario int;
  v_count_ip int;
begin
  select count(*) into v_count_usuario
  from public.ia_uso_limite
  where tipo = 'vuce_posicion' and user_id = p_user_id and creado_en > now() - v_ventana;

  select count(*) into v_count_ip
  from public.ia_uso_limite
  where tipo = 'vuce_posicion' and ip = p_ip and creado_en > now() - v_ventana;

  if v_count_usuario >= v_limite or v_count_ip >= v_limite then
    return false;
  end if;

  insert into public.ia_uso_limite (tipo, user_id, ip) values ('vuce_posicion', p_user_id, p_ip);
  return true;
end;
$$;
-- Grant a anon: la Edge Function la llama con la anon key pública, no con el
-- JWT del usuario (mismo criterio que chequear_limite_ia).
grant execute on function public.chequear_limite_vuce(uuid, text) to anon, authenticated;
