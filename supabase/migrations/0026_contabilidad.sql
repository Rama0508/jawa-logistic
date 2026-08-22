-- ============================================================
-- Jawa Logistic — Contabilidad de partida doble
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0025_reposiciones_stock.sql ya se hayan
-- corrido antes (usa public.is_staff()).
-- ============================================================
-- Fase 2 del back-office interno (después de Stock/Pedidos de 0025):
-- plan de cuentas, asientos de partida doble, balance general y estado de
-- resultados. Nada de esto existía antes — cuenta_corriente_movimientos
-- (0005) es un ledger POR CLIENTE, no una contabilidad de la empresa.
--
-- Todo INSERT en asiento_detalles pasa obligatoriamente por
-- crear_asiento() (más abajo): no hay policy de insert directa en
-- asientos_contables/asiento_detalles, así que es imposible guardar un
-- asiento descuadrado (debe ≠ haber) ni cargar líneas sueltas por fuera de
-- un asiento completo.

create table public.cuentas_contables (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  tipo text not null check (tipo in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'egreso')),
  naturaleza text not null check (naturaleza in ('deudora', 'acreedora')),
  cuenta_padre_id uuid references public.cuentas_contables(id),
  activa boolean not null default true
);

create table public.asientos_contables (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  descripcion text not null,
  origen text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

create table public.asiento_detalles (
  id uuid primary key default gen_random_uuid(),
  asiento_id uuid not null references public.asientos_contables(id) on delete cascade,
  cuenta_id uuid not null references public.cuentas_contables(id),
  debe_centavos bigint not null default 0 check (debe_centavos >= 0),
  haber_centavos bigint not null default 0 check (haber_centavos >= 0),
  descripcion text
);
create index on public.asiento_detalles (asiento_id);
create index on public.asiento_detalles (cuenta_id);
create index on public.asientos_contables (fecha);

alter table public.cuentas_contables enable row level security;
create policy "cuentas_contables_all_staff" on public.cuentas_contables
  for all using (public.is_staff()) with check (public.is_staff());

-- Solo select y delete directo (para corregir un asiento mal cargado) —
-- nunca insert/update directo, siempre a través de crear_asiento().
alter table public.asientos_contables enable row level security;
create policy "asientos_contables_select_staff" on public.asientos_contables
  for select using (public.is_staff());
create policy "asientos_contables_delete_staff" on public.asientos_contables
  for delete using (public.is_staff());

alter table public.asiento_detalles enable row level security;
create policy "asiento_detalles_select_staff" on public.asiento_detalles
  for select using (public.is_staff());
-- Sin policy de delete acá a propósito: se borra en cascada al borrar el
-- asiento (on delete cascade arriba), nunca una línea suelta.

-- Crea un asiento completo (encabezado + líneas) en una sola operación,
-- validando que cuadre (sum(debe) = sum(haber)) antes de guardar nada. Si
-- no cuadra, no inserta ni el encabezado — rechaza todo el asiento.
-- p_lineas: [{"cuenta_id": "...", "debe": 0, "haber": 1500, "descripcion": "..."}, ...]
-- (debe/haber en centavos, como el resto de la plata en este proyecto).
create or replace function public.crear_asiento(p_fecha date, p_descripcion text, p_origen text, p_lineas jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asiento_id uuid;
  v_suma_debe bigint;
  v_suma_haber bigint;
  v_linea jsonb;
begin
  if not public.is_staff() then
    raise exception 'No autorizado';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) < 2 then
    raise exception 'Un asiento necesita al menos 2 líneas (una cuenta de debe y una de haber)';
  end if;

  select coalesce(sum(coalesce((l->>'debe')::bigint, 0)), 0), coalesce(sum(coalesce((l->>'haber')::bigint, 0)), 0)
    into v_suma_debe, v_suma_haber
    from jsonb_array_elements(p_lineas) l;

  if v_suma_debe != v_suma_haber then
    raise exception 'El asiento no cuadra: debe % distinto de haber % (en centavos)', v_suma_debe, v_suma_haber;
  end if;
  if v_suma_debe = 0 then
    raise exception 'El asiento no puede estar vacío';
  end if;

  insert into public.asientos_contables (fecha, descripcion, origen, creado_por)
    values (p_fecha, p_descripcion, p_origen, auth.uid())
    returning id into v_asiento_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    insert into public.asiento_detalles (asiento_id, cuenta_id, debe_centavos, haber_centavos, descripcion)
      values (
        v_asiento_id,
        (v_linea->>'cuenta_id')::uuid,
        coalesce((v_linea->>'debe')::bigint, 0),
        coalesce((v_linea->>'haber')::bigint, 0),
        v_linea->>'descripcion'
      );
  end loop;

  return v_asiento_id;
end;
$$;
grant execute on function public.crear_asiento(date, text, text, jsonb) to authenticated;

-- Libro mayor: cada línea con saldo corriente de su cuenta (positivo =
-- saldo a favor según la naturaleza de la cuenta: deudora acumula
-- debe-haber, acreedora acumula haber-debe).
create or replace view public.libro_mayor as
select
  ad.id, ad.asiento_id, a.fecha, a.descripcion as asiento_descripcion, a.origen,
  c.id as cuenta_id, c.codigo as cuenta_codigo, c.nombre as cuenta_nombre, c.tipo as cuenta_tipo, c.naturaleza,
  ad.debe_centavos, ad.haber_centavos, ad.descripcion as detalle_descripcion, a.creado_en,
  sum(case when c.naturaleza = 'deudora' then ad.debe_centavos - ad.haber_centavos else ad.haber_centavos - ad.debe_centavos end)
    over (partition by c.id order by a.fecha, a.creado_en, ad.id) as saldo_corriente_centavos
from public.asiento_detalles ad
join public.asientos_contables a on a.id = ad.asiento_id
join public.cuentas_contables c on c.id = ad.cuenta_id;

-- Balance general a una fecha: saldo de cada cuenta de activo/pasivo/
-- patrimonio considerando solo asientos hasta esa fecha inclusive.
create or replace function public.balance_general(p_fecha date default current_date)
returns table (cuenta_id uuid, codigo text, nombre text, tipo text, saldo_centavos bigint)
language sql
security invoker
set search_path = public
stable
as $$
  select c.id, c.codigo, c.nombre, c.tipo,
    coalesce(sum(case when c.naturaleza = 'deudora' then m.debe_centavos - m.haber_centavos else m.haber_centavos - m.debe_centavos end), 0)::bigint
  from public.cuentas_contables c
  left join (
    select ad.cuenta_id, ad.debe_centavos, ad.haber_centavos
    from public.asiento_detalles ad
    join public.asientos_contables a on a.id = ad.asiento_id
    where a.fecha <= p_fecha
  ) m on m.cuenta_id = c.id
  where c.tipo in ('activo', 'pasivo', 'patrimonio')
  group by c.id, c.codigo, c.nombre, c.tipo
  order by c.tipo, c.codigo;
$$;
grant execute on function public.balance_general(date) to authenticated;

-- Estado de resultados en un rango de fechas: ingresos y egresos del
-- período (no acumulado histórico, a diferencia del balance general).
create or replace function public.estado_resultados(p_desde date, p_hasta date)
returns table (cuenta_id uuid, codigo text, nombre text, tipo text, saldo_centavos bigint)
language sql
security invoker
set search_path = public
stable
as $$
  select c.id, c.codigo, c.nombre, c.tipo,
    coalesce(sum(case when c.naturaleza = 'deudora' then m.debe_centavos - m.haber_centavos else m.haber_centavos - m.debe_centavos end), 0)::bigint
  from public.cuentas_contables c
  left join (
    select ad.cuenta_id, ad.debe_centavos, ad.haber_centavos
    from public.asiento_detalles ad
    join public.asientos_contables a on a.id = ad.asiento_id
    where a.fecha between p_desde and p_hasta
  ) m on m.cuenta_id = c.id
  where c.tipo in ('ingreso', 'egreso')
  group by c.id, c.codigo, c.nombre, c.tipo
  order by c.tipo, c.codigo;
$$;
grant execute on function public.estado_resultados(date, date) to authenticated;

-- Plan de cuentas inicial — simple y chico a propósito, se puede ampliar
-- después desde el panel sin tocar código (cuentas_contables es una tabla
-- común, editable por staff).
insert into public.cuentas_contables (codigo, nombre, tipo, naturaleza) values
  ('1.1', 'Caja', 'activo', 'deudora'),
  ('1.2', 'Banco', 'activo', 'deudora'),
  ('1.3', 'Cuentas por Cobrar', 'activo', 'deudora'),
  ('1.4', 'Stock / Inventario', 'activo', 'deudora'),
  ('2.1', 'Cuentas por Pagar', 'pasivo', 'acreedora'),
  ('3.1', 'Capital', 'patrimonio', 'acreedora'),
  ('4.1', 'Ventas (Tienda)', 'ingreso', 'acreedora'),
  ('4.2', 'Servicios de Importación', 'ingreso', 'acreedora'),
  ('5.1', 'Costo de Mercadería Vendida', 'egreso', 'deudora'),
  ('5.2', 'Gastos Operativos', 'egreso', 'deudora'),
  ('5.3', 'Flete Pagado a Agentes de Carga', 'egreso', 'deudora');
