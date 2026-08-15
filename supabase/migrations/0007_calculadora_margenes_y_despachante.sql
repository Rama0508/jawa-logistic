-- ============================================================
-- Jawa Logistic — Calculadora de márgenes y Despachante virtual
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0006_agentes_carga.sql ya se hayan corrido antes
-- (usa public.is_staff() y public.set_actualizado_en(), definidas en 0002/0005).
-- ============================================================

-- ---------- Calculadora de márgenes: simulaciones guardadas ----------
-- Registro inmutable (como cotizaciones_cliente): una fila por "Guardar
-- simulación". Las comisiones por canal, alícuota de IIBB y tasa de
-- Ganancias usadas quedan congeladas en `canales`/`resultado` — son ajustes
-- propios del cliente (no una tarifa global de Jawa), por eso no viven en
-- `configuracion` sino embebidas acá y en localStorage del navegador.
create table public.simulaciones_margen (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users(id),
  nombre text,
  unidades numeric not null,
  costo_total numeric not null,
  impuestos jsonb not null default '{}'::jsonb, -- {iva, iibb, ganancias} pagados en aduana
  margen_pct numeric,
  modo text not null check (modo in ('margen', 'precio_fijo')),
  precio_fijo numeric,
  canales jsonb not null default '[]'::jsonb, -- comisiones/config usadas en esta simulación
  resultado jsonb not null default '{}'::jsonb, -- desglose por canal ya calculado
  creado_en timestamptz not null default now()
);

-- ---------- Despachante virtual: chat con IA ----------
create table public.despachante_conversaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users(id),
  titulo text not null default 'Nueva conversación',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger despachante_conversaciones_set_actualizado_en
  before update on public.despachante_conversaciones
  for each row execute function public.set_actualizado_en();

create table public.despachante_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.despachante_conversaciones(id) on delete cascade,
  rol text not null check (rol in ('user', 'assistant')),
  contenido text not null,
  creado_en timestamptz not null default now()
);

-- ============================================================
-- Índices
-- ============================================================
create index on public.simulaciones_margen (cliente_id);
create index on public.despachante_conversaciones (cliente_id);
create index on public.despachante_mensajes (conversacion_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.simulaciones_margen enable row level security;
alter table public.despachante_conversaciones enable row level security;
alter table public.despachante_mensajes enable row level security;

-- simulaciones_margen: el cliente ve/crea/borra solo las propias — es un
-- historial personal, no hay parte de staff involucrada.
create policy "simulaciones_margen_select_propio" on public.simulaciones_margen
  for select using (cliente_id = auth.uid() or public.is_staff());
create policy "simulaciones_margen_insert_propio" on public.simulaciones_margen
  for insert with check (cliente_id = auth.uid());
create policy "simulaciones_margen_delete_propio" on public.simulaciones_margen
  for delete using (cliente_id = auth.uid());

-- despachante_conversaciones: mismo criterio — es un chat privado del
-- cliente con la IA, ningún miembro de staff participa ni necesita verlo.
create policy "despachante_conversaciones_select_propio" on public.despachante_conversaciones
  for select using (cliente_id = auth.uid());
create policy "despachante_conversaciones_insert_propio" on public.despachante_conversaciones
  for insert with check (cliente_id = auth.uid());
create policy "despachante_conversaciones_update_propio" on public.despachante_conversaciones
  for update using (cliente_id = auth.uid());
create policy "despachante_conversaciones_delete_propio" on public.despachante_conversaciones
  for delete using (cliente_id = auth.uid());

-- despachante_mensajes: se filtra por join a la conversación dueña (la
-- tabla no tiene cliente_id propio para no duplicar el dato).
create policy "despachante_mensajes_select_propio" on public.despachante_mensajes
  for select using (
    exists (select 1 from public.despachante_conversaciones c where c.id = despachante_mensajes.conversacion_id and c.cliente_id = auth.uid())
  );
create policy "despachante_mensajes_insert_propio" on public.despachante_mensajes
  for insert with check (
    exists (select 1 from public.despachante_conversaciones c where c.id = despachante_mensajes.conversacion_id and c.cliente_id = auth.uid())
  );
