// Jawa Logistic — Edge Function: consulta la API interna de VUCE
// (Ventanilla Única de Comercio Exterior, www.vuce.gob.ar) para un código
// HS/NCM y devuelve, ya normalizado, lo que muestra la ficha oficial:
// tributación real (DII/DIE/AEC/IVA/IVA adicional/Ganancias/tasa
// estadística/IIBB), intervenciones de organismos (SENASA, ANMAT, ENACOM…),
// preferencias arancelarias y la descripción oficial de la posición.
//
// A diferencia de clasificar-producto / requisitos-importacion (que ESTIMAN
// con IA porque no hay base oficial), esto SÍ son datos oficiales — la única
// salvedad es que la API de VUCE no está documentada y podría cambiar. Por
// eso la función:
//   - cachea cada consulta 7 días (tabla vuce_posicion_cache, migración 0025),
//   - ante cualquier fallo devuelve { success:false, urlOficial } con HTTP 200
//     para que el front caiga limpio al link de la ficha oficial de VUCE.
//
// Auth de VUCE: POST https://qa.ci.vuce.gob.ar/auth/generate con body
// {"email":"vuce@vuce.gob.ar"} y SIN headers devuelve {data:"<token>"}. Ese
// token va en el header `x-api-key` de cada GET (no como Bearer). El param
// `operacion` de la API es 'I'/'E' (no 'importacion'/'exportacion'). Se puede
// override el host con la env VUCE_API_BASE.
//
// Seguridad: sin "Enforce JWT" a nivel plataforma (rompe CORS), el chequeo de
// sesión real se hace acá contra el JWT que manda el hub. Además un tope de
// 40 consultas por cuenta/IP cada 24 h (chequear_limite_vuce) para frenar
// scraping masivo de la nomenclatura.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = "https://hthyehsqfrfwdqkbqrwj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Dlh15glcRPYtVKmvkytcbw_LGfPqN7F";

const VUCE_SITE = "https://www.vuce.gob.ar";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

function obtenerIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "desconocida";
}

