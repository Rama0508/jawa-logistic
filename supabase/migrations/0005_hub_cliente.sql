-- ============================================================
-- Jawa Logistic — Portal de cliente (hub): operaciones de importación,
-- cotizador persistido, cuenta corriente, documentos, chat, notificaciones.
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0004_seed_productos_fisicos.sql ya se hayan corrido antes.
-- ============================================================
-- Reemplaza el flujo 100% manual por WhatsApp (cotizar → código de depósito
-- → avisar envío por wa.me, sin persistencia real) por un portal donde el
-- cliente ve el estado real de sus operaciones, su cuenta corriente, sus
-- documentos, y puede chatear con soporte. El staff gestiona todo desde
-- admin-hub.html. No hay Edge Functions nuevas acá: a diferencia de la
-- tienda (pagos automáticos vía Mercado Pago), acá no hay dinero moviéndose
-- solo — cuenta corriente y cambios de estado son asientos manuales de
-- staff, y RLS ya alcanza para protegerlos.

-- ---------- Notificaciones in-app ----------
-- Va primero: los triggers de las tablas de abajo insertan acá.
create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users(id),
  tipo text not null check (tipo in ('operacion_estado', 'documento_nuevo', 'mensaje_chat', 'cuenta_corriente')),
  titulo text not null,
  cuerpo text,
  link text,
  leida boolean not null default false,
  creado_en timestamptz not null default now()
);

-- ---------- Cotizaciones persistidas (cliente logueado) ----------
-- Distinta de `cotizaciones` (0001_init.sql): esa es de leads anónimos del
-- cotizador público. Esta vive atada a un cliente real y se puede
-- "convertir" en una operación. numeric (no centavos): son estimados en
-- USD antes de cualquier cobro real, misma convención que `cotizaciones`.
create table public.cotizaciones_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users(id),
  modo text not null check (modo in ('maritimo', 'aereo', 'courier')),
  origen text,
  fob_usd numeric,
  peso_kg numeric,
  cbm numeric,
  total_estimado_usd numeric,
  detalle jsonb not null default '{}'::jsonb, -- inputs+desglose completo, para re-render exacto
  convertida_en_operacion_id uuid, -- FK agregada después de crear `operaciones`
  creado_en timestamptz not null default now()
);

-- ---------- Operaciones de importación (tracking real) ----------
create sequence public.operaciones_codigo_seq;

create table public.operaciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  cliente_id uuid not null references auth.users(id),
  tipo text not null check (tipo in ('maritimo', 'aereo', 'courier')),
  origen text,
  estado text not null default 'cotizado' check (estado in (
    'cotizado', 'deposito_confirmado', 'en_transito', 'en_aduana', 'liberado', 'entregado', 'cancelado'
  )),
  cotizacion_id uuid references public.cotizaciones_cliente(id),
  descripcion text,
  total_estimado_centavos integer, -- ARS: a diferencia de la cotización (USD), esto es lo que se le va a cobrar
  creado_por uuid references auth.users(id), -- staff que la creó
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger operaciones_set_actualizado_en
  before update on public.operaciones
  for each row execute function public.set_actualizado_en(); -- reusa la función de 0002_tienda.sql

alter table public.cotizaciones_cliente
  add constraint cotizaciones_cliente_operacion_fk
  foreign key (convertida_en_operacion_id) references public.operaciones(id);

-- Genera un código humano (JWA-2026-00001) si no vino cargado a mano.
create or replace function public.generar_codigo_operacion()
returns trigger
language plpgsql
as $$
begin
  if new.codigo is null then
    new.codigo := 'JWA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.operaciones_codigo_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;
create trigger operaciones_generar_codigo
  before insert on public.operaciones
  for each row execute function public.generar_codigo_operacion();

