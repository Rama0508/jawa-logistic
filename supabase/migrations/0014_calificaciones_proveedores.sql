-- ============================================================
-- Jawa Logistic — Calificación de proveedores compartida entre clientes
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- Muchos clientes de Jawa compran a los mismos proveedores de Alibaba/1688.
-- Esta tabla deja que cada cliente califique un proveedor real después de
-- comprarle, y que CUALQUIERA (incluso sin cuenta) pueda buscar un
-- proveedor antes de pagarle — es un activo que se vuelve más valioso con
-- cada operación real, no un catálogo curado por Jawa como
-- proveedores_catalogo.
create table public.proveedor_calificaciones (
  id uuid primary key default gen_random_uuid(),
  proveedor_nombre text not null,
  proveedor_link text,
  puntaje integer not null check (puntaje between 1 and 5),
  comentario text,
  cliente_id uuid not null references auth.users(id),
  creado_en timestamptz not null default now()
);
alter table public.proveedor_calificaciones enable row level security;

-- El cliente logueado ve/edita/borra sus propias calificaciones; staff
-- puede moderar todas (por si hace falta borrar un comentario problemático).
create policy "proveedor_calificaciones_propio" on public.proveedor_calificaciones
  for all using (auth.uid() = cliente_id or public.is_staff())
  with check (auth.uid() = cliente_id or public.is_staff());

-- Búsqueda pública de calificaciones individuales (sin exponer cliente_id).
-- La puede llamar cualquiera, incluido un visitante sin cuenta, porque el
-- valor de esto es justamente que alguien lo consulte ANTES de comprar.
create or replace function public.buscar_calificaciones_proveedor(termino text)
returns table (proveedor_nombre text, proveedor_link text, puntaje integer, comentario text, creado_en timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return query
    select c.proveedor_nombre, c.proveedor_link, c.puntaje, c.comentario, c.creado_en
    from public.proveedor_calificaciones c
    where termino = '' or c.proveedor_nombre ilike '%' || termino || '%'
    order by c.creado_en desc
    limit 30;
end;
$$;
grant execute on function public.buscar_calificaciones_proveedor(text) to anon, authenticated;

-- Resumen agregado (promedio + cantidad de opiniones) por proveedor, para
-- el listado/ranking general de la página pública.
create or replace function public.resumen_calificaciones_proveedores(termino text default '')
returns table (proveedor_nombre text, promedio numeric, cantidad bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return query
    select c.proveedor_nombre, round(avg(c.puntaje)::numeric, 1) as promedio, count(*) as cantidad
    from public.proveedor_calificaciones c
    where termino = '' or c.proveedor_nombre ilike '%' || termino || '%'
    group by c.proveedor_nombre
    order by cantidad desc, promedio desc
    limit 50;
end;
$$;
grant execute on function public.resumen_calificaciones_proveedores(text) to anon, authenticated;

create index on public.proveedor_calificaciones (proveedor_nombre);
create index on public.proveedor_calificaciones (cliente_id);
