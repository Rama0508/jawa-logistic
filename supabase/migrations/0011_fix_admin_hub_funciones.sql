-- ============================================================
-- Jawa Logistic — Reparar funciones del portal de staff (admin-hub.html)
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================
--
-- admin-hub.html mostraba "Error: structure of query does not match
-- function result type" en la pestaña Operaciones. Es un problema conocido
-- de Postgres: cuando una función `returns table (...)` queda creada y
-- DESPUÉS alguna de las columnas que devuelve cambia de tipo (por ejemplo
-- por una edición manual en el Dashboard), la función se queda con la
-- descripción de fila vieja en caché y empieza a fallar con ese error,
-- aunque el cuerpo de la función nunca se haya tocado. La solución es
-- simplemente recrearla — no cambia ninguna lógica ni columna, solo fuerza
-- a Postgres a refrescar el tipo de fila contra la tabla real. Se recrean
-- las 6 por igual porque todas comparten el mismo patrón y están igual de
-- expuestas al mismo problema.

create or replace function public.buscar_cliente_por_email(buscar text)
returns table (id uuid, email text, nombre text, telefono text)
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
    select u.id, u.email, p.nombre, p.telefono
    from auth.users u
    join public.perfiles p on p.id = u.id
    where u.email ilike '%' || buscar || '%'
    order by u.email
    limit 10;
end;
$$;

create or replace function public.operaciones_admin_listar()
returns table (
  id uuid, codigo text, cliente_id uuid, cliente_email text, cliente_nombre text,
  tipo text, origen text, estado text, descripcion text,
  total_estimado_centavos integer, creado_en timestamptz
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
    select o.id, o.codigo, o.cliente_id, u.email, p.nombre,
           o.tipo, o.origen, o.estado, o.descripcion, o.total_estimado_centavos, o.creado_en
    from public.operaciones o
    join auth.users u on u.id = o.cliente_id
    left join public.perfiles p on p.id = o.cliente_id
    order by o.creado_en desc;
end;
$$;

create or replace function public.cotizaciones_cliente_admin_listar()
returns table (
  id uuid, cliente_id uuid, cliente_email text, cliente_nombre text,
  modo text, origen text, fob_usd numeric, peso_kg numeric, cbm numeric,
  total_estimado_usd numeric, detalle jsonb, convertida_en_operacion_id uuid, creado_en timestamptz
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
    select c.id, c.cliente_id, u.email, p.nombre,
           c.modo, c.origen, c.fob_usd, c.peso_kg, c.cbm, c.total_estimado_usd, c.detalle,
           c.convertida_en_operacion_id, c.creado_en
    from public.cotizaciones_cliente c
    join auth.users u on u.id = c.cliente_id
    left join public.perfiles p on p.id = c.cliente_id
    order by c.creado_en desc;
end;
$$;

create or replace function public.cuenta_corriente_admin_listar()
returns table (
  id uuid, cliente_id uuid, cliente_email text, cliente_nombre text,
  operacion_id uuid, tipo text, monto_centavos integer, concepto text, creado_en timestamptz
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
    select m.id, m.cliente_id, u.email, p.nombre,
           m.operacion_id, m.tipo, m.monto_centavos, m.concepto, m.creado_en
    from public.cuenta_corriente_movimientos m
    join auth.users u on u.id = m.cliente_id
    left join public.perfiles p on p.id = m.cliente_id
    order by m.creado_en desc;
end;
$$;

create or replace function public.documentos_admin_listar()
returns table (
  id uuid, cliente_id uuid, cliente_email text, cliente_nombre text,
  operacion_id uuid, tipo text, nombre_archivo text, storage_path text, creado_en timestamptz
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
    select d.id, d.cliente_id, u.email, p.nombre,
           d.operacion_id, d.tipo, d.nombre_archivo, d.storage_path, d.creado_en
    from public.documentos d
    join auth.users u on u.id = d.cliente_id
    left join public.perfiles p on p.id = d.cliente_id
    order by d.creado_en desc;
end;
$$;

create or replace function public.chat_hilos_admin_listar()
returns table (
  cliente_id uuid, cliente_email text, cliente_nombre text,
  ultimo_mensaje text, ultimo_autor_rol text, ultimo_creado_en timestamptz
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
    select t.cliente_id, t.cliente_email, t.cliente_nombre, t.ultimo_mensaje, t.ultimo_autor_rol, t.ultimo_creado_en
    from (
      select distinct on (m.cliente_id)
        m.cliente_id, u.email as cliente_email, p.nombre as cliente_nombre,
        m.mensaje as ultimo_mensaje, m.autor_rol as ultimo_autor_rol, m.creado_en as ultimo_creado_en
      from public.chat_mensajes m
      join auth.users u on u.id = m.cliente_id
      left join public.perfiles p on p.id = m.cliente_id
      order by m.cliente_id, m.creado_en desc
    ) t
    order by t.ultimo_creado_en desc;
end;
$$;