-- ---------- Historial de estados (timeline) ----------
create table public.operacion_eventos (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references public.operaciones(id) on delete cascade,
  estado text not null,
  nota text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

-- Cuando staff cambia operaciones.estado, se registra el evento
-- automáticamente (evita que staff tenga que cargarlo dos veces, y
-- garantiza que la timeline nunca quede desincronizada del estado real) y
-- se notifica al cliente.
create or replace function public.registrar_evento_operacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    insert into public.operacion_eventos (operacion_id, estado, creado_por)
    values (new.id, new.estado, auth.uid());

    insert into public.notificaciones (cliente_id, tipo, titulo, cuerpo, link)
    values (
      new.cliente_id, 'operacion_estado',
      'Actualización de tu operación ' || new.codigo,
      'Nuevo estado: ' || new.estado,
      '/hub/operacion.html?id=' || new.id
    );
  end if;
  return new;
end;
$$;
create trigger operaciones_registrar_evento
  after update on public.operaciones
  for each row execute function public.registrar_evento_operacion();

-- ---------- Cuenta corriente ----------
-- tipo 'cargo' = aumenta lo que el cliente debe; 'pago' = lo reduce. Asiento
-- manual de staff (la facturación real hoy es manual/fuera del sitio) — no
-- hace falta Edge Function, es contabilidad interna que solo staff escribe.
create table public.cuenta_corriente_movimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users(id),
  operacion_id uuid references public.operaciones(id),
  tipo text not null check (tipo in ('cargo', 'pago')),
  monto_centavos integer not null check (monto_centavos > 0),
  concepto text not null,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

-- Saldo por cliente. security_invoker: la RLS de la tabla base se aplica
-- también a través de la vista (cliente ve su saldo, staff ve todos).
create view public.cuenta_corriente_saldos
with (security_invoker = true) as
  select cliente_id,
    sum(case when tipo = 'cargo' then monto_centavos else -monto_centavos end) as saldo_centavos
  from public.cuenta_corriente_movimientos
  group by cliente_id;

-- ---------- Documentos ----------
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users(id),
  operacion_id uuid references public.operaciones(id),
  tipo text not null check (tipo in ('factura', 'packing_list', 'aduana', 'otro')),
  nombre_archivo text not null,
  storage_path text not null, -- convención: {cliente_id}/{documento_id}-{nombre_archivo}
  subido_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

create or replace function public.notificar_documento_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notificaciones (cliente_id, tipo, titulo, cuerpo, link)
  values (new.cliente_id, 'documento_nuevo', 'Nuevo documento disponible', new.nombre_archivo, '/hub/documentos.html');
  return new;
end;
$$;
create trigger documentos_notificar
  after insert on public.documentos
  for each row execute function public.notificar_documento_nuevo();

-- ---------- Chat de soporte (un hilo por cliente, con contexto opcional) ----------
create table public.chat_mensajes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users(id), -- a qué hilo pertenece
  operacion_id uuid references public.operaciones(id), -- contexto opcional
  autor_id uuid not null references auth.users(id),
  autor_rol text not null check (autor_rol in ('cliente', 'staff')),
  mensaje text not null,
  creado_en timestamptz not null default now()
);

create or replace function public.notificar_mensaje_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.autor_rol = 'staff' then
    insert into public.notificaciones (cliente_id, tipo, titulo, cuerpo, link)
    values (new.cliente_id, 'mensaje_chat', 'Nuevo mensaje de soporte', left(new.mensaje, 120), '/hub/chat.html');
  end if;
  return new;
end;
$$;
create trigger chat_mensajes_notificar
  after insert on public.chat_mensajes
  for each row execute function public.notificar_mensaje_chat();

-- ---------- Búsqueda de cliente por email (para admin-hub.html) ----------
-- `perfiles` no guarda email (vive en auth.users, que no es accesible desde
-- postgrest con la anon key). Esta función expone lo mínimo necesario para
-- que staff busque un cliente ya registrado al crear una operación a mano
-- — sin esto no hay forma de asociar la operación a un cliente real desde
-- la UI. security definer porque auth.users no es legible por el rol
-- `authenticated`; el chequeo de is_staff() de adentro es el único gate.
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
grant execute on function public.buscar_cliente_por_email(text) to authenticated;

-- ---------- Listado de operaciones para admin-hub.html ----------
-- Mismo motivo que buscar_cliente_por_email: la lista de operaciones de
-- staff necesita mostrar el email del cliente (no vive en `perfiles`), y
-- traerlo ya resuelto en un solo viaje evita N+1 llamadas desde el navegador.
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
grant execute on function public.operaciones_admin_listar() to authenticated;

-- ---------- Listado de cotizaciones de cliente para admin-hub.html ----------
-- Mismo motivo que las dos funciones de arriba: staff necesita ver el email
-- del cliente para decidir a quién convertirle la cotización en operación.
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
grant execute on function public.cotizaciones_cliente_admin_listar() to authenticated;

-- ---------- Listado de cuenta corriente para admin-hub.html ----------
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
grant execute on function public.cuenta_corriente_admin_listar() to authenticated;

-- ---------- Listado de documentos para admin-hub.html ----------
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
grant execute on function public.documentos_admin_listar() to authenticated;

-- ---------- Bandeja de hilos de chat para admin-hub.html ----------
-- Un hilo = un cliente_id (ver chat_mensajes arriba). Devuelve el último
-- mensaje de cada hilo, ordenado por actividad más reciente primero — es
-- lo que necesita la bandeja de soporte para saber a quién responder.
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
grant execute on function public.chat_hilos_admin_listar() to authenticated;

