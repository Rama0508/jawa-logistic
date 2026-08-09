// Jawa Logistic — Edge Function: crea una preferencia de pago de Mercado
// Pago (Checkout Pro) a partir del carrito del cliente logueado.
//
// Reglas de seguridad que importan acá:
// - NUNCA se confía en precios/stock mandados por el navegador — todo se
//   vuelve a buscar en la tabla `productos` con el service role.
// - El pedido se crea con estado "pendiente"; solo el webhook de Mercado
//   Pago (mp-webhook) lo puede pasar a "pagado", nunca esta función ni el
//   cliente.
// - Esta función usa DOS clientes de Supabase a propósito:
//     - uno "atado" al JWT de quien llama, solo para confirmar que el
//       usuario existe y está realmente logueado (auth.getUser);
//     - uno con el service role, para las escrituras reales — es código
//       de servidor confiable, no el navegador del cliente, así que no
//       necesita pasar por RLS (RLS protege el acceso directo desde el
//       navegador, no la lógica ya validada de esta función).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
// ⚠️ Configurar esta variable de entorno con el dominio real del sitio una
// vez que esté desplegado (Supabase Dashboard → Edge Functions → Secrets).
const SITE_URL = Deno.env.get("SITE_URL") || "https://PENDIENTE-configurar-SITE_URL";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método no permitido." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Falta iniciar sesión." }, 401);

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
  if (userError || !user) return jsonResponse({ error: "Sesión inválida — volvé a iniciar sesión." }, 401);

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: { items?: { producto_id: string; cantidad: number }[]; direccion_envio?: Record<string, string> | null };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Cuerpo de la petición inválido." }, 400);
  }

  const itemsPedido = Array.isArray(body.items) ? body.items : [];
  if (!itemsPedido.length) return jsonResponse({ error: "El carrito está vacío." }, 400);

  const ids = itemsPedido.map((it) => it.producto_id);
  const { data: productos, error: prodError } = await supabaseAdmin
    .from("productos")
    .select("id, tipo, nombre, precio_centavos, stock, activo")
    .in("id", ids);
  if (prodError) {
    console.error("Error leyendo productos:", prodError);
    return jsonResponse({ error: "No se pudieron leer los productos." }, 500);
  }

  let hayFisicos = false;
  // deno-lint-ignore no-explicit-any
  const itemsValidados: { producto: any; cantidad: number }[] = [];
  for (const it of itemsPedido) {
    const producto = (productos || []).find((p) => p.id === it.producto_id);
    if (!producto || !producto.activo) {
      return jsonResponse({ error: "Un producto de tu carrito ya no está disponible." }, 400);
    }
    const cantidad = Math.max(1, Math.floor(Number(it.cantidad) || 1));
    if (producto.tipo === "fisico") {
      hayFisicos = true;
      if (producto.stock != null && producto.stock < cantidad) {
        return jsonResponse({ error: `No hay suficiente stock de "${producto.nombre}".` }, 400);
      }
    }
    itemsValidados.push({ producto, cantidad });
  }

  if (hayFisicos && !body.direccion_envio) {
    return jsonResponse({ error: "Falta la dirección de envío." }, 400);
  }

  let costoEnvioCentavos = 0;
  if (hayFisicos) {
    const { data: envio } = await supabaseAdmin
      .from("envio_tarifas").select("costo_centavos").eq("id", "estandar").maybeSingle();
    costoEnvioCentavos = (envio && envio.costo_centavos) || 0;
  }

  const totalCentavos =
    itemsValidados.reduce((acc, it) => acc + it.producto.precio_centavos * it.cantidad, 0) + costoEnvioCentavos;

  const { data: pedido, error: pedidoError } = await supabaseAdmin
    .from("pedidos")
    .insert({
      cliente_id: user.id,
      estado: "pendiente",
      total_centavos: totalCentavos,
      costo_envio_centavos: costoEnvioCentavos,
      direccion_envio: hayFisicos ? body.direccion_envio : null,
    })
    .select()
    .single();
  if (pedidoError || !pedido) {
    console.error("Error creando pedido:", pedidoError);
    return jsonResponse({ error: "No se pudo crear el pedido." }, 500);
  }

  const itemsInsert = itemsValidados.map((it) => ({
    pedido_id: pedido.id,
    producto_id: it.producto.id,
    cantidad: it.cantidad,
    precio_unitario_centavos: it.producto.precio_centavos,
  }));
  const { error: itemsError } = await supabaseAdmin.from("pedido_items").insert(itemsInsert);
  if (itemsError) {
    console.error("Error guardando ítems del pedido:", itemsError);
    return jsonResponse({ error: "No se pudo guardar el detalle del pedido." }, 500);
  }

  if (!MP_ACCESS_TOKEN) {
    // El pedido queda guardado como pendiente — cuando se configure Mercado
    // Pago de verdad, el flujo funciona sin tocar más código.
    return jsonResponse({
      error: "Mercado Pago todavía no está configurado en este sitio (falta MP_ACCESS_TOKEN). Tu pedido quedó guardado, pero no se puede cobrar todavía.",
      pedido_id: pedido.id,
    }, 503);
  }

  const preference = {
    items: itemsValidados.map((it) => ({
      title: it.producto.nombre,
      quantity: it.cantidad,
      unit_price: it.producto.precio_centavos / 100,
      currency_id: "ARS",
    })),
    external_reference: pedido.id,
    back_urls: {
      success: `${SITE_URL}/pedido.html?id=${pedido.id}`,
      pending: `${SITE_URL}/pedido.html?id=${pedido.id}`,
      failure: `${SITE_URL}/pedido.html?id=${pedido.id}`,
    },
    auto_return: "approved",
    notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
  };

  let mpResp: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    mpResp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MP_ACCESS_TOKEN}` },
      body: JSON.stringify(preference),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    console.error("No se pudo contactar a Mercado Pago:", err);
    return jsonResponse({ error: "No se pudo contactar a Mercado Pago. Probá de nuevo en un momento." }, 502);
  }

  if (!mpResp.ok) {
    console.error("Mercado Pago rechazó la preferencia:", await mpResp.text());
    return jsonResponse({ error: "Mercado Pago rechazó la solicitud de pago." }, 502);
  }

  const mpData = await mpResp.json();
  await supabaseAdmin.from("pedidos").update({ mp_preference_id: mpData.id }).eq("id", pedido.id);

  return jsonResponse({ pedido_id: pedido.id, init_point: mpData.init_point });
});
