-- ============================================================
-- Jawa Logistic — esquema inicial de Supabase
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tarifas (reemplaza rates.js hardcodeado) ----------
create table public.tarifas (
  id text primary key,
  valor numeric not null default 0,
  unidad text not null,
  actualizado_en timestamptz not null default now()
);

insert into public.tarifas (id, valor, unidad) values
  ('sea_china', 1000, 'usd_cbm'),
  ('sea_miami', 1000, 'usd_cbm'),
  ('air_china', 0, 'usd_kg'),      -- ⚠️ falta cargar la tarifa real
  ('air_miami', 0, 'usd_kg'),      -- ⚠️ falta cargar la tarifa real
  ('courier', 0, 'usd_kg');        -- ⚠️ falta cargar la tarifa real

-- ---------- Configuración general ----------
create table public.configuracion (
  clave text primary key,
  valor jsonb not null
);

insert into public.configuracion (clave, valor) values
  ('cbm_minimo', '0.5'),
  ('divisor_volumetrico_aereo', '6000'),
  ('courier_regimen', '{"limitePesoKg":50,"limiteCifUsd":3000,"alicuota":0.5}');

-- ---------- Cotizaciones (leads del cotizador público) ----------
create table public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  origen text,
  modo text,
  fob numeric,
  peso numeric,
  cbm numeric,
  total_estimado numeric,
  nombre_cliente text,
  telefono_cliente text
);

-- ---------- Informes generados en el panel interno ----------
create table public.informes (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  datos jsonb not null
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.tarifas enable row level security;
alter table public.configuracion enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.informes enable row level security;

-- Tarifas y configuración: cualquiera puede LEER (el sitio público las necesita
-- para calcular), pero solo un usuario logueado (staff) puede modificarlas.
create policy "tarifas_select_publico" on public.tarifas
  for select using (true);
create policy "tarifas_update_staff" on public.tarifas
  for update using (auth.role() = 'authenticated');
create policy "tarifas_insert_staff" on public.tarifas
  for insert with check (auth.role() = 'authenticated');

create policy "configuracion_select_publico" on public.configuracion
  for select using (true);
create policy "configuracion_update_staff" on public.configuracion
  for update using (auth.role() = 'authenticated');

-- Cotizaciones: cualquier visitante puede CREAR una (es un lead anónimo),
-- pero solo el staff logueado puede leerlas.
create policy "cotizaciones_insert_publico" on public.cotizaciones
  for insert with check (true);
create policy "cotizaciones_select_staff" on public.cotizaciones
  for select using (auth.role() = 'authenticated');

-- Informes: todo restringido a staff logueado.
create policy "informes_all_staff" on public.informes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