-- ============================================================
-- Índices
-- ============================================================
create index on public.operaciones (cliente_id);
create index on public.operacion_eventos (operacion_id);
create index on public.cotizaciones_cliente (cliente_id);
create index on public.cuenta_corriente_movimientos (cliente_id);
create index on public.documentos (cliente_id);
create index on public.documentos (operacion_id);
create index on public.chat_mensajes (cliente_id, creado_en);
create index on public.notificaciones (cliente_id, leida);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.cotizaciones_cliente enable row level security;
alter table public.operaciones enable row level security;
alter table public.operacion_eventos enable row level security;
alter table public.cuenta_corriente_movimientos enable row level security;
alter table public.documentos enable row level security;
alter table public.chat_mensajes enable row level security;
alter table public.notificaciones enable row level security;

-- cotizaciones_cliente: el cliente ve/crea las propias; nunca las edita
-- (registro inmutable) — solo staff, para setear convertida_en_operacion_id.
create policy "cotizaciones_cliente_select_propio" on public.cotizaciones_cliente
  for select using (cliente_id = auth.uid() or public.is_staff());
create policy "cotizaciones_cliente_insert_propio" on public.cotizaciones_cliente
  for insert with check (cliente_id = auth.uid());
create policy "cotizaciones_cliente_update_staff" on public.cotizaciones_cliente
  for update using (public.is_staff());

-- operaciones: el cliente SOLO lee las propias. Nunca hay insert/update de
-- cliente — el estado real siempre lo controla staff (no hay webhook
-- automático, es coordinación humana con la naviera/aerolínea/aduana).
create policy "operaciones_select_propio" on public.operaciones
  for select using (cliente_id = auth.uid() or public.is_staff());
create policy "operaciones_write_staff" on public.operaciones
  for all using (public.is_staff()) with check (public.is_staff());

-- operacion_eventos: el cliente lee la timeline de sus propias operaciones.
create policy "operacion_eventos_select_propio" on public.operacion_eventos
  for select using (
    public.is_staff()
    or exists (select 1 from public.operaciones o where o.id = operacion_eventos.operacion_id and o.cliente_id = auth.uid())
  );
create policy "operacion_eventos_write_staff" on public.operacion_eventos
  for all using (public.is_staff()) with check (public.is_staff());

-- cuenta_corriente_movimientos: el cliente solo lee, nunca escribe (es
-- asiento contable, como una libreta bancaria: la banca la escribe, el
-- titular la lee).
create policy "cc_movimientos_select_propio" on public.cuenta_corriente_movimientos
  for select using (cliente_id = auth.uid() or public.is_staff());
create policy "cc_movimientos_write_staff" on public.cuenta_corriente_movimientos
  for all using (public.is_staff()) with check (public.is_staff());

-- documentos: el cliente solo lee los propios; solo staff sube/edita/borra.
create policy "documentos_select_propio" on public.documentos
  for select using (cliente_id = auth.uid() or public.is_staff());
create policy "documentos_write_staff" on public.documentos
  for all using (public.is_staff()) with check (public.is_staff());

-- chat_mensajes: el cliente lee y escribe solo en su propio hilo, y solo
-- puede figurar como autor de sus propios mensajes (no puede mandar un
-- mensaje "como staff"). Staff lee/escribe en cualquier hilo.
create policy "chat_select_propio" on public.chat_mensajes
  for select using (cliente_id = auth.uid() or public.is_staff());
create policy "chat_insert_cliente" on public.chat_mensajes
  for insert with check (
    cliente_id = auth.uid() and autor_id = auth.uid() and autor_rol = 'cliente'
  );
create policy "chat_insert_staff" on public.chat_mensajes
  for insert with check (public.is_staff() and autor_rol = 'staff' and autor_id = auth.uid());

-- notificaciones: el cliente lee las propias y puede marcarlas leídas
-- (única escritura permitida al cliente en todo este archivo — no puede
-- crearlas, solo los triggers security definer o staff lo hacen).
create policy "notificaciones_select_propio" on public.notificaciones
  for select using (cliente_id = auth.uid() or public.is_staff());
create policy "notificaciones_update_propio" on public.notificaciones
  for update using (cliente_id = auth.uid() or public.is_staff());
create policy "notificaciones_insert_staff" on public.notificaciones
  for insert with check (public.is_staff());

-- ============================================================
-- Realtime: para que hub/chat.html reciba mensajes nuevos sin recargar.
-- ============================================================
alter publication supabase_realtime add table public.chat_mensajes;
alter publication supabase_realtime add table public.notificaciones;

-- ============================================================
-- Storage: documentos de cliente (privado, path {cliente_id}/{archivo})
-- ============================================================
insert into storage.buckets (id, name, public)
values ('documentos-cliente', 'documentos-cliente', false)
on conflict (id) do nothing;

create policy "documentos_bucket_select_propio" on storage.objects
  for select using (
    bucket_id = 'documentos-cliente' and (
      public.is_staff()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );
create policy "documentos_bucket_write_staff" on storage.objects
  for all using (bucket_id = 'documentos-cliente' and public.is_staff())
  with check (bucket_id = 'documentos-cliente' and public.is_staff());
