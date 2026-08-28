// ---------- Jawa Logistic — Portal de cliente (hub): shell compartido ----------
// Requiere que antes de este archivo se hayan cargado, en este orden:
// supabase-js (CDN) → js/rates.js → js/cuenta.js.
//
// No hay sistema de templates en este sitio (HTML estático, sin build), así
// que cada página del hub trae su propio contenido ya markeado dentro de
// <div id="hub-shell"><div id="hub-page">...contenido...</div></div>, y acá
// lo "promovemos" adentro del layout de sidebar+topbar en tiempo de carga.
// Evita duplicar el sidebar/topbar en 9 archivos distintos.

const HUB_NAV_ITEMS = [
  { tab: "dashboard", href: "/hub/index.html", icon: "🏠", label: "Dashboard" },
  { tab: "requisitos-importacion", href: "/hub/requisitos-importacion.html", icon: "📋", label: "¿Qué necesito para importar?" },
  { tab: "posicion-arancelaria", href: "/hub/posicion-arancelaria.html", icon: "🔎", label: "Posición arancelaria (VUCE)" },
  { tab: "calculadora-importacion", href: "/hub/calculadora-importacion.html", icon: "🧮", label: "Calculadora de importación" },
  { tab: "calculadora-margenes", href: "/hub/calculadora-margenes.html", icon: "📈", label: "Calculadora de márgenes" },
  { tab: "despachante-virtual", href: "/hub/despachante-virtual.html", icon: "🧑‍💼", label: "Despachante virtual" },
  { tab: "proveedores-verificados", href: "/hub/proveedores-verificados.html", icon: "🛡️", label: "Proveedores Verificados" },
  { tab: "calificar-proveedor", href: "/hub/calificar-proveedor.html", icon: "⭐", label: "Calificar proveedor" },
  { tab: "cotizador", href: "/hub/cotizador.html", icon: "📦", label: "Cotizador" },
  { tab: "mis-cotizaciones", href: "/hub/mis-cotizaciones.html", icon: "🔀", label: "Comparar cotizaciones" },
  { tab: "operaciones", href: "/hub/operaciones.html", icon: "🚢", label: "Operaciones" },
  { tab: "cuenta-corriente", href: "/hub/cuenta-corriente.html", icon: "💳", label: "Cuenta corriente" },
  { tab: "documentos", href: "/hub/documentos.html", icon: "📄", label: "Documentos" },
  { tab: "courier", href: "/hub/courier.html", icon: "✈️", label: "Courier" },
  { tab: "club-importadores", href: "/hub/club-importadores.html", icon: "🏆", label: "Club de Importadores" },
  { tab: "chat", href: "/hub/chat.html", icon: "💬", label: "Soporte" },
  { tab: "notificaciones", href: "/hub/notificaciones.html", icon: "🔔", label: "Notificaciones" },
];

const HUB_TITULOS = {
  dashboard: "Dashboard",
  "requisitos-importacion": "¿Qué necesito para importar?",
  "posicion-arancelaria": "Posición arancelaria (VUCE)",
  "calculadora-importacion": "Calculadora de importación",
  "calculadora-margenes": "Calculadora de márgenes",
  "despachante-virtual": "Despachante virtual",
  "proveedores-verificados": "Proveedores Verificados",
  "calificar-proveedor": "Calificar proveedor",
  cotizador: "Cotizador",
  "mis-cotizaciones": "Comparar cotizaciones",
  operaciones: "Mis operaciones",
  "operacion-detalle": "Detalle de operación",
  "cuenta-corriente": "Cuenta corriente",
  documentos: "Documentos",
  courier: "Courier",
  "club-importadores": "Club de Importadores",
  chat: "Soporte",
  notificaciones: "Notificaciones",
};

// escHtml() vive en js/rates.js (se carga antes que este archivo en todas
// las páginas del hub) para poder reusarla también en tienda/checkout/admin.

