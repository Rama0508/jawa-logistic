-- ============================================================
-- Jawa Logistic — Reposiciones de stock propio (mercadería en viaje)
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0024_oportunidades_home_img_propias.sql ya se
-- hayan corrido antes (usa public.productos, public.is_staff(),
-- public.set_actualizado_en()).
-- ============================================================
-- Primer paso del panel de administración interna completa (stock, pedidos
-- sin finalizar, contabilidad): esto trackea la mercadería que Jawa le
-- compra a un proveedor para reponer stock de la tienda propia — distinto
-- de `operaciones`, que es la importación DEL CLIENTE, no de Jawa. Antes de
-- esto no había forma de saber "cuánto stock viene en camino" en ningún
-- lado; `productos.stock` solo reflejaba lo que ya estaba físicamente
-- disponible.
create table public.reposiciones_stock (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id),
  cantidad integer not null check (cantidad > 0),
  costo_unitario_centavos integer not null default 0 check (costo_unitario_centavos >= 0),
  proveedor text,
  estado text not null default 'en_viaje' check (estado in ('en_viaje', 'recibido', 'cancelado')),
  fecha_pedido date not null default current_date,
  fecha_estimada date,
  fecha_recibido date,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger reposiciones_stock_set_actualizado_en
  before update on public.reposiciones_stock
  for each row execute function public.set_actualizado_en();

-- Dato interno de trabajo — solo staff, igual que agentes_carga.
alter table public.reposiciones_stock enable row level security;
create policy "reposiciones_stock_all_staff" on public.reposiciones_stock
  for all using (public.is_staff()) with check (public.is_staff());

-- Al marcar una reposición como "recibida", suma la cantidad al stock físico
-- del producto UNA sola vez (si ya estaba en 'recibido' y se vuelve a
-- guardar sin cambiar el estado, no vuelve a sumar — solo dispara en la
-- transición hacia 'recibido'). Si se cancela después de haber sido
-- recibida por error, no resta solo: eso se corrige a mano en el stock del
-- producto para que quede una decisión explícita, no automática.
create or replace function public.reposicion_stock_sumar_al_recibir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'recibido' and (old.estado is distinct from 'recibido') then
    new.fecha_recibido := coalesce(new.fecha_recibido, current_date);
    update public.productos
      set stock = coalesce(stock, 0) + new.cantidad
      where id = new.producto_id;
  end if;
  return new;
end;
$$;
create trigger reposiciones_stock_al_recibir
  before update on public.reposiciones_stock
  for each row execute function public.reposicion_stock_sumar_al_recibir();

create index on public.reposiciones_stock (estado);
create index on public.reposiciones_stock (producto_id);
