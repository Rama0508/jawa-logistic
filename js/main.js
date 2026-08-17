// ---------- Menú mobile ----------
try {
  (function () {
    const toggle = document.getElementById("nav-toggle");
    const links = document.getElementById("nav-links");
    if (!toggle || !links) return;
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  })();
} catch (e) { console.error("menu mobile:", e); }

// ---------- Submenú "Conocenos" del nav (Nosotros, Cómo funciona, etc.) ----------
try {
  (function () {
    document.querySelectorAll(".nav-dropdown-toggle").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const dropdown = btn.closest(".nav-dropdown");
        const abierto = dropdown.classList.toggle("open");
        btn.setAttribute("aria-expanded", abierto ? "true" : "false");
      });
    });
    document.addEventListener("click", () => {
      document.querySelectorAll(".nav-dropdown.open").forEach((d) => {
        d.classList.remove("open");
        d.querySelector(".nav-dropdown-toggle").setAttribute("aria-expanded", "false");
      });
    });
  })();
} catch (e) { console.error("submenú nav:", e); }

// ---------- Botón flotante de WhatsApp ----------
try {
  (function () {
    var btn = document.getElementById("float-wa");
    var hero = document.getElementById("top");
    if (!btn || !hero) return;
    function check() {
      var show = window.scrollY > hero.offsetHeight * 0.6;
      btn.classList.toggle("show", show);
    }
    window.addEventListener("scroll", check, { passive: true });
    check();
  })();
} catch (e) { console.error("whatsapp flotante:", e); }

// ---------- Reveal on scroll ----------
try {
  (function () {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var items = document.querySelectorAll(".reveal");
    if (reduce || !("IntersectionObserver" in window)) {
      return; // .reveal ya es visible por defecto en el CSS
    }
    document.documentElement.classList.add("js-reveal-ready");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    items.forEach(function (el) { io.observe(el); });
    // Red de seguridad: si algo falla y nunca se marca visible, mostrar igual a los 2.5s.
    setTimeout(function () {
      items.forEach(function (el) { el.classList.add("is-visible"); });
    }, 2500);
  })();
} catch (e) { console.error("reveal on scroll:", e); }

// ---------- Partículas flotantes del hero ----------
// Animación liviana (sin video, sin librerías): triangulitos que suben
// despacio sobre la foto de fondo, para que el hero no quede del todo
// estático. Se desactiva si el usuario prefiere menos movimiento.
try {
  (function () {
    const canvas = document.getElementById("hero-particles");
    const hero = document.getElementById("top");
    if (!canvas || !hero) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    let w, h, dpr;
    let particulas = [];

    function crearParticulas() {
      const cantidad = Math.round((w * h) / 45000); // densidad ~ constante según el tamaño del hero
      particulas = Array.from({ length: Math.min(45, Math.max(14, cantidad)) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 4 + Math.random() * 7,
        velY: 0.15 + Math.random() * 0.3,
        velX: (Math.random() - 0.5) * 0.15,
        alpha: 0.08 + Math.random() * 0.16,
      }));
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = hero.clientWidth;
      h = hero.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      crearParticulas();
    }

    function dibujarTriangulo(p) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - p.r);
      ctx.lineTo(p.x - p.r * 0.87, p.y + p.r * 0.5);
      ctx.lineTo(p.x + p.r * 0.87, p.y + p.r * 0.5);
      ctx.closePath();
      ctx.fillStyle = `rgba(215, 182, 134, ${p.alpha})`;
      ctx.fill();
    }

    function tick() {
      ctx.clearRect(0, 0, w, h);
      particulas.forEach((p) => {
        p.y -= p.velY;
        p.x += p.velX;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        dibujarTriangulo(p);
      });
      requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(tick);
  })();
} catch (e) { console.error("partículas del hero:", e); }

// ---------- Config oculta ----------
const FLETE_USD_KG = 80; // tarifa interna, no se muestra en ningún lado

// ---------- Config editable por vos (Jawa Logistic) ----------
const TELEFONO_NOTIFICACION = "+54 9 381 331-2280"; // único número visible para el cliente, compartido por los dos orígenes
// El detalle de depósitos (China/Miami) y el flujo de "Armá tu pedido" +
// post-compra vive en js/mi-pedido.js (mi-pedido.html) desde que se sacó
// ese wizard de la home — acá solo queda la cotización rápida del hero.

