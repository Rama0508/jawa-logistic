-- ============================================================
-- Jawa Logistic — Programa de referidos
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0020_operaciones_precio_referencia.sql ya se
-- hayan corrido antes.
-- ============================================================
-- Cada cliente tiene un código propio para invitar (perfiles.codigo_referido)
-- y, si se registró usando el link de otro cliente, queda guardado quién lo
-- invitó (perfiles.referido_por). Cuando la PRIMERA operación del referido
-- llega a "entregado", se genera un derecho a recompensa PENDIENTE para
-- quien lo invitó — el staff lo revisa y lo otorga a mano desde
-- admin-hub.html (no se mueve plata sola, mismo criterio que
-- cuenta_corriente_movimientos en todo el sitio).

alter table public.perfiles add column if not exists codigo_referido text unique;
alter table public.perfiles add column if not exists referido_por uuid references auth.users(id);

-- Código corto (6 caracteres, sin 0/O/1/I para no confundir al compartirlo
-- de palabra o por teléfono).
create or replace function public.generar_codigo_referido()
returns text
language plpgsql
as $$
declare
  alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  codigo text;
  existe boolean;
begin
  loop
    codigo := '';
    for i in 1..6 loop
      codigo := codigo || substr(alfabeto, floor(random() * length(alfabeto) + 1)::int, 1);
    end loop;
    select exists(select 1 from public.perfiles where codigo_referido = codigo) into existe;
    exit when not existe;
  end loop;
  return codigo;
end;
$$;

-- Se recrea crear_perfil_nuevo_usuario() (0002, tocada de nuevo en 0016)
-- para asignarle un código de referido propio a todo perfil nuevo, y si se
-- registró con el link de invitación de otro cliente
-- (raw_user_meta_data.codigo_referido_usado, mandado desde
-- registrarCliente() en js/cuenta.js), guardar quién lo invitó.
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  referente_id uuid;
begin
  if new.raw_user_meta_data->>'codigo_referido_usado' is not null then
    select id into referente_id from public.perfiles
      where codigo_referido = upper(trim(new.raw_user_meta_data->>'codigo_referido_usado'));
  end if;

  insert into public.perfiles (id, rol, nombre, codigo_referido, referido_por)
  values (
    new.id,
    'cliente',
    nullif(coalesce(
      new.raw_user_meta_data->>'nombre',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ), ''),
    public.generar_codigo_referido(),
    referente_id
  );
  return new;
end;
$$;

-- Perfiles ya existentes no tienen código todavía — se les asigna uno ahora
-- para que también puedan invitar desde hoy.
update public.perfiles set codigo_referido = public.generar_codigo_referido() where codigo_referido is null;

-- ---------- Recompensas de referidos ----------
create table public.referidos_recompensas (
  id uuid primary key default gen_random_uuid(),
  referente_id uuid not null references auth.users(id),
  referido_id uuid not null references auth.users(id),
  operacion_id uuid references public.operaciones(id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'otorgada', 'rechazada')),
  monto_centavos integer, -- lo carga staff al otorgar, no es un valor fijo automático
  otorgada_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (referido_id) -- un solo derecho a recompensa por referido (su primera operación entregada)
);
alter table public.referidos_recompensas enable row level security;
create policy "referidos_recompensas_staff_all" on public.referidos_recompensas
  for all using (public.is_staff()) with check (public.is_staff());
create policy "referidos_recompensas_select_propio" on public.referidos_recompensas
  for select using (referente_id = auth.uid());

create or replace function public.generar_recompensa_referido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referido_por uuid;
begin
  if new.estado = 'entregado' and (old.estado is distinct from 'entregado') then
    select referido_por into v_referido_por from public.perfiles where id = new.cliente_id;
    if v_referido_por is not null then
      insert into public.referidos_recompensas (referente_id, referido_id, operacion_id)
      values (v_referido_por, new.cliente_id, new.id)
      on conflict (referido_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;
create trigger operaciones_generar_recompensa_referido
  after update on public.operaciones
  for each row execute function public.generar_recompensa_referido();

-- ---------- Validar un código al registrarse (público, sin sesión) ----------
-- Solo confirma si existe — nunca expone a quién pertenece.
create or replace function public.validar_codigo_referido(codigo text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(select 1 from public.perfiles where codigo_referido = upper(trim(codigo)));
$$;
grant execute on function public.validar_codigo_referido(text) to anon, authenticated;

-- ---------- Listado de recompensas para admin-hub.html ----------
create or replace function public.referidos_recompensas_admin_listar()
returns table (
  id uuid, referente_id uuid, referente_email text, referente_nombre text,
  referido_id uuid, referido_email text, referido_nombre text,
  operacion_id uuid, operacion_codigo text, estado text, monto_centavos integer, creado_en timestamptz
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
    select r.id, r.referente_id, ur.email::text, pr.nombre,
           r.referido_id, ui.email::text, pi.nombre,
           r.operacion_id, o.codigo, r.estado, r.monto_centavos, r.creado_en
    from public.referidos_recompensas r
    join auth.users ur on ur.id = r.referente_id
    left join public.perfiles pr on pr.id = r.referente_id
    join auth.users ui on ui.id = r.referido_id
    left join public.perfiles pi on pi.id = r.referido_id
    left join public.operaciones o on o.id = r.operacion_id
    order by r.creado_en desc;
end;
$$;
grant execute on function public.referidos_recompensas_admin_listar() to authenticated;
