-- ============================================================
-- Jawa Logistic — Club de Importadores: FOB acumulado por cliente
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================
--
-- Para poder mostrarle a cada cliente su nivel real dentro del Club de
-- Importadores (Nivel 1 / Nivel 2 / Nivel 3, según FOB acumulado en USD),
-- necesitamos que cada operación registre su valor FOB. Hoy `operaciones`
-- no tiene esa columna — se agrega acá, opcional (muchas operaciones viejas
-- no la van a tener cargada, y eso está bien: simplemente no suman al club
-- hasta que el staff la complete desde admin-hub.html).

alter table public.operaciones add column if not exists fob_usd numeric;

-- Se recrea operaciones_admin_listar() (definida en 0013) para que el
-- listado de admin-hub.html pueda mostrar/editar el FOB de cada operación.
-- Postgres no permite cambiar las columnas de salida de una función con
-- CREATE OR REPLACE si ya existe con otra firma — hay que borrarla primero.
drop function if exists public.operaciones_admin_listar();
create or replace function public.operaciones_admin_listar()
returns table (
  id uuid, codigo text, cliente_id uuid, cliente_email text, cliente_nombre text,
  tipo text, origen text, estado text, descripcion text,
  total_estimado_centavos integer, fob_usd numeric, creado_en timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_staff() then
    raise exception 'No autorizado';
  end if;
  return query
    select o.id, o.codigo, o.cliente_id, u.email::text, p.nombre,
           o.tipo, o.origen, o.estado, o.descripcion, o.total_estimado_centavos, o.fob_usd, o.creado_en
    from public.operaciones o
    join auth.users u on u.id = o.cliente_id
    left join public.perfiles p on p.id = o.cliente_id
    order by o.creado_en desc;
end;
$$;