// ---------- Cotizador rápido (hero) ----------
try {
  (function () {
    const btn = document.getElementById("qq-calcular");
    if (!btn) return;
    esperarTarifasPara(btn, "Cargando…");
    const parseNumQQ = (str) => {
      const n = parseFloat(String(str || "").trim().replace(",", "."));
      return isNaN(n) ? 0 : n;
    };
    const fmtQQ = (n) => (n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Margen fijo de embalaje (caja, papeles, relleno) que se suma al peso
    // total estimado — no es exacto, solo para que la estimación de flete
    // no quede corta por no contar el packaging.
    const EMBALAJE_GRAMOS = 100;

    function pesoTotalEstimadoG() {
      const pesoRaw = parseNumQQ(document.getElementById("qq-peso").value);
      const unidad = document.getElementById("qq-peso-unidad").value;
      const cant = parseNumQQ(document.getElementById("qq-cantidad").value) || 1;
      const pesoUnitG = unidad === "kg" ? pesoRaw * 1000 : pesoRaw;
      if (!pesoUnitG) return 0;
      return pesoUnitG * cant + EMBALAJE_GRAMOS;
    }

    function actualizarPesoTotal() {
      const totalG = pesoTotalEstimadoG();
      const campo = document.getElementById("qq-peso-total");
      if (!totalG) { campo.value = "0 g"; return; }
      campo.value = totalG >= 1000
        ? (totalG / 1000).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kg"
        : Math.round(totalG) + " g";
    }
    ["qq-peso", "qq-peso-unidad", "qq-cantidad"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", actualizarPesoTotal);
    });
    actualizarPesoTotal();

    btn.addEventListener("click", () => {
      const nombre = document.getElementById("qq-nombre").value.trim();
      const fob = parseNumQQ(document.getElementById("qq-fob").value);
      const pesoRaw = parseNumQQ(document.getElementById("qq-peso").value);
      const unidad = document.getElementById("qq-peso-unidad").value;
      const cant = parseNumQQ(document.getElementById("qq-cantidad").value) || 1;

      if (!fob && !pesoRaw) {
        alert("Cargá al menos el precio FOB o el peso para calcular.");
        return;
      }

      const pesoTotalKg = pesoTotalEstimadoG() / 1000;
      const pagoProveedor = fob * cant;
      const pagoFlete = pesoTotalKg * FLETE_USD_KG;
      const total = pagoProveedor + pagoFlete;

      // Desglosado para que se entienda qué se le paga al proveedor y qué
      // es flete — dos pagos distintos, no un solo número sin explicar.
      document.getElementById("qq-result-proveedor-val").textContent = "U$" + fmtQQ(pagoProveedor);
      document.getElementById("qq-result-flete-val").textContent = "U$" + fmtQQ(pagoFlete);
      document.getElementById("qq-result-val").textContent = "U$" + fmtQQ(total);
      document.getElementById("qq-result").style.display = "flex";

      const texto = `Hola! Quiero cotizar un producto con Jawa Logistic:
${nombre ? `Producto: ${nombre}\n` : ""}FOB unitario: USD ${fmtQQ(fob)}
Peso por unidad: ${pesoRaw || 0} ${unidad}
Cantidad: ${cant}
Peso total estimado: ${document.getElementById("qq-peso-total").value}
Pagás a tu proveedor: U$${fmtQQ(pagoProveedor)}
Pagás de flete: U$${fmtQQ(pagoFlete)}
Total estimado: U$${fmtQQ(total)}`;
      const numero = TELEFONO_NOTIFICACION.replace(/[^\d]/g, "");
      document.getElementById("qq-wa-btn").href = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
    });
  })();
} catch (e) { console.error("cotizador rápido:", e); }

// ---------- Año del footer ----------
// El wizard "Armá tu pedido" + flujo post-compra y el analizador de
// requisitos se movieron fuera de este archivo (js/mi-pedido.js y
// hub/requisitos-importacion.html) cuando se sacó todo eso de la home.
try {
  const anioEl = document.getElementById("anio-actual");
  if (anioEl) anioEl.textContent = new Date().getFullYear();
} catch (e) { console.error("año footer:", e); }

window.addEventListener("error", (e) => {
  console.error("Error en la página:", e.message, e.filename, e.lineno);
});
