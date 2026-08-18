-- ============================================================
-- Jawa Logistic — Productos de la sección "Cuánto podrías ganar" (home)
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0018_tarifa_publica_flete.sql ya se hayan
-- corrido antes (usa public.is_staff()).
-- ============================================================

-- Los 4 productos de la sección "Mirá cuánto podrías ganar importando" de
-- index.html vivían hardcodeados en js/main.js — pasan a esta tabla para que
-- el staff los edite desde admin-tienda.html sin tocar código. El costo
-- "puesto en Argentina" y la ganancia se siguen calculando EN VIVO en el
-- navegador (con la tarifa pública real y el dólar de hoy) — acá solo se
-- guardan los 3 datos de entrada: FOB, peso y precio observado en ML.
create table public.oportunidades_home (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null,
  fob_usd numeric not null,
  peso_g numeric not null,
  ml_precio_ars numeric not null,
  imagen_url text,
  orden integer not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger oportunidades_home_set_actualizado_en
  before update on public.oportunidades_home
  for each row execute function public.set_actualizado_en(); -- reusa la función de 0002_tienda.sql

alter table public.oportunidades_home enable row level security;
create policy "oportunidades_home_staff_all" on public.oportunidades_home
  for all using (public.is_staff()) with check (public.is_staff());
-- Igual que proveedores_catalogo: la home la lee un visitante anónimo, sin
-- login — acá no hay nada confidencial (a diferencia de agentes_carga), es
-- exactamente el mismo FOB/peso/precio que ya se muestra en pantalla.
create policy "oportunidades_home_select_publico" on public.oportunidades_home
  for select using (activo = true);

-- Los 4 productos que ya están en vivo (fotos de banco de imágenes, no del
-- proveedor real — ver memoria del proyecto sobre por qué).
insert into public.oportunidades_home (nombre, categoria, fob_usd, peso_g, ml_precio_ars, imagen_url, orden) values
  ('Anillo inteligente (smart ring)', 'Tech / Salud', 9.99, 9, 79999, 'https://images.unsplash.com/photo-1744697307482-0f55e2e0c1b6?auto=format&fit=crop&w=600&q=80', 1),
  ('Soporte plegable para notebook', 'Oficina / Home office', 1.42, 350, 77900, 'https://images.pexels.com/photos/34502055/pexels-photo-34502055.jpeg?auto=compress&cs=tinysrgb&w=600', 2),
  ('Cargador inalámbrico 3 en 1', 'Accesorios celular', 6.60, 200, 50000, 'https://images.unsplash.com/photo-1575543419095-0b090628213f?auto=format&fit=crop&w=600&q=80', 3),
  ('Mini impresora térmica portátil', 'Tech / Oficina', 3.90, 175, 35000, 'https://images.pexels.com/photos/34223368/pexels-photo-34223368.jpeg?auto=compress&cs=tinysrgb&w=600', 4);
