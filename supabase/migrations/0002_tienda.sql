-- ============================================================
-- Jawa Logistic — tienda de productos propios + cursos
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql ya se haya corrido antes.
-- ============================================================

-- ============================================================
-- PARTE 1 — perfiles + is_staff()
-- ============================================================
-- Hasta ahora, TODA política de este proyecto usaba `auth.role() =
-- 'authenticated'` para decidir quién es "staff" (panel interno). Eso
-- funcionaba porque el único login que existía era el del panel. Ahora que
-- los CLIENTES también van a poder loguearse (para comprar y ver sus
-- cursos), esa regla se rompe: cualquier cliente autenticado calificaría
-- como "staff" y podría leer/escribir tarifas, cotizaciones e informes. Este
-- fix es un prerrequisito de seguridad, no una mejora opcional.

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null default 'cliente' check (rol in ('staff', 'cliente')),
  nombre text,
  telefono text,
  creado_en timestamptz not null default now()
);

alter table public.perfiles enable row level security;

create policy "perfiles_select_propio" on public.perfiles
  for select using (id = auth.uid());

-- security definer: is_staff() necesita leer perfiles SIN pasar por la RLS
-- de perfiles (si no, se pisarían entre sí). set search_path fijo por
-- seguridad (evita que alguien secuestre la función con un search_path raro).
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.perfiles where id = auth.uid() and rol = 'staff'
  );
$$;

create policy "perfiles_select_staff" on public.perfiles
  for select using (public.is_staff());
create policy "perfiles_update_staff" on public.perfiles
  for update using (public.is_staff());

-- Crea el perfil automáticamente cuando alguien se registra (rol 'cliente'
-- por defecto — para volver a alguien 'staff' hay que editarlo a mano desde
-- el Table Editor de Supabase, a propósito: nadie se auto-asciende a staff).
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, rol) values (new.id, 'cliente');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- Migra las políticas existentes de auth.role()='authenticated' a is_staff().
drop policy "tarifas_update_staff" on public.tarifas;
drop policy "tarifas_insert_staff" on public.tarifas;
create policy "tarifas_update_staff" on public.tarifas
  for update using (public.is_staff());
create policy "tarifas_insert_staff" on public.tarifas
  for insert with check (public.is_staff());

drop policy "configuracion_update_staff" on public.configuracion;
create policy "configuracion_update_staff" on public.configuracion
  for update using (public.is_staff());

drop policy "cotizaciones_select_staff" on public.cotizaciones;
create policy "cotizaciones_select_staff" on public.cotizaciones
  for select using (public.is_staff());

drop policy "informes_all_staff" on public.informes;
create policy "informes_all_staff" on public.informes
  for all using (public.is_staff()) with check (public.is_staff());

-- ============================================================
-- PARTE 2 — Tienda de productos + cursos
-- ============================================================

create or replace function public.set_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

-- ---------- Productos (físicos y cursos comparten la misma tabla) ----------
-- Precios en CENTAVOS enteros, nunca floats — evita errores de redondeo con
-- plata real.
create table public.productos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('fisico', 'curso')),
  nombre text not null,
  slug text not null unique,
  descripcion text,
  precio_centavos integer not null check (precio_centavos >= 0),
  stock integer check (stock is null or stock >= 0),
  peso_gramos integer check (peso_gramos is null or peso_gramos >= 0),
  imagenes jsonb not null default '[]'::jsonb,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- un curso no tiene stock físico ni peso — si algún día hace falta un
  -- producto "híbrido" se revisa esta regla, pero hoy simplifica mucho.
  constraint productos_curso_sin_stock_ni_peso check (
    tipo = 'fisico' or (stock is null and peso_gramos is null)
  )
);
create trigger productos_set_actualizado_en
  before update on public.productos
  for each row execute function public.set_actualizado_en();

-- ---------- Contenido de cursos (lecciones) ----------
create table public.curso_contenido (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  titulo text not null,
  tipo text not null check (tipo in ('video', 'pdf', 'link')),
  url text not null,
  orden integer not null default 0,
  creado_en timestamptz not null default now()
);

-- ---------- Tarifas de envío doméstico ----------
-- Arranca vacía a propósito — nunca inventar un costo de envío real.
create table public.envio_tarifas (
  id text primary key,
  nombre text not null,
  costo_centavos integer not null default 0,
  actualizado_en timestamptz not null default now()
);
insert into public.envio_tarifas (id, nombre, costo_centavos) values
  ('estandar', 'Envío estándar a domicilio', 0); -- ⚠️ falta cargar el costo real

-- ---------- Pedidos ----------
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users(id),
  estado text not null default 'pendiente' check (
    estado in ('pendiente', 'pagado', 'enviado', 'entregado', 'cancelado')
  ),
  total_centavos integer not null default 0,
  costo_envio_centavos integer not null default 0,
  direccion_envio jsonb, -- null si el pedido es 100% cursos (nada que enviar)
  mp_preference_id text,
  mp_payment_id text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger pedidos_set_actualizado_en
  before update on public.pedidos
  for each row execute function public.set_actualizado_en();

