-- ============================================================
-- Jawa Logistic — Permitir asientos descuadrados (con aviso, no bloqueo)
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0026_contabilidad.sql ya se hayan corrido antes.
-- ============================================================
-- crear_asiento() (0026) rechazaba directamente cualquier asiento donde
-- debe != haber. Pedido explícito: en la vida real de la empresa muchas
-- veces la carga va a quedar imperfecta (falta un dato, se carga rápido y
-- se corrige después) — el sistema tiene que dejar guardar igual y avisar
-- con un cartel en rojo en vez de bloquear. Se saca esa validación de acá;
-- el aviso en rojo se hace en la interfaz (Libro de movimientos y Balance
-- general ya muestran si algo no cuadra).
create or replace function public.crear_asiento(p_fecha date, p_descripcion text, p_origen text, p_lineas jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asiento_id uuid;
  v_suma_debe bigint;
  v_suma_haber bigint;
  v_linea jsonb;
begin
  if not public.is_staff() then
    raise exception 'No autorizado';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) < 1 then
    raise exception 'Un asiento necesita al menos una línea';
  end if;

  select coalesce(sum(coalesce((l->>'debe')::bigint, 0)), 0), coalesce(sum(coalesce((l->>'haber')::bigint, 0)), 0)
    into v_suma_debe, v_suma_haber
    from jsonb_array_elements(p_lineas) l;
  if v_suma_debe = 0 and v_suma_haber = 0 then
    raise exception 'El asiento no puede estar vacío';
  end if;
  -- Ya NO se rechaza si v_suma_debe != v_suma_haber — se guarda igual. Los
  -- listados de la interfaz (libro de movimientos, balance general) marcan
  -- en rojo cualquier asiento o balance que no cuadre.

  insert into public.asientos_contables (fecha, descripcion, origen, creado_por)
    values (p_fecha, p_descripcion, p_origen, auth.uid())
    returning id into v_asiento_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    insert into public.asiento_detalles (asiento_id, cuenta_id, debe_centavos, haber_centavos, descripcion)
      values (
        v_asiento_id,
        (v_linea->>'cuenta_id')::uuid,
        coalesce((v_linea->>'debe')::bigint, 0),
        coalesce((v_linea->>'haber')::bigint, 0),
        v_linea->>'descripcion'
      );
  end loop;

  return v_asiento_id;
end;
$$;
