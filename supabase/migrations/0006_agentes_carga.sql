-- ============================================================
-- Jawa Logistic — Agentes de carga (cotizaciones externas por kg, con tramos)
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0005_hub_cliente.sql ya se hayan corrido antes
-- (usa public.is_staff(), definida en 0005).
-- ============================================================
-- Cotizaciones reales de transportistas (ej. "Aerobox") que cobran por kilo
-- con tramos de precio, más una alícuota de impuestos estimada y un cargo
-- fijo de handling — capa aparte de las tarifas genéricas aéreo/marítimo/
-- courier, para comparar contra proveedores externos concretos desde el
-- informe de costos (admin.html).

create table public.agentes_carga (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  -- [{hastaKg: number|null, tarifaKg: number}, ...] — hastaKg null = tramo
  -- abierto ("en adelante"), siempre el más barato y el último de la lista.
  tramos jsonb not null default '[]'::jsonb,
  alicuota_impuestos numeric not null default 50,
  base_impuestos text not null default 'fob' check (base_impuestos in ('fob', 'cif')),
  handling numeric not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger agentes_carga_set_actualizado_en
  before update on public.agentes_carga
  for each row execute function public.set_actualizado_en(); -- reusa la función de 0002_tienda.sql

-- Dato interno de trabajo (cotizaciones negociadas con forwarders) — solo
-- staff lo ve o lo toca, ningún cliente ni visitante público.
alter table public.agentes_carga enable row level security;
create policy "agentes_carga_all_staff" on public.agentes_carga
  for all using (public.is_staff()) with check (public.is_staff());

-- El tope de "unidades de la misma especie" del régimen simplificado ya
-- existía como fallback hardcodeado en js/rates.js pero nunca se guardó acá
-- — no se podía editar desde el panel ni se aplicaba de verdad en admin.html.
update public.configuracion
  set valor = '{"limitePesoKg":50,"limiteCifUsd":3000,"alicuota":0.5,"maxUnidadesMismaEspecie":3}'
  where clave = 'courier_regimen';
