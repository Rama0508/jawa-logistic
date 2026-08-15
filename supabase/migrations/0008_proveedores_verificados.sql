-- ============================================================
-- Jawa Logistic — Proveedores Verificados
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0007_calculadora_margenes_y_despachante.sql ya
-- se hayan corrido antes (usa public.is_staff() y public.set_actualizado_en()).
-- ============================================================

-- Catálogo de productos/proveedores para importar, al estilo "Proveedores
-- Verificados" de Aduanex: precio FOB (no precio puesto en Argentina, ni
-- stock — a diferencia de public.productos, que es la tienda propia de
-- Jawa). "verificado" lo marca el staff a mano, producto por producto, una
-- vez que efectivamente evaluó al proveedor — nunca se pone en true por
-- default ni al cargar datos de ejemplo.
create table public.proveedores_catalogo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null,
  descripcion text,
  precio_fob_min numeric not null check (precio_fob_min >= 0),
  precio_fob_max numeric check (precio_fob_max is null or precio_fob_max >= precio_fob_min),
  origen text not null default 'China',
  imagen_url text,
  proveedor_nombre text,
  proveedor_link text,
  verificado boolean not null default false,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger proveedores_catalogo_set_actualizado_en
  before update on public.proveedores_catalogo
  for each row execute function public.set_actualizado_en();

create index on public.proveedores_catalogo (categoria);

alter table public.proveedores_catalogo enable row level security;

-- Mismo criterio que public.productos: cualquiera ve los activos, staff ve
-- y edita todo (incluidos inactivos, para poder reactivarlos).
create policy "proveedores_catalogo_select_publico" on public.proveedores_catalogo
  for select using (activo = true or public.is_staff());
create policy "proveedores_catalogo_write_staff" on public.proveedores_catalogo
  for all using (public.is_staff()) with check (public.is_staff());

-- ============================================================
-- Datos de ejemplo — SIN marcar como verificados (verificado = false).
-- Son productos genéricos para que la página se vea funcionando; no
-- corresponden a proveedores reales evaluados por Jawa. Reemplazalos o
-- agregalos desde el panel (admin-tienda.html → pestaña Proveedores) con tu
-- catálogo real, y marcá "verificado" solo en los que de verdad evaluaste.
-- ============================================================
insert into public.proveedores_catalogo (nombre, categoria, descripcion, precio_fob_min, precio_fob_max, origen, proveedor_nombre, verificado) values
  ('Casa rodante compacta 4x4', 'Vehículos y camping', 'Módulo habitable compacto para pickup 4x4, apto para camping y viajes largos.', 7500, 9500, 'China', 'Ejemplo — cargar proveedor real', false),
  ('Bicicleta eléctrica plegable', 'Vehículos y camping', 'Cuadro plegable, motor 250W, batería removible.', 320, 450, 'China', 'Ejemplo — cargar proveedor real', false),
  ('Robot limpiapiscinas inalámbrico', 'Hogar y jardín', 'Navegación automática, batería recargable, apto piscinas de hasta 12x6m.', 180, 260, 'China', 'Ejemplo — cargar proveedor real', false),
  ('Aspiradora robot con mapeo láser', 'Hogar y jardín', 'Navegación láser, control por app, base de autolimpieza.', 90, 140, 'China', 'Ejemplo — cargar proveedor real', false),
  ('Kit de riego automático por goteo', 'Hogar y jardín', 'Programable, hasta 20 salidas, panel solar incluido.', 25, 40, 'China', 'Ejemplo — cargar proveedor real', false),
  ('Máquina expendedora refrigerada 8"', 'Vending y retail', 'Pantalla táctil 8 pulgadas, pago con QR/tarjeta, refrigeración incluida.', 1250, 1600, 'China', 'Ejemplo — cargar proveedor real', false),
  ('Máquina expendedora de snacks compacta', 'Vending y retail', 'Formato compacto para locales chicos, 32 selecciones.', 900, 1200, 'China', 'Ejemplo — cargar proveedor real', false),
  ('Power bank solar 20000mAh', 'Tecnología', 'Panel solar integrado, carga rápida, resistente al agua.', 8, 14, 'China', 'Ejemplo — cargar proveedor real', false),
  ('Auriculares TWS cancelación de ruido', 'Tecnología', 'Bluetooth 5.3, cancelación activa de ruido, estuche de carga.', 6, 11, 'China', 'Ejemplo — cargar proveedor real', false),
  ('Depiladora IPL portátil', 'Belleza y cuidado personal', 'Tecnología IPL para uso doméstico, múltiples niveles de intensidad.', 15, 25, 'China', 'Ejemplo — cargar proveedor real', false);
