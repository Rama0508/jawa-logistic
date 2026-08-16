-- ============================================================
-- Jawa Logistic — Biblioteca interna de códigos HS/NCM
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0011_fix_admin_hub_funciones.sql ya se hayan
-- corrido antes.
-- ============================================================

-- No hay fuente gratuita/oficial con aranceles por código NCM a la que
-- conectarse (el sistema en tiempo real de AFIP/Aduana es solo para
-- operadores aduaneros registrados; la alternativa real es un servicio
-- comercial pago). En cambio, construimos una biblioteca propia: cada vez
-- que el despachante matriculado de Jawa confirma el código real de un
-- producto en una operación, se carga acá — y esa biblioteca alimenta las
-- estimaciones de IA (clasificar-producto, requisitos-importacion) como
-- referencia, nunca como dato oficial.
create table public.ncm_biblioteca (
  id uuid primary key default gen_random_uuid(),
  producto_nombre text not null,
  categoria text,
  codigo_hs text not null,
  notas text,
  confirmado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
alter table public.ncm_biblioteca enable row level security;
create policy "ncm_biblioteca_staff_all" on public.ncm_biblioteca
  for all using (public.is_staff()) with check (public.is_staff());

-- Lookup de solo lectura, sin exponer confirmado_por/notas (info interna).
-- La puede llamar cualquiera, incluido un visitante anónimo en la home,
-- porque el analizador de requisitos públicos necesita consultarla sin
-- login. Nunca devuelve más de 5 resultados ni columnas sensibles.
create or replace function public.buscar_ncm_biblioteca(termino text)
returns table (producto_nombre text, categoria text, codigo_hs text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return query
    select b.producto_nombre, b.categoria, b.codigo_hs
    from public.ncm_biblioteca b
    where b.producto_nombre ilike '%' || termino || '%' or b.categoria ilike '%' || termino || '%'
    order by b.creado_en desc
    limit 5;
end;
$$;
grant execute on function public.buscar_ncm_biblioteca(text) to anon, authenticated;

create index on public.ncm_biblioteca (producto_nombre);
