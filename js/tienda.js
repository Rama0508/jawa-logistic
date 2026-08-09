// ---------- Jawa Logistic — Tienda: carrito + carga de productos ----------
// Compartido por tienda.html, cursos.html, producto.html, curso.html,
// carrito.html y checkout.html. Requiere que rates.js ya haya corrido antes
// (usa el mismo `supabaseClient` global — no crea uno nuevo).
//
// El carrito vive en localStorage como [{producto_id, cantidad}], NUNCA con
// el precio adentro: el precio real siempre se vuelve a consultar en
// Supabase al mostrar el carrito o al pagar, para que nadie pueda alterar un
// precio editando localStorage a mano.

const CARRITO_KEY = "jawa_carrito_v1";

function fmtCentavos(centavos) {
  return ((centavos || 0) / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

function leerCarrito() {
  try {
    const raw = localStorage.getItem(CARRITO_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch (e) {
    console.error("No se pudo leer el carrito guardado:", e);
    return [];
  }
}

function guardarCarrito(items) {
  try {
    localStorage.setItem(CARRITO_KEY, JSON.stringify(items));
  } catch (e) {
    console.error("No se pudo guardar el carrito:", e);
  }
  document.dispatchEvent(new CustomEvent("carrito-actualizado", { detail: { items } }));
}

function agregarAlCarrito(productoId, cantidad) {
  cantidad = Math.max(1, Math.floor(Number(cantidad) || 1));
  const items = leerCarrito();
  const existente = items.find((it) => it.producto_id === productoId);
  if (existente) existente.cantidad += cantidad;
  else items.push({ producto_id: productoId, cantidad });
  guardarCarrito(items);
}

function actualizarCantidadCarrito(productoId, cantidad) {
  cantidad = Math.floor(Number(cantidad) || 0);
  let items = leerCarrito();
  if (cantidad <= 0) {
    items = items.filter((it) => it.producto_id !== productoId);
  } else {
    const existente = items.find((it) => it.producto_id === productoId);
    if (existente) existente.cantidad = cantidad;
  }
  guardarCarrito(items);
}

function quitarDelCarrito(productoId) {
  const items = leerCarrito().filter((it) => it.producto_id !== productoId);
  guardarCarrito(items);
}

function vaciarCarrito() {
  guardarCarrito([]);
}

function contarItemsCarrito() {
  return leerCarrito().reduce((acc, it) => acc + it.cantidad, 0);
}

// Trae del servidor los datos REALES (precio, stock, activo) de los
// productos que están en el carrito — nunca confiar en nada guardado en el
// navegador para calcular un total.
async function obtenerCarritoConDatos() {
  const items = leerCarrito();
  if (!items.length) return [];
  if (!supabaseClient) return [];
  const ids = items.map((it) => it.producto_id);
  const { data, error } = await supabaseClient
    .from("productos")
    .select("id, tipo, nombre, slug, precio_centavos, stock, peso_gramos, imagenes, activo")
    .in("id", ids);
  if (error) {
    console.error("No se pudieron cargar los datos del carrito:", error);
    return [];
  }
  return items
    .map((it) => {
      const producto = (data || []).find((p) => p.id === it.producto_id);
      if (!producto || !producto.activo) return null;
      return { ...producto, cantidad: it.cantidad };
    })
    .filter(Boolean);
}

async function cargarProductos(tipo) {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("productos")
    .select("id, tipo, nombre, slug, descripcion, precio_centavos, stock, imagenes, activo")
    .eq("tipo", tipo)
    .eq("activo", true)
    .order("creado_en", { ascending: false });
  if (error) {
    console.error(`No se pudieron cargar los productos (tipo=${tipo}):`, error);
    return [];
  }
  return data || [];
}

async function cargarProductoPorSlug(slug) {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("productos")
    .select("id, tipo, nombre, slug, descripcion, precio_centavos, stock, peso_gramos, imagenes, activo")
    .eq("slug", slug)
    .eq("activo", true)
    .maybeSingle();
  if (error) {
    console.error("No se pudo cargar el producto:", error);
    return null;
  }
  return data;
}

function primeraImagen(producto) {
  const imgs = Array.isArray(producto.imagenes) ? producto.imagenes : [];
  return imgs[0] || null;
}

// ---------- Contador del carrito en el navbar (si existe #cart-count) ----------
try {
  (function () {
    function actualizarBadge() {
      const el = document.getElementById("cart-count");
      if (!el) return;
      const n = contarItemsCarrito();
      el.textContent = String(n);
      el.style.display = n > 0 ? "inline-flex" : "none";
    }
    document.addEventListener("carrito-actualizado", actualizarBadge);
    document.addEventListener("DOMContentLoaded", actualizarBadge);
    actualizarBadge();
  })();
} catch (e) {
  console.error("contador de carrito:", e);
}
