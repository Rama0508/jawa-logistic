-- ============================================================
-- Jawa Logistic — Precio de referencia (ya importado) por operación
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0019_oportunidades_home.sql ya se hayan
-- corrido antes.
-- ============================================================
--
-- Para el "Dashboard de ahorro" del cliente (cuánto ahorró importando con
-- Jawa en vez de comprar el mismo producto ya nacionalizado) hace falta un
-- precio de referencia por operación — no hay ninguna fuente en vivo
-- conectada a Mercado Libre (mismo motivo que el comparador manual de
-- comparador-importar-vs-comprar.html), así que lo carga el staff a mano
-- cuando lo tiene, igual que ya hace con el FOB. Opcional: las operaciones
-- sin este dato cargado simplemente no suman al total de ahorro.
alter table public.operaciones add column if not exists precio_referencia_ml_centavos integer;

drop function if exists public.operaciones_admin_listar();
create or replace function public.operaciones_admin_listar()
returns table (
  id uuid, codigo text, cliente_id uuid, cliente_email text, cliente_nombre text,
  tipo text, origen text, estado text, descripcion text,
  total_estimado_centavos integer, fob_usd numeric, precio_referencia_ml_centavos integer, creado_en timestamptz
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
           o.tipo, o.origen, o.estado, o.descripcion, o.total_estimado_centavos, o.fob_usd,
           o.precio_referencia_ml_centavos, o.creado_en
    from public.operaciones o
    join auth.users u on u.id = o.cliente_id
    left join public.perfiles p on p.id = o.cliente_id
    order by o.creado_en desc;
end;
$$;
