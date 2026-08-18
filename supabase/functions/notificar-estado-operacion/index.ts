// Jawa Logistic — Edge Function: le manda un email al cliente cuando su
// operación cambia de estado, para que no tenga que entrar al HUB a
// revisar solo. Se llama desde admin-hub.html justo después de guardar el
// nuevo estado — best-effort: si falla (falta el secret, sin crédito,
// dominio no verificado en Resend, etc.) el cambio de estado en la base
// YA se guardó igual, esto solo agrega el aviso por mail.
//
// Requiere el secret RESEND_API_KEY (Supabase Dashboard → Edge Functions →
// Secrets) — cuenta gratis en resend.com. El remitente (REMITENTE más abajo)
// tiene que ser de un dominio verificado en Resend, si no los mails caen en
// spam o directamente Resend los rechaza — reemplazar antes de usar en serio.

const RESEND_API_URL = "https://api.resend.com/emails";
const REMITENTE = "Jawa Logistic <notificaciones@jawalogistic.com>"; // ⚠️ cambiar por el dominio real verificado en Resend
const SITE_URL = "https://jawalogistic.com"; // ⚠️ cambiar por el dominio real del sitio en producción

const ESTADO_LABEL: Record<string, string> = {
  cotizado: "Cotizado",
  deposito_confirmado: "Depósito confirmado",
  en_transito: "En tránsito",
  en_aduana: "En aduana",
  liberado: "Liberado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let clienteEmail: string | undefined;
  let clienteNombre: string | undefined;
  let codigo: string | undefined;
  let estadoNuevo: string | undefined;
  let operacionId: string | undefined;
  try {
    const body = await req.json();
    clienteEmail = body?.clienteEmail;
    clienteNombre = body?.clienteNombre;
    codigo = body?.codigo;
    estadoNuevo = body?.estadoNuevo;
    operacionId = body?.operacionId;
  } catch {
    return jsonResponse({ success: false, error: "Cuerpo de la petición inválido." }, 400);
  }

  if (!clienteEmail || !codigo || !estadoNuevo) {
    return jsonResponse({ success: false, error: "Faltan datos (clienteEmail, codigo, estadoNuevo)." }, 400);
  }

  const apiKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
  if (!apiKey) {
    return jsonResponse({
      success: false,
      error: "El envío de emails no está configurado todavía (falta RESEND_API_KEY en el proyecto de Supabase).",
    }, 500);
  }

  const estadoTexto = ESTADO_LABEL[estadoNuevo] || estadoNuevo;
  const nombreSaludo = clienteNombre ? clienteNombre.split(" ")[0] : "";
  const linkOperacion = operacionId ? `${SITE_URL}/hub/operacion.html?id=${operacionId}` : `${SITE_URL}/hub/operaciones.html`;

  const html = `
    <div style="font-family: Arial, sans-serif; color:#171b22; max-width:520px; margin:0 auto;">
      <div style="border-bottom:2px solid #c9502e; padding-bottom:14px; margin-bottom:20px;">
        <span style="font-size:17px; font-weight:700; color:#16223d;">JAWA LOGISTIC</span>
      </div>
      <p>Hola${nombreSaludo ? " " + nombreSaludo : ""},</p>
      <p>Tu operación <b>${codigo}</b> tiene un nuevo estado:</p>
      <div style="background:#f6f7fa; border-radius:8px; padding:14px 18px; margin:16px 0; font-size:16px; font-weight:700; color:#16223d;">
        ${estadoTexto}
      </div>
      <p><a href="${linkOperacion}" style="background:#c9502e; color:#fff; text-decoration:none; padding:10px 18px; border-radius:6px; display:inline-block; font-weight:700;">Ver el detalle en mi HUB</a></p>
      <p style="font-size:12px; color:#5b6472; margin-top:28px;">Jawa Logistic — China · Miami · Argentina</p>
    </div>
  `;

  try {
    const resp = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        from: REMITENTE,
        to: [clienteEmail],
        subject: `Tu operación ${codigo}: ${estadoTexto}`,
        html,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error("notificar-estado-operacion: Resend respondió", resp.status, JSON.stringify(data));
      return jsonResponse({ success: false, error: data?.message || `Resend devolvió error (${resp.status}).` }, 502);
    }
    return jsonResponse({ success: true, id: data?.id });
  } catch (err) {
    console.error("notificar-estado-operacion fetch error:", err instanceof Error ? err.message : String(err));
    return jsonResponse({ success: false, error: "No se pudo conectar con el servicio de email." }, 504);
  }
});
