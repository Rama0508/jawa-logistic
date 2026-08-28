// ---------- Jawa Logistic — Consulta de posición arancelaria (VUCE) ----------
// Helper compartido entre el hub (cliente) y admin.html (staff) para pedirle a
// la Edge Function `vuce-posicion` los datos oficiales de una posición HS/NCM
// y pintarlos con un formato consistente.
//
// Requiere que antes se haya cargado js/rates.js (usa SUPABASE_URL,
// SUPABASE_ANON_KEY y escHtml, que ya son globales de ahí).
//
// La Edge Function ya cachea, normaliza y hace de fallback — acá solo se
// llama y se renderiza. Toda respuesta trae `success` y `urlOficial`, así que
// aunque VUCE esté caído la UI puede ofrecer el link a la ficha oficial.

// origen del sitio (china / miami) -> código ISO-3166 numérico que usa VUCE
const PAIS_VUCE = { china: "156", miami: "840" };

const VUCE_POSICION_URL = `${SUPABASE_URL}/functions/v1/vuce-posicion`;

// Link directo a la ficha oficial de VUCE (fallback y "ver más").
function urlFichaVUCE(posicion, operacion, pais) {
  const cod = String(posicion || "").replace(/[^0-9A-Za-z]/g, "");
  return `https://www.vuce.gob.ar/busquedaPosicion?posicion=${encodeURIComponent(cod)}&operacion=${operacion || "importacion"}&pais=${pais || "156"}`;
}

// Devuelve el JSON de la Edge Function tal cual (incluye success / error /
// urlOficial). `modo` puede ser "ficha" (default) o "arbol".
async function consultarVUCE({ posicion, operacion, pais, accessToken, modo }) {
  try {
    const resp = await fetch(VUCE_POSICION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + accessToken,
      },
      body: JSON.stringify({
        posicion,
        operacion: operacion || "importacion",
        pais: pais || "156",
        modo: modo || "ficha",
      }),
    });
    return await resp.json();
  } catch (e) {
    return {
      success: false,
      error: "No se pudo conectar con el servicio de consulta a VUCE.",
      urlOficial: urlFichaVUCE(posicion, operacion, pais),
    };
  }
}

