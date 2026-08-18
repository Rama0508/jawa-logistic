-- ============================================================
-- Jawa Logistic — Captura el nombre en perfiles al crear la cuenta
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0015_club_importadores_fob.sql ya se hayan
-- corrido antes.
-- ============================================================

-- El trigger original (0002_tienda.sql) insertaba el perfil nuevo SIN
-- nombre, aunque el registro por email/contraseña ya mandaba
-- options.data.nombre al signUp() — quedaba guardado en
-- auth.users.raw_user_meta_data pero nunca se copiaba a perfiles.nombre.
-- Ahora que se suma el login con Google (que manda su propio nombre en
-- raw_user_meta_data.full_name/name, no en "nombre"), se corrige de paso
-- para los dos casos: intenta "nombre" (registro propio), si no
-- "full_name" o "name" (Google).
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, rol, nombre)
  values (
    new.id,
    'cliente',
    nullif(coalesce(
      new.raw_user_meta_data->>'nombre',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ), '')
  );
  return new;
end;
$$;
