-- ============================================================
-- Jawa Logistic — Blog / guías de importación (contenido SEO)
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0021_referidos.sql ya se hayan corrido antes.
-- ============================================================
-- Contenido educativo real (cómo importar, régimen simplificado, peso
-- volumétrico, etc.) para atraer tráfico orgánico y reforzar el glosario que
-- ya existe en la home — no son testimonios ni reseñas, es información
-- genuina y verificable sobre cómo funciona importar desde China.

create table public.guias (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  slug text not null unique,
  resumen text not null, -- para la tarjeta del listado y meta description
  contenido_html text not null,
  imagen_url text,
  publicado boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger guias_set_actualizado_en
  before update on public.guias
  for each row execute function public.set_actualizado_en(); -- reusa la función de 0002_tienda.sql

alter table public.guias enable row level security;
create policy "guias_staff_all" on public.guias
  for all using (public.is_staff()) with check (public.is_staff());
create policy "guias_select_publico" on public.guias
  for select using (publicado = true);

create index on public.guias (slug);

-- ---------- Contenido inicial ----------
insert into public.guias (titulo, slug, resumen, contenido_html, imagen_url) values
(
  'Cómo importar desde China a Argentina: guía completa 2026',
  'como-importar-desde-china-a-argentina',
  'Los pasos reales para traer mercadería desde China a Argentina: elegir producto, cotizar FOB, flete, impuestos, y qué régimen te conviene según el tamaño de tu pedido.',
  '<p>Importar desde China dejó de ser algo exclusivo de grandes empresas — hoy cualquier persona puede traer mercadería propia, siempre que entienda bien los pasos y los costos reales antes de largar.</p>
  <h2>1. Elegí bien el producto</h2>
  <p>No todo lo que se ve barato en Alibaba o 1688 conviene importarlo. Fijate el precio FOB (lo que le pagás al proveedor, sin flete), el peso y las medidas del producto — esos tres datos definen gran parte del costo final puesto en Argentina.</p>
  <h2>2. Cotizá el flete: aéreo, marítimo o courier</h2>
  <p>El aéreo es más rápido y más caro por kilo; el marítimo es más barato pero tarda semanas y conviene para volumen; el régimen de courier (envíos chicos, hasta 50kg y USD 3.000 declarados) tiene una alícuota simplificada que reemplaza el trámite formal completo.</p>
  <h2>3. Los impuestos son parte real del costo</h2>
  <p>Derechos de importación, IVA, percepciones — no son opcionales, y varían según el producto (su clasificación arancelaria, o NCM). Si sos Responsable Inscripto y comprás con factura discriminada, buena parte de esos impuestos se recuperan como crédito fiscal contra tus ventas — pero no es automático, hay que gestionarlo.</p>
  <h2>4. La diferencia entre licencia propia y licencia de un tercero</h2>
  <p>Podés importar con tu propio CUIT (gestionás vos la recuperación de impuestos ante AFIP) o con la licencia de un importador ya habilitado (te factura la mercadería ya nacionalizada, con una sola factura). Ninguna es "mejor" en abstracto — depende de si querés meterte en la gestión formal o preferís simplicidad.</p>
  <h2>5. Armá el número completo antes de decidir</h2>
  <p>FOB + flete + impuestos = tu costo real puesto en Argentina. Comparalo siempre contra el precio de ese mismo producto ya importado (Mercado Libre, una tienda) antes de decidir si te conviene importar vos mismo o comprarlo hecho.</p>
  <p>En Jawa Logistic te acompañamos en cada paso — desde la <a href="/hub/calculadora-importacion.html">calculadora de importación</a> hasta el despacho a domicilio.</p>',
  'https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?auto=format&fit=crop&w=900&q=80'
),
(
  'Régimen simplificado de courier: qué es y cuándo te conviene',
  'regimen-simplificado-courier',
  'El régimen de courier permite importar sin trámite formal completo si tu envío no supera ciertos topes de peso y valor. Te contamos los límites reales y cuándo tiene sentido usarlo.',
  '<p>Si estás por hacer tu primera importación chica, es muy probable que el régimen simplificado de courier sea el camino más rápido — pero tiene límites que hay que conocer antes de armar el pedido.</p>
  <h2>¿Qué es?</h2>
  <p>Es un régimen aduanero pensado para envíos de bajo valor: en vez de pasar por el trámite de importación formal completo (con despachante, clasificación NCM producto por producto, etc.), se paga una alícuota única sobre el valor CIF (mercadería + flete + seguro) que reemplaza a los demás tributos.</p>
  <h2>Los topes que no podés superar</h2>
  <ul>
    <li>Peso: hasta 50 kg por envío.</li>
    <li>Valor declarado: hasta USD 3.000.</li>
    <li>Unidades de la misma especie: hay un tope de unidades iguales por envío — pedidos "mayoristas" de un solo producto pueden no calificar aunque el valor total esté dentro del límite.</li>
  </ul>
  <p>Si te pasás de cualquiera de estos topes, el envío deja de calificar para el régimen simplificado y pasa a trámite formal con despachante de aduana — no es un problema en sí, pero cambia el proceso y los tiempos.</p>
  <h2>¿Cuándo conviene?</h2>
  <p>Para pedidos chicos y medianos, sobre todo si es tu primera importación: es más simple, más rápido, y no necesitás gestionar vos la clasificación arancelaria de cada producto. Para pedidos grandes o mayoristas, el aéreo o marítimo con licencia (propia o de Jawa) suele salir más conveniente por unidad.</p>
  <p>Podés cotizar tu envío por courier directo en el <a href="/hub/courier.html">HUB de Jawa</a> y ver al instante si calificás para el régimen.</p>',
  'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=900&q=80'
),
(
  'Peso volumétrico: por qué a veces el flete se cobra por el tamaño y no por el peso',
  'peso-volumetrico-flete-aereo',
  'En flete aéreo no siempre pagás por lo que pesa tu carga — a veces pagás por lo que "ocupa". Te explicamos cómo se calcula el peso volumétrico y cómo evitar pagar de más.',
  '<p>Es uno de los conceptos que más confunde a quien importa por primera vez: pediste un producto liviano, pero el flete que te cotizan es más caro de lo esperado. La razón casi siempre es el peso volumétrico.</p>
  <h2>La lógica del transportista</h2>
  <p>Un avión (o un barco) tiene espacio limitado, no solo capacidad de peso. Un bulto grande y liviano (como un inflable, una lámpara con pantalla ancha, o cualquier producto con mucho "aire" adentro de la caja) ocupa el lugar de varios bultos pesados — así que el flete se cobra por el MAYOR entre el peso real y el peso volumétrico.</p>
  <h2>Cómo se calcula</h2>
  <p>Peso volumétrico (kg) = (Largo × Ancho × Alto, en cm) ÷ 6.000 — esa es la fórmula estándar de la industria aérea que usamos en Jawa. Si tu bulto mide 40x30x30cm, el cálculo da 12kg de peso volumétrico — aunque el producto real pese solo 3kg, vas a pagar como si pesara 12kg.</p>
  <h2>Cómo evitarlo (o minimizarlo)</h2>
  <ul>
    <li>Pedile al proveedor el packaging más compacto posible — cajas ajustadas al producto, no cajas genéricas con mucho espacio vacío.</li>
    <li>Para pedidos grandes y de bajo valor por unidad, marítimo suele convenir más (ahí se cobra por volumen real, CBM, con una lógica distinta).</li>
    <li>Cargá bien las medidas en la calculadora antes de cotizar — así no te llevás una sorpresa cuando el pedido ya está en camino.</li>
  </ul>
  <p>Nuestra <a href="/hub/calculadora-importacion.html">calculadora de importación</a> ya hace esta cuenta sola, comparando peso real contra volumétrico y usando el que te sale más caro — igual que lo hace el transportista real.</p>',
  'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=900&q=80'
);