function _fmtPct(n) {
  if (n === null || n === undefined || n === "") return "—";
  return `${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;
}

const _TRIBUTO_LABELS = [
  ["die", "Der. importación extrazona"],
  ["dii", "Der. importación intrazona"],
  ["aec", "Arancel externo común"],
  ["te", "Tasa estadística"],
  ["iva", "IVA"],
  ["ivaAdicional", "IVA adicional"],
  ["ganancias", "Ganancias"],
  ["iibb", "IIBB"],
];

// Pinta la ficha completa dentro de `contenedor` (un elemento del DOM).
// opts.compacto = true reduce paddings (para el panel dentro de admin).
function renderFichaVUCE(data, contenedor, opts) {
  opts = opts || {};
  if (!data || !data.success) {
    fichaVUCEFallback(data && data.urlOficial, contenedor, data && data.error);
    return;
  }

  const t = data.tributos || {};
  const pad = opts.compacto ? "12px 14px" : "16px 18px";
  const jerarquia = Array.isArray(data.jerarquia) ? data.jerarquia : [];
  const intervenciones = Array.isArray(data.intervenciones) ? data.intervenciones : [];
  const obligatorias = intervenciones.filter((i) => i.obligatorio);
  const optativas = intervenciones.filter((i) => !i.obligatorio);
  const preferencias = Array.isArray(data.preferencias) ? data.preferencias : [];
  const antidumping = Array.isArray(data.antidumping) ? data.antidumping : [];

  const tributosHtml = _TRIBUTO_LABELS.map(([k, label]) => `
    <div style="background:var(--paper); border:1px solid var(--line); border-radius:8px; padding:8px 10px;">
      <div style="font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:var(--muted);">${label}</div>
      <div style="font-size:15px; font-weight:800; color:var(--navy); margin-top:2px;" class="data">${_fmtPct(t[k])}</div>
    </div>
  `).join("");

  const intervItem = (i) => `
    <div style="background:var(--paper); border-radius:8px; padding:10px 12px; margin-bottom:8px;">
      <div style="font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.03em; color:var(--coral); margin-bottom:2px;">${escHtml(i.organismo)}</div>
      <div style="font-size:13px; font-weight:700; color:var(--navy);">${escHtml(i.tramite)}${i.validada ? ` <span style="font-size:9.5px; font-weight:700; color:var(--green); background:var(--green-bg); border-radius:4px; padding:1px 5px; vertical-align:middle;">validada</span>` : ""}</div>
      ${i.resumen ? `<div style="font-size:11.5px; color:var(--muted); line-height:1.5; margin-top:3px;">${escHtml(i.resumen.length > 260 ? i.resumen.slice(0, 260) + "…" : i.resumen)}</div>` : ""}
    </div>
  `;

  const seccion = (titulo, cuerpo) => cuerpo
    ? `<div style="margin-top:16px;"><div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--navy); margin-bottom:8px;">${titulo}</div>${cuerpo}</div>`
    : "";

  contenedor.innerHTML = `
    <div style="border:1px solid var(--line); border-radius:12px; padding:${pad}; background:var(--white);">
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
        <span style="font-size:9.5px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#fff; background:var(--navy); border-radius:4px; padding:3px 7px;">Datos oficiales · VUCE</span>
        ${data.actualizadoAl ? `<span style="font-size:11px; color:var(--muted);">actualizado al ${escHtml(String(data.actualizadoAl))}</span>` : ""}
        ${data.fuente === "cache" ? `<span style="font-size:10px; color:var(--muted);">(cacheado)</span>` : ""}
      </div>
      <div style="font-size:15px; font-weight:800; color:var(--navy); font-family:ui-monospace,Menlo,monospace;">${escHtml(data.posicion)}</div>
      ${data.descripcionCorta ? `<div style="font-size:13px; color:var(--ink); margin-top:2px;">${escHtml(data.descripcionCorta)}</div>` : ""}
      <div style="display:flex; gap:14px; flex-wrap:wrap; font-size:11.5px; color:var(--muted); margin-top:6px;">
        ${data.unidad ? `<span>Unidad: <b style="color:var(--ink);">${escHtml(data.unidad)}</b></span>` : ""}
        ${data.ramo ? `<span>Ramo: <b style="color:var(--ink);">${escHtml(data.ramo)}</b></span>` : ""}
        ${data.codigoAfip ? `<span>Cód. AFIP: <b style="color:var(--ink);" class="data">${escHtml(data.codigoAfip)}</b></span>` : ""}
      </div>

      <div style="margin-top:14px;">
        <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--navy); margin-bottom:8px;">Tributación (${escHtml(data.operacion)})</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px;">${tributosHtml}</div>
      </div>

      ${seccion("Intervenciones obligatorias", obligatorias.length ? obligatorias.map(intervItem).join("") : "")}
      ${seccion("Intervenciones optativas", optativas.length ? `<details style="font-size:12px;"><summary style="cursor:pointer; color:var(--coral); font-weight:700;">Ver ${optativas.length} régimen${optativas.length === 1 ? "" : "es"} optativo${optativas.length === 1 ? "" : "s"}</summary><div style="margin-top:8px;">${optativas.map(intervItem).join("")}</div></details>` : "")}
      ${!obligatorias.length && !optativas.length ? `<div style="margin-top:14px; font-size:12px; color:var(--muted);">VUCE no lista intervenciones de organismos para esta posición.</div>` : ""}

      ${seccion("Preferencias arancelarias", preferencias.length ? preferencias.map((p) => `<div style="font-size:12px; color:var(--ink); padding:4px 0;">• ${escHtml(p.acuerdo)}${p.alicuota !== null ? ` — <b class="data">${_fmtPct(p.alicuota)}</b>` : ""}${p.observaciones ? ` <span style="color:var(--muted);">(${escHtml(p.observaciones)})</span>` : ""}</div>`).join("") : "")}
      ${seccion("Medidas antidumping", antidumping.length ? antidumping.map((m) => `<div style="font-size:12px; color:var(--ink); padding:4px 0;">• ${escHtml(m.descripcion)}${m.alicuota !== null ? ` — <b class="data">${_fmtPct(m.alicuota)}</b>` : ""}${m.vigencia ? ` <span style="color:var(--muted);">${escHtml(String(m.vigencia))}</span>` : ""}</div>`).join("") : "")}

      ${jerarquia.length ? `<details style="margin-top:14px; font-size:11.5px;"><summary style="cursor:pointer; color:var(--coral); font-weight:700;">Descripción oficial completa</summary><div style="margin-top:6px; color:var(--muted); line-height:1.6;">${jerarquia.map((n) => `<div><b class="data" style="color:var(--ink);">${escHtml(n.codigo)}</b> ${escHtml(n.texto)}</div>`).join("")}</div></details>` : ""}

      <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--line); font-size:11px; color:var(--muted); line-height:1.6;">
        Fuente: Ventanilla Única de Comercio Exterior (VUCE), datos oficiales del Estado argentino.
        La clasificación arancelaria definitiva de tu producto la confirma Jawa Logistic con su despachante de aduana matriculado.
        ${data.urlOficial ? `<a href="${escHtml(data.urlOficial)}" target="_blank" rel="noopener" style="color:var(--coral); font-weight:700; white-space:nowrap;">Ver ficha oficial en VUCE →</a>` : ""}
      </div>
    </div>
  `;
}

// Tarjeta mínima para cuando la consulta a VUCE falló: solo el link oficial.
function fichaVUCEFallback(urlOficial, contenedor, mensaje) {
  const url = urlOficial || "https://www.vuce.gob.ar/busquedaPosicion";
  contenedor.innerHTML = `
    <div style="border:1px solid var(--line); border-radius:12px; padding:16px 18px; background:var(--paper);">
      <div style="font-size:12.5px; color:var(--muted); line-height:1.6; margin-bottom:10px;">
        ${escHtml(mensaje || "No pudimos traer los datos de VUCE en este momento.")}
      </div>
      <a href="${escHtml(url)}" target="_blank" rel="noopener" style="text-decoration:none; display:inline-flex; align-items:center; border:1.5px solid var(--line); border-radius:9px; padding:9px 14px; font-size:12.5px; font-weight:700; color:var(--ink);">Ver la ficha oficial en VUCE →</a>
    </div>
  `;
}
