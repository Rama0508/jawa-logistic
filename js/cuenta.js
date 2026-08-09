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

async function registrarCliente(email, password, nombre) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { nombre: nombre || "" } },
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

// Usar en páginas que requieren login (checkout, mi-cuenta): si no hay
// sesión, manda a mi-cuenta.html y vuelve a esta misma página después.
async function requerirSesion() {
  const session = await obtenerSesionActual();
  if (!session) {
    const volver = encodeURIComponent(location.pathname + location.search);
    location.href = `mi-cuenta.html?volver=${volver}`;
    return null;
  }
  return session;
}
