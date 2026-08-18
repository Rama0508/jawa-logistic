-- ============================================================
-- Jawa Logistic — Margen propio por agente + % recuperable informativo
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0016_perfil_nombre_desde_oauth.sql ya se
-- hayan corrido antes (usa la tabla agentes_carga de 0006).
-- ============================================================

-- Cambio de modelo de rentabilidad (admin.html, 2026-08-17): a partir de
-- ahora el margen de ganancia se aplica SOLO sobre el flete (lo que Jawa
-- arma/revende como servicio de transporte) — nunca sobre el FOB del
-- producto ni sobre impuestos/handling, que siempre se trasladan al costo.
-- Cada agente de carga (ej. Aerobox) tiene su propio % de margen sobre su
-- flete, en vez de compartir el "Margen de ganancia por defecto" general.
alter table public.agentes_carga
  add column if not exists margen_pct numeric not null default 50;

-- % del impuesto que sería recuperable como crédito fiscal si el importador
-- es Responsable Inscripto con factura discriminada — dato PURAMENTE
-- INFORMATIVO (se muestra en el panel para referencia), no se resta de
-- ningún costo ni afecta el cálculo de venta/ganancia.
alter table public.agentes_carga
  add column if not exists porcentaje_recuperable numeric not null default 0;
