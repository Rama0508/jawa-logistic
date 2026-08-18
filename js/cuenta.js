// ---------- Jawa Logistic — Cuenta de cliente (login/registro) ----------
// Requiere rates.js ya cargado (usa el mismo `supabaseClient` global).
// Separado de la lógica de login de admin.html a propósito: son dos
// audiencias distintas (cliente vs staff) aunque usen el mismo backend de
// Supabase Auth — cualquier cuenta nueva se crea como rol 'cliente' por el
// trigger de la base (ver supabase/migrations/0002_tienda.sql).

async function obtenerSesionActual() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data.session || null;
}

// codigoReferido (opcional): el código de invitación de otro cliente, si se
// registró usando un link tipo /mi-cuenta.html?ref=CODIGO. Se manda como
// metadata del signUp — el trigger crear_perfil_nuevo_usuario() (migración
// 0021) lo lee de ahí para guardar quién invitó a este cliente nuevo.
async function registrarCliente(email, password, nombre, codigoReferido) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { nombre: nombre || "", codigo_referido_usado: codigoReferido || "" } },
  });
  if (error) return { ok: false, error: error.message };
  // Si el proyecto tiene confirmación de email activada, todavía no hay
  // sesión hasta que confirme — se lo avisamos al usuario en la UI.
  return { ok: true, necesitaConfirmacion: !data.session };
}

async function iniciarSesionCliente(email, password) {
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function cerrarSesionCliente() {
  await supabaseClient.auth.signOut();
}

// Login/registro con Google en un solo paso (Supabase crea la cuenta sola la
// primera vez que alguien entra así — no hace falta un "modo registro"
// separado como con email/contraseña). Manda a la pantalla de consentimiento
// de Google y vuelve a "redirectTo"; supabase-js detecta la sesión sola al
// volver (detectSessionInUrl, prendido por default). Requiere que el
// provider Google esté habilitado en Supabase (Dashboard → Authentication →
// Providers) y que "redirectTo" esté en la lista de Redirect URLs permitidas
// ahí mismo — si no, Supabase rechaza el redirect antes de llegar a Google.
async function iniciarSesionGoogle(volver) {
  const redirectTo = location.origin + "/mi-cuenta.html" + (volver ? `?volver=${encodeURIComponent(volver)}` : "");
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true }; // si no hubo error, el navegador ya está siendo redirigido a Google
}

// Usar en páginas que requieren login (checkout, mi-cuenta, hub): si no hay
// sesión, manda a /mi-cuenta.html y vuelve a esta misma página después. Ruta
// ABSOLUTA a propósito (no "mi-cuenta.html" relativo): páginas del hub viven
// en /hub/*.html, y una ruta relativa ahí resolvería a /hub/mi-cuenta.html
// (404). El sitio siempre se sirve desde la raíz (ver nginx.conf), así que
// "/mi-cuenta.html" es válido sin importar desde qué carpeta se llame esto.
async function requerirSesion() {
  const session = await obtenerSesionActual();
  if (!session) {
    const volver = encodeURIComponent(location.pathname + location.search);
    location.href = `/mi-cuenta.html?volver=${volver}`;
    return null;
  }
  return session;
}