-- ---------- Ítems de cada pedido ----------
-- precio_unitario_centavos es una FOTO del precio al momento de compra: si
-- el precio del producto cambia después, el pedido histórico no se altera.
create table public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  cantidad integer not null check (cantidad > 0),
  precio_unitario_centavos integer not null check (precio_unitario_centavos >= 0)
);

-- ---------- Inscripciones a cursos ----------
-- Da acceso al contenido de un curso. Solo la crea el webhook de pago (con
-- service role, bypaseando RLS) — nunca el cliente directamente, para que
-- nadie se "inscriba" a un curso sin haberlo pagado.
create table public.inscripciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users(id),
  producto_id uuid not null references public.productos(id),
  pedido_id uuid references public.pedidos(id),
  creado_en timestamptz not null default now(),
  unique (cliente_id, producto_id)
);

-- ============================================================
-- Row Level Security — tienda
-- ============================================================
alter table public.productos enable row level security;
alter table public.curso_contenido enable row level security;
alter table public.envio_tarifas enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;
alter table public.inscripciones enable row level security;

-- Productos: cualquiera ve los activos (catálogo público); staff ve y
-- edita todo (incluidos los inactivos, para poder reactivarlos).
create policy "productos_select_publico" on public.productos
  for select using (activo = true or public.is_staff());
create policy "productos_write_staff" on public.productos
  for all using (public.is_staff()) with check (public.is_staff());

-- Contenido de curso: NUNCA público — solo quien está inscripto, o staff.
create policy "curso_contenido_select_inscripto" on public.curso_contenido
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.inscripciones i
      where i.producto_id = curso_contenido.producto_id
        and i.cliente_id = auth.uid()
    )
  );
create policy "curso_contenido_write_staff" on public.curso_contenido
  for all using (public.is_staff()) with check (public.is_staff());

-- Tarifas de envío: público puede leer (el checkout las necesita), solo
-- staff las edita.
create policy "envio_tarifas_select_publico" on public.envio_tarifas
  for select using (true);
create policy "envio_tarifas_write_staff" on public.envio_tarifas
  for all using (public.is_staff()) with check (public.is_staff());

-- Pedidos: el cliente ve y crea SOLO los propios. Importante: no hay policy
-- de UPDATE para el cliente — el estado y el pago los cambia únicamente el
-- webhook de Mercado Pago (corre con service role, que ignora RLS). Si un
-- cliente pudiera hacer UPDATE de su propio pedido, podría marcarlo
-- "pagado" él mismo sin haber pagado nada.
create policy "pedidos_select_propio" on public.pedidos
  for select using (cliente_id = auth.uid() or public.is_staff());
create policy "pedidos_insert_propio" on public.pedidos
  for insert with check (cliente_id = auth.uid());
create policy "pedidos_update_staff" on public.pedidos
  for update using (public.is_staff());

-- Ítems de pedido: mismo criterio, a través del pedido dueño.
create policy "pedido_items_select_propio" on public.pedido_items
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id and p.cliente_id = auth.uid()
    )
  );
create policy "pedido_items_insert_propio" on public.pedido_items
  for insert with check (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id and p.cliente_id = auth.uid()
    )
  );

-- Inscripciones: el cliente solo lee las propias. Nadie (ni staff) puede
-- insertar vía policy — solo el webhook con service role.
create policy "inscripciones_select_propio" on public.inscripciones
  for select using (cliente_id = auth.uid() or public.is_staff());

-- ============================================================
-- PARTE 3 — Storage: fotos de productos + contenido de cursos
-- ============================================================
-- Bucket "productos": público (son fotos de catálogo, deben verse sin login).
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

-- Bucket "curso-contenido": PRIVADO. La convención de ruta es obligatoria:
-- {producto_id}/{nombre-de-archivo} — la policy de abajo usa el primer
-- segmento de la ruta como el id del curso para chequear la inscripción.
insert into storage.buckets (id, name, public)
values ('curso-contenido', 'curso-contenido', false)
on conflict (id) do nothing;

create policy "productos_bucket_select_publico" on storage.objects
  for select using (bucket_id = 'productos');
create policy "productos_bucket_write_staff" on storage.objects
  for all using (bucket_id = 'productos' and public.is_staff())
  with check (bucket_id = 'productos' and public.is_staff());

create policy "curso_contenido_bucket_select_inscripto" on storage.objects
  for select using (
    bucket_id = 'curso-contenido' and (
      public.is_staff()
      or exists (
        select 1 from public.inscripciones i
        where i.cliente_id = auth.uid()
          and i.producto_id::text = (storage.foldername(name))[1]
      )
    )
  );
create policy "curso_contenido_bucket_write_staff" on storage.objects
  for all using (bucket_id = 'curso-contenido' and public.is_staff())
  with check (bucket_id = 'curso-contenido' and public.is_staff());
