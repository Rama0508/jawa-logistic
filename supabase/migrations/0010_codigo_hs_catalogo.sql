-- ============================================================
-- Jawa Logistic — Código HS/NCM en el catálogo de Proveedores Verificados
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0009_adjuntos_cotizacion.sql ya se hayan
-- corrido antes.
-- ============================================================

-- Campo de referencia manual (nunca generado por IA — no hay base
-- arancelaria oficial en este proyecto). El staff lo completa cuando
-- conoce el código real del producto, para que el cliente lo vea en el
-- catálogo y lo tenga a mano antes de cotizar.
alter table public.proveedores_catalogo
  add column if not exists codigo_hs text;
