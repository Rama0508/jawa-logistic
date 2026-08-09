// Jawa Logistic — Edge Function: recibe las notificaciones de pago de
// Mercado Pago y confirma pedidos.
//
// Regla de seguridad central: NUNCA confiar en el contenido del webhook tal
// cual llega (cualquiera podría mandar un POST fabricado a esta URL, que es
// pública). Lo único que se toma del webhook es el ID de pago — con ese ID
// se vuelve a consultar el pago DIRECTO contra la API de Mercado Pago usando
// nuestro propio Access Token, y se confía únicamente en esa respuesta.
//
// Corre enteramente con service role (nadie llama a esto con su propia
// sesión — lo llama Mercado Pago server-to-server), así que puede escribir
// en pedidos/inscripciones/productos sin pasar por RLS. Es, a propósito, el
// ÚNICO lugar de todo el sitio que puede marcar un pedido como "pagado" o
// crear una inscripción a un curso.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function ok() {
  // Mercado Pago solo necesita un 200 rápido — no le importa el body.
  return new Response("ok", { status: 200 });
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    // Mercado Pago a veces prueba la URL con un GET al configurarla.
    return ok();
  }
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });

  if (!MP_ACCESS_TOKEN) {
    console.error("mp-webhook: falta MP_ACCESS_TOKEN — no se puede verificar el pago.");
    return ok(); // Igual respondemos 200 para que MP no reintente en loop.
  }

  // El ID de pago puede venir por query string (?data.id=...&type=payment,
  // formato viejo ?topic=payment&id=...) o en el body JSON — se revisan
  // todas las formas documentadas por Mercado Pago.
  const url = new URL(req.url);
  let paymentId =
    url.searchParams.get("data.id") ||
    url.searchParams.get("id");
  const topic = url.searchParams.get("type") || url.searchParams.get("topic");

  if (!paymentId) {
    try {
      const body = await req.json();
      paymentId = body?.data?.id || body?.id || null;
    } catch {
      // sin body JSON válido — puede ser un ping de prueba, respondemos 200 igual.
    }
  }

  if (!paymentId || (topic && topic !== "payment" && topic !== "payment.updated")) {
    return ok();
  }

  // Re-consulta el pago DIRECTO contra Mercado Pago — nunca confiar en el body del webhook.
  let payment: { status?: string; external_reference?: string; id?: number };
  try {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!resp.ok) {
      console.error("mp-webhook: Mercado Pago no devolvió el pago", paymentId, resp.status);
      return ok();
    }
    payment = await resp.json();
  } catch (err) {
    console.error("mp-webhook: error consultando el pago en Mercado Pago:", err);
    return ok();
  }

  const pedidoId = payment.external_reference;
  if (!pedidoId) return ok();

  if (payment.status !== "approved") {
    // pending, rejected, in_process, etc. — no hay nada que confirmar todavía.
    return ok();
  }

  // Idempotencia: el WHERE estado='pendiente' evita procesar dos veces si
  // Mercado Pago reintenta el mismo webhook (pasa seguido).
  const { data: pedidoActualizado, error: updateError } = await supabaseAdmin
    .from("pedidos")
    .update({ estado: "pagado", mp_payment_id: String(payment.id) })
    .eq("id", pedidoId)
    .eq("estado", "pendiente")
    .select()
    .maybeSingle();

  if (updateError) {
    console.error("mp-webhook: error actualizando el pedido:", updateError);
    return ok();
  }
  if (!pedidoActualizado) {
    // Ya estaba procesado (o el pedido no existe) — nada más que hacer.
    return ok();
  }

  const { data: items } = await supabaseAdmin
    .from("pedido_items")
    .select("cantidad, productos(id, tipo, stock)")
    .eq("pedido_id", pedidoId);

  for (const item of items || []) {
    // deno-lint-ignore no-explicit-any
    const producto = item.productos as any;
    if (!producto) continue;

    if (producto.tipo === "fisico" && producto.stock != null) {
      await supabaseAdmin
        .from("productos")
        .update({ stock: Math.max(0, producto.stock - item.cantidad) })
        .eq("id", producto.id);
    }

    if (producto.tipo === "curso") {
      await supabaseAdmin
        .from("inscripciones")
        .upsert(
          { cliente_id: pedidoActualizado.cliente_id, producto_id: producto.id, pedido_id: pedidoId },
          { onConflict: "cliente_id,producto_id", ignoreDuplicates: true }
        );
    }
  }

  return ok();
});