function fmtCentavos(centavos) {
  return ((centavos || 0) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

function fmtFecha(iso) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtFechaHora(iso) {
  return new Date(iso).toLocaleString("es-AR");
}

const HUB_ESTADO_LABEL = {
  cotizado: "Cotizado",
  deposito_confirmado: "Depósito confirmado",
  en_transito: "En tránsito",
  en_aduana: "En aduana",
  liberado: "Liberado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

// Secuencia "normal" de una operación (cancelado queda afuera, es un
// estado terminal aparte) — se usa para el tracking visual tipo delivery
// app en hub/operacion.html: qué pasos ya se cumplieron y cuál falta.
const HUB_ESTADO_ORDEN = ["cotizado", "deposito_confirmado", "en_transito", "en_aduana", "liberado", "entregado"];
const HUB_ESTADO_ICONO = {
  cotizado: "📝",
  deposito_confirmado: "💰",
  en_transito: "🚢",
  en_aduana: "🛃",
  liberado: "✅",
  entregado: "📦",
  cancelado: "✕",
};

function renderHubShell(tabActiva, session, contenidoPagina) {
  const navHtml = HUB_NAV_ITEMS.map((item) => `
    <a href="${item.href}" data-tab="${item.tab}" class="${item.tab === tabActiva ? "active" : ""}">
      <span class="hub-nav-icon">${item.icon}</span> ${item.label}
    </a>
  `).join("");

  return `
    <div class="hub-layout">
      <aside class="hub-sidebar" id="hub-sidebar">
        <a class="hub-brand" href="/hub/index.html">
          <svg width="32" height="32" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="92" fill="none" stroke="#ffffff" stroke-width="7"/>
            <polygon points="100,100 100,15 121,79" fill="#c9502e"/>
            <polygon points="100,100 100,15 79,79" fill="#a23f22"/>
            <polygon points="100,100 121,79 185,100" fill="#2c436f"/>
            <polygon points="100,100 185,100 121,121" fill="#16223d"/>
            <polygon points="100,100 121,121 100,185" fill="#2c436f"/>
            <polygon points="100,100 100,185 79,121" fill="#16223d"/>
            <polygon points="100,100 79,121 15,100" fill="#2c436f"/>
            <polygon points="100,100 15,100 79,79" fill="#16223d"/>
            <circle cx="100" cy="100" r="7" fill="#ffffff"/>
          </svg>
          <div>
            <span class="hub-brand-name" style="display:block;">Jawa Logistic</span>
            <span class="hub-brand-tag">Portal de cliente</span>
          </div>
        </a>
        <nav class="hub-nav">${navHtml}</nav>
        <div class="hub-sidebar-footer">
          <a href="/mi-cuenta.html">🛍️ Mis compras (tienda)</a>
          <a href="/index.html">← Volver al sitio</a>
          <button id="hub-logout-btn" type="button">🚪 Cerrar sesión</button>
        </div>
      </aside>
      <div class="hub-main">
        <div class="hub-topbar">
          <button class="hub-nav-toggle" id="hub-nav-toggle" aria-label="Abrir menú" type="button">☰</button>
          <div class="hub-topbar-title">${HUB_TITULOS[tabActiva] || ""}</div>
          <div class="hub-bell">
            <button class="hub-bell-btn" id="hub-bell-btn" type="button" aria-label="Notificaciones">
              🔔<span class="hub-bell-badge" id="hub-bell-badge" style="display:none;">0</span>
            </button>
            <div class="hub-bell-dropdown" id="hub-bell-dropdown"></div>
          </div>
        </div>
        <main class="hub-content" id="hub-page">${contenidoPagina || ""}</main>
      </div>
    </div>
  `;
}

function hubNotifItemHtml(n) {
  const cuerpo = n.cuerpo ? `<div class="hub-bell-item-body">${escHtml(n.cuerpo)}</div>` : "";
  return `
    <a href="#" class="hub-bell-item ${n.leida ? "" : "unread"}" data-notif-id="${escHtml(n.id)}" data-notif-link="${escHtml(n.link || "")}">
      <div class="hub-bell-item-title">${escHtml(n.titulo)}</div>
      ${cuerpo}
      <div class="hub-bell-item-body">${fmtFechaHora(n.creado_en)}</div>
    </a>
  `;
}

async function hubCargarNotificaciones(clienteId) {
  const badge = document.getElementById("hub-bell-badge");
  const dropdown = document.getElementById("hub-bell-dropdown");
  if (!dropdown) return;

  const { data, error } = await supabaseClient
    .from("notificaciones")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("creado_en", { ascending: false })
    .limit(8);
  if (error) { console.error("No se pudieron cargar las notificaciones:", error); return; }

  const noLeidas = (data || []).filter((n) => !n.leida).length;
  if (badge) {
    badge.textContent = String(noLeidas);
    badge.style.display = noLeidas > 0 ? "flex" : "none";
  }

  dropdown.innerHTML = (data && data.length)
    ? data.map(hubNotifItemHtml).join("") + `<a class="hub-bell-footer" href="/hub/notificaciones.html">Ver todas</a>`
    : `<div class="hub-bell-empty">Sin notificaciones todavía.</div>`;

  dropdown.querySelectorAll("[data-notif-id]").forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.preventDefault();
      const id = el.dataset.notifId;
      const link = el.dataset.notifLink;
      await supabaseClient.from("notificaciones").update({ leida: true }).eq("id", id);
      if (link) location.href = link;
      else hubCargarNotificaciones(clienteId);
    });
  });
}

function hubSuscribirNotificaciones(clienteId) {
  supabaseClient
    .channel(`hub-notificaciones-${clienteId}`)
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "notificaciones", filter: `cliente_id=eq.${clienteId}`,
    }, () => hubCargarNotificaciones(clienteId))
    .subscribe();
}

// Rellena #hub-shell con el layout completo y devuelve la sesión activa (o
// null si no había sesión — requerirSesion ya redirigió a /mi-cuenta.html).
async function iniciarHub(tabActiva) {
  const session = await requerirSesion();
  if (!session) return null;

  const shellEl = document.getElementById("hub-shell");
  const pageEl = document.getElementById("hub-page");
  const contenidoPagina = pageEl ? pageEl.innerHTML : "";
  shellEl.innerHTML = renderHubShell(tabActiva, session, contenidoPagina);

  document.getElementById("hub-logout-btn").addEventListener("click", async () => {
    await cerrarSesionCliente();
    location.href = "/index.html";
  });

  document.getElementById("hub-nav-toggle").addEventListener("click", () => {
    document.getElementById("hub-sidebar").classList.toggle("open");
  });

  const bellBtn = document.getElementById("hub-bell-btn");
  const bellDropdown = document.getElementById("hub-bell-dropdown");
  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    bellDropdown.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!bellDropdown.contains(e.target) && e.target !== bellBtn) bellDropdown.classList.remove("open");
  });

  await hubCargarNotificaciones(session.user.id);
  hubSuscribirNotificaciones(session.user.id);

  return session;
}
