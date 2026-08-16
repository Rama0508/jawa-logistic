-- ============================================================
-- Jawa Logistic — Adjuntos de cotización (Camino B de la calculadora)
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0008_proveedores_verificados.sql ya se hayan
-- corrido antes (usa public.is_staff()).
-- ============================================================

-- Bucket privado para que el cliente suba su factura proforma / packing
-- list desde hub/calculadora-importacion.html (Camino B). Convención de
-- ruta obligatoria: {cliente_id}/{producto_id}/{tipo}-{archivo} — la policy
-- de abajo usa el primer segmento de la ruta para chequear el dueño.
-- Todavía NO se procesan con IA (esa extracción automática queda para más
-- adelante) — por ahora solo quedan adjuntos para que el cliente cargue los
-- datos a mano y el staff pueda revisarlos si hace falta.
insert into storage.buckets (id, name, public)
values ('cotizacion-adjuntos', 'cotizacion-adjuntos', false)
on conflict (id) do nothing;

create policy "cotizacion_adjuntos_select_propio" on storage.objects
  for select using (
    bucket_id = 'cotizacion-adjuntos' and (
      public.is_staff()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );
create policy "cotizacion_adjuntos_insert_propio" on storage.objects
  for insert with check (
    bucket_id = 'cotizacion-adjuntos' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "cotizacion_adjuntos_delete_propio" on storage.objects
  for delete using (
    bucket_id = 'cotizacion-adjuntos' and (
      public.is_staff() or auth.uid()::text = (storage.foldername(name))[1]
    )
  );