async function dentroDelLimite(userId: string, ip: string): Promise<boolean> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/chequear_limite_vuce`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
      body: JSON.stringify({ p_user_id: userId, p_ip: ip }),
    });
    if (!resp.ok) return true;
    return await resp.json();
  } catch {
    return true;
  }
}

// ---------- Normalización de código ----------
// VUCE espera el código con puntos: 39269090999A -> 3926.90.90.999A,
// 85176214000B -> 8517.62.14.000B. También acepta niveles cortos
// (3926.90.90). La regla: 4 díg . 2 díg . 2 díg . resto (con la letra final).
function conPuntos(raw: string): string {
  const s = raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (s.length <= 4) return s;
  const partes = [s.slice(0, 4)];
  if (s.length > 4) partes.push(s.slice(4, 6));
  if (s.length > 6) partes.push(s.slice(6, 8));
  if (s.length > 8) partes.push(s.slice(8));
  return partes.filter(Boolean).join(".");
}
function sinPuntos(raw: string): string {
  return raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

function urlOficialDe(posicion: string, operacion: string, pais: string): string {
  return `${VUCE_SITE}/busquedaPosicion?posicion=${encodeURIComponent(sinPuntos(posicion))}&operacion=${operacion}&pais=${pais}`;
}

// ---------- Auth contra VUCE ----------
// La API de VUCE es simple: POST {base}/auth/generate con body
// {"email":"vuce@vuce.gob.ar"} y SIN headers de auth devuelve
// {status,message,data:"<token>"}. Ese token va después en el header
// `x-api-key` de cada GET (no como Bearer). El token dura ~24 h; lo
// renovamos cada 20 min por las dudas. El único host de API que responde
// es qa.ci.vuce.gob.ar (ci.vuce.gob.ar redirige al sitio público).
const VUCE_API_BASE_DEFAULT = "https://qa.ci.vuce.gob.ar";
let vuceAuth: { base: string; token: string; obtenidoEn: number } | null = null;
const AUTH_TTL_MS = 20 * 60 * 1000;

function extraerTokenDe(j: any): string {
  const d = j?.data ?? j;
  if (typeof d === "string" && d.length > 20) return d;
  return d?.token || d?.accessToken || d?.access_token || d?.jwt || d?.bearer || "";
}

async function autenticarVuce(): Promise<{ base: string; token: string }> {
  if (vuceAuth && Date.now() - vuceAuth.obtenidoEn < AUTH_TTL_MS) {
    return { base: vuceAuth.base, token: vuceAuth.token };
  }
  const base = (Deno.env.get("VUCE_API_BASE") || "").trim().replace(/\/$/, "") || VUCE_API_BASE_DEFAULT;
  const resp = await fetch(base + "/auth/generate", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email: "vuce@vuce.gob.ar" }),
  });
  if (!resp.ok) throw new Error(`/auth/generate de VUCE respondió ${resp.status}`);
  const j = await resp.json().catch(() => null);
  const token = j ? extraerTokenDe(j) : "";
  if (!token) {
    console.error("vuce-posicion: /auth/generate sin token reconocible:", JSON.stringify(j).slice(0, 300));
    throw new Error("no se pudo obtener token de VUCE");
  }
  vuceAuth = { base, token, obtenidoEn: Date.now() };
  return { base, token };
}

// operacion para la API de VUCE: 'I' o 'E' (no 'importacion'/'exportacion' —
// tributaciones/obtenerOperacion devuelve datos incompletos con el nombre largo).
function opCorta(operacion: string): string {
  return operacion === "exportacion" ? "E" : "I";
}

// ---------- Llamadas a la API de VUCE ----------
function crearGet(base: string, token: string) {
  return async function get(path: string): Promise<{ ok: boolean; status: number; json: any }> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 18000);
    try {
      const resp = await fetch(base + path, {
        signal: ctrl.signal,
        headers: { accept: "application/json", "x-api-key": token },
      });
      const json = resp.ok ? await resp.json().catch(() => null) : null;
      return { ok: resp.ok, status: resp.status, json };
    } catch {
      return { ok: false, status: 0, json: null };
    } finally {
      clearTimeout(t);
    }
  };
}

const arr = (j: any): any[] => (j && Array.isArray(j.data) ? j.data : []);
const first = (j: any): any => arr(j)[0] || null;
const numOrNull = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
};

// Mapea /tributaciones/obtenerOperacion (lista {descripcion, valor}) a un
// objeto plano. Los nombres los confirmamos en vivo contra vuce.gob.ar.
function mapTributos(tribJson: any, cicePos: any): Record<string, number | null> {
  const out: Record<string, number | null> = {
    dii: null, die: null, aec: null, te: null, iva: null, ivaAdicional: null, ganancias: null, iibb: null,
  };
  for (const row of arr(tribJson)) {
    const d = String(row.descripcion || "").trim().toUpperCase();
    const v = numOrNull(row.valor);
    if (d === "DII") out.dii = v;
    else if (d === "DIE") out.die = v;
    else if (d === "AEC") out.aec = v;
    else if (d === "TE") out.te = v;
    else if (d === "IVA") out.iva = v;
    else if (d === "IVA AD") out.ivaAdicional = v;
    else if (d === "GANANCIAS") out.ganancias = v;
    else if (d === "IIBB") out.iibb = v;
  }
  // Completar con /cice/posicion cuando la lista de tributos no lo trae.
  const c = cicePos && (cicePos["2"] || cicePos);
  if (c) {
    if (out.aec === null) out.aec = numOrNull(c.aec ?? c.arancel_externo_comun);
    if (out.die === null) out.die = numOrNull(c.derechos_importacion_extrazona);
    if (out.dii === null) out.dii = numOrNull(c.derechos_importacion_intrazona);
  }
  return out;
}

function mapIntervenciones(ivJson: any): any[] {
  return arr(ivJson).map((d: any) => {
    const rg = d.regimen || {};
    return {
      organismo: (rg.organismo_detalle && rg.organismo_detalle.nombre || "").trim() || "Organismo no especificado",
      tramite: (rg.descripcion || "").trim(),
      resumen: (rg.resumen || "").trim(),
      obligatorio: rg.opcional === 0 || rg.opcional === "0",
      validada: d.validada === 1 || d.validada === true,
      especial: d.es_especial === 1 || d.es_especial === true,
    };
  }).filter((x: any) => x.tramite);
}

function mapDescripcion(cicePos: any, textoPartida: any): { jerarquia: any[]; textoPartida: string } {
  const c = cicePos && (cicePos["2"] || cicePos);
  const jer = Array.isArray(c?.descripcion_completa)
    ? c.descripcion_completa.map((r: any) => ({ codigo: r.posicion, texto: r.descripcion }))
    : [];
  const tp = (first(textoPartida)?.texto_partida || c?.texto_partida || "").trim();
  return { jerarquia: jer, textoPartida: tp };
}

async function consultarFicha(codigo: string, operacion: string, pais: string, reintento = false): Promise<any> {
  const { base, token } = await autenticarVuce();
  const get = crearGet(base, token);
  const op = opCorta(operacion);

  const res = await Promise.all([
    get(`/cice/posicion/${codigo}`),
    get(`/tributaciones/obtenerOperacion?posicion=${codigo}&operacion=${op}`),
    get(`/comex/intervenciones/posicion?posicion=${codigo}&operacion=${op}&pais=${pais}`),
    get(`/preferencias?pais=${pais}&operacion=${op}&posicion=${codigo}`),
    get(`/cnce/medidas?operacion=${op}&pais=${pais}&posicion=${codigo}`),
    get(`/posiciones/ramos/${codigo}`),
    get(`/posiciones/aranceles/unidades/${codigo}`),
    get(`/posiciones/aranceles/codigoAfip/${codigo}`),
    get(`/cice/textoPartida/${codigo}`),
  ]);

  // Token vencido a mitad de camino: lo tiramos y reintentamos una vez.
  if (!reintento && res.some((r) => r.status === 401 || r.status === 403)) {
    vuceAuth = null;
    return consultarFicha(codigo, operacion, pais, true);
  }

  const [cicePos, tribs, ivs, prefs, cnce, ramos, unidades, codAfip, textoPartida] = res.map((r) => r.json);
  const cicePosData = first(cicePos);
  const { jerarquia, textoPartida: tp } = mapDescripcion(cicePosData, textoPartida);
  const cObj = cicePosData && (cicePosData["2"] || cicePosData);

  const preferencias = arr(prefs).map((p: any) => ({
    acuerdo: p.acuerdo || p.descripcion || p.nombre_acuerdo || "",
    alicuota: numOrNull(p.alicuota ?? p.arancel ?? p.valor),
    observaciones: p.observaciones || p.observacion || "",
  })).filter((p: any) => p.acuerdo || p.alicuota !== null);

  const antidumping = arr(cnce).map((m: any) => ({
    descripcion: m.descripcion || m.detalle || "",
    alicuota: numOrNull(m.alicuota ?? m.valor),
    vigencia: m.vigencia || m.vencimiento || "",
  })).filter((m: any) => m.descripcion);

  const huboAlgo = cicePosData || arr(tribs).length || arr(ivs).length;
  if (!huboAlgo) throw new Error("VUCE no devolvió datos para " + codigo);

  const tributos = mapTributos(tribs, cicePosData);
  const intervenciones = mapIntervenciones(ivs);
  // VUCE solo tiene los impuestos completos a nivel de posición SIM "hoja"
  // (12 díg, termina en letra de control). Para una subpartida (8518.22.00) o
  // un código incompleto/inexistente solo devuelve —a lo sumo— el arancel
  // general. Si no vino IVA ni IIBB, marcamos la ficha como parcial para que
  // el front avise y no pise las estimaciones de IA con datos a medias.
  // Solo para importación: en exportación no hay IVA/IIBB por naturaleza.
  const parcial = op === "I" && tributos.iva === null && tributos.iibb === null;

  return {
    posicion: codigo,
    operacion: op,
    pais,
    parcial,
    descripcionCorta: (cObj?.descripcion || (jerarquia[jerarquia.length - 1]?.texto) || "").trim(),
    jerarquia,
    textoPartida: tp,
    unidad: first(unidades) ? `${first(unidades).id_unidad || ""} - ${first(unidades).descripcion || ""}`.trim() : "",
    ramo: first(ramos)?.descripcion || "",
    codigoAfip: first(codAfip)?.codigo_afip || "",
    tributos,
    intervenciones,
    preferencias,
    antidumping,
    actualizadoAl: cObj?.actualizado || "",
  };
}

async function consultarArbol(parcial: string, operacion: string, reintento = false): Promise<{ posicion: string; hijos: any[] }> {
  const { base, token } = await autenticarVuce();
  const get = crearGet(base, token);
  const op = opCorta(operacion);

  const mapHijos = (j: any) => arr(j).map((d: any) => ({
    codigo: d.posicion,
    descripcion: d.descripcion || "",
    activo: d.activo === 1 || d.activo === true,
    // una posición "hoja" termina en letra de control (…999A); las intermedias no
    esHoja: /[A-Za-z]$/.test(String(d.posicion || "")),
  }));

  // Probamos el prefijo dado y, si no hay hijos (p.ej. escribieron "8517.62.00"
  // en vez de "8517.62"), vamos recortando el último grupo.
  let nivel = parcial;
  for (let i = 0; i < 4 && nivel.replace(/\./g, "").length >= 2; i++) {
    const r = await get(`/posiciones/siguienteHijo/${nivel}?operacion=${op}`);
    if (!reintento && (r.status === 401 || r.status === 403)) {
      vuceAuth = null;
      return consultarArbol(parcial, operacion, true);
    }
    const hijos = mapHijos(r.json);
    if (hijos.length) return { posicion: nivel, hijos };
    nivel = nivel.includes(".") ? nivel.slice(0, nivel.lastIndexOf(".")) : nivel.slice(0, -1);
  }
  return { posicion: parcial, hijos: [] };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ success: false, error: "Falta iniciar sesión." }, 401);
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
  if (userError || !user) return jsonResponse({ success: false, error: "Sesión inválida — volvé a iniciar sesión." }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Cuerpo de la petición inválido." }, 400);
  }

  const operacion = body?.operacion === "exportacion" ? "exportacion" : "importacion";
  const pais = String(body?.pais || "156").replace(/[^0-9]/g, "") || "156";
  const modo = body?.modo === "arbol" ? "arbol" : "ficha";
  const rawPos = String(body?.posicion || "").trim();
  if (!rawPos || !/[0-9]/.test(rawPos)) {
    return jsonResponse({ success: false, error: "Ingresá un código HS/NCM." }, 400);
  }

  // ---- Modo árbol (búsqueda cuando no se sabe el código exacto) ----
  if (modo === "arbol") {
    if (!(await dentroDelLimite(user.id, obtenerIp(req)))) {
      return jsonResponse({ success: false, error: "Muchas consultas seguidas — probá de nuevo en un rato." }, 429);
    }
    try {
      const { posicion, hijos } = await consultarArbol(conPuntos(rawPos), operacion);
      return jsonResponse({ success: true, modo: "arbol", posicion, hijos });
    } catch (err) {
      console.error("vuce-posicion arbol:", err instanceof Error ? err.message : String(err));
      return jsonResponse({
        success: false,
        error: "No pudimos consultar VUCE en este momento.",
        urlOficial: urlOficialDe(rawPos, operacion, pais),
      });
    }
  }

  // ---- Modo ficha ----
  const codigo = conPuntos(rawPos);
  const urlOficial = urlOficialDe(codigo, operacion, pais);

  // Cache
  try {
    const { data: cached } = await supabaseAuth
      .from("vuce_posicion_cache")
      .select("data, actualizado_en")
      .eq("posicion", codigo).eq("operacion", operacion).eq("pais", pais)
      .maybeSingle();
    if (cached && Date.now() - new Date(cached.actualizado_en).getTime() < CACHE_TTL_MS) {
      return jsonResponse({ success: true, fuente: "cache", urlOficial, ...cached.data });
    }
  } catch (e) {
    console.error("vuce-posicion cache read:", e instanceof Error ? e.message : String(e));
  }

  if (!(await dentroDelLimite(user.id, obtenerIp(req)))) {
    return jsonResponse({
      success: false,
      error: "Llegaste al límite de consultas a VUCE por hoy. Podés ver la ficha oficial directamente en el sitio de VUCE.",
      urlOficial,
    }, 429);
  }

  let ficha: any;
  try {
    ficha = await consultarFicha(codigo, operacion, pais);
  } catch (err) {
    console.error("vuce-posicion ficha:", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    return jsonResponse({
      success: false,
      error: "No pudimos traer los datos de VUCE para esta posición. Podés consultarla directamente en el sitio oficial.",
      urlOficial,
    });
  }

  // Guardar en cache (best effort)
  try {
    await supabaseAuth.from("vuce_posicion_cache").upsert({
      posicion: codigo, operacion, pais, data: ficha, actualizado_en: new Date().toISOString(),
    });
  } catch (e) {
    console.error("vuce-posicion cache write:", e instanceof Error ? e.message : String(e));
  }

  return jsonResponse({ success: true, fuente: "vuce", urlOficial, ...ficha });
});
