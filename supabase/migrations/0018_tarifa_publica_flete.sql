-- ============================================================
-- Jawa Logistic — Tarifa pública de flete (costo real + 50%, redondeado)
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0017_margen_flete_agentes.sql ya se hayan
-- corrido antes (usa la tabla agentes_carga de 0006/0017).
-- ============================================================

-- Marca qué agente de carga (ej. "Aerobox - Aéreo") es la fuente real del
-- precio que ve el cliente en el sitio público para ese modo de transporte.
-- Como mucho un agente por modo — el índice único de abajo lo garantiza.
alter table public.agentes_carga
  add column if not exists modo_publico text check (modo_publico in ('aereo', 'maritimo'));

create unique index if not exists agentes_carga_modo_publico_unico
  on public.agentes_carga (modo_publico) where modo_publico is not null;

-- Devuelve SOLO el precio final por kilo que paga el cliente (costo real ×
-- 1,5, redondeado al múltiplo de 5 hacia arriba) — nunca el costo real, el
-- nombre del agente, el handling ni ningún otro dato interno. Pensada para
-- que la llame cualquier visitante anónimo del sitio (cotizador público,
-- home, hub) sin exponer de dónde sale el margen de Jawa ni con qué
-- forwarder se trabaja. Mismo criterio que buscar_ncm_biblioteca (0012).
create or replace function public.obtener_tarifas_publicas_flete()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  resultado jsonb := '{"aereo": [], "maritimo": []}'::jsonb;
  agente record;
  tramos_publicos jsonb;
begin
  for agente in select tramos, modo_publico from public.agentes_carga where modo_publico is not null loop
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'hastaKg', t->>'hastaKg',
        'tarifaKg', ceil((((t->>'tarifaKg')::numeric * 1.5)) / 5) * 5
      )
    ), '[]'::jsonb) into tramos_publicos
    from jsonb_array_elements(agente.tramos) as t;
    resultado := jsonb_set(resultado, array[agente.modo_publico], tramos_publicos);
  end loop;
  return resultado;
end;
$$;

grant execute on function public.obtener_tarifas_publicas_flete() to anon, authenticated;
