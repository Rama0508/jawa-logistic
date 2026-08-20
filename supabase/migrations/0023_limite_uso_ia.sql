-- ============================================================
-- Jawa Logistic — Límite de uso semanal para las funciones de IA
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0022_guias_blog.sql ya se hayan corrido antes.
-- ============================================================
-- Las 3 Edge Functions que llaman a Anthropic (despachante-virtual,
-- clasificar-producto, extract-product) exigen sesión, pero nada les impedía
-- a un mismo cliente (o a alguien con varias cuentas desde la misma
-- conexión) llamarlas sin límite y comerse el crédito rápido. Este límite es
-- independiente por función — 5 usos por cuenta Y 5 por IP cada 7 días, lo
-- que se alcance primero — así ningún atajo (crear otra cuenta desde la
-- misma red, o usar la misma cuenta desde otra red) lo esquiva del todo.
create table public.ia_uso_limite (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('despachante_virtual', 'clasificar_producto', 'extract_product')),
  user_id uuid not null references auth.users(id),
  ip text not null,
  creado_en timestamptz not null default now()
);
alter table public.ia_uso_limite enable row level security;
-- Sin políticas para anon/authenticated a propósito: nadie puede leer ni
-- escribir esta tabla directo (ni ver cuántos usos les quedan a otros, ni
-- borrar sus propios registros para saltarse el límite). Solo la accede la
-- función de abajo, que corre security definer.

-- Chequea el límite y, si todavía hay lugar, registra el uso — todo en una
-- sola transacción (evita que dos pedidos simultáneos se cuelen los dos
-- pasándose del límite por una carrera entre el conteo y el insert).
-- Devuelve true si se permitió (y ya quedó registrado), false si se superó
-- el límite (nada se registra en ese caso).
create or replace function public.chequear_limite_ia(p_tipo text, p_user_id uuid, p_ip text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite constant int := 5;
  v_ventana constant interval := interval '7 days';
  v_count_usuario int;
  v_count_ip int;
begin
  select count(*) into v_count_usuario
  from public.ia_uso_limite
  where tipo = p_tipo and user_id = p_user_id and creado_en > now() - v_ventana;

  select count(*) into v_count_ip
  from public.ia_uso_limite
  where tipo = p_tipo and ip = p_ip and creado_en > now() - v_ventana;

  if v_count_usuario >= v_limite or v_count_ip >= v_limite then
    return false;
  end if;

  insert into public.ia_uso_limite (tipo, user_id, ip) values (p_tipo, p_user_id, p_ip);
  return true;
end;
$$;
-- Grant a anon (no a authenticated): las Edge Functions llaman esta función
-- con la anon key pública, no con el JWT del usuario — mismo patrón que
-- buscar_ncm_biblioteca (0012_biblioteca_ncm.sql). El chequeo de que
-- p_user_id sea un usuario real y logueado ya lo hizo la Edge Function antes
-- de llegar acá.
grant execute on function public.chequear_limite_ia(text, uuid, text) to anon, authenticated;

create index on public.ia_uso_limite (tipo, user_id, creado_en);
create index on public.ia_uso_limite (tipo, ip, creado_en);
