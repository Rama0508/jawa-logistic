-- ============================================================
-- Jawa Logistic — Tarifas del "Marítimo blanco" (solo panel interno)
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0027_asientos_permitir_descuadrados.sql ya se
-- hayan corrido antes.
-- ============================================================
--
-- En admin.html el marítimo se abrió en dos vías internas:
--   • Marítimo genérico — cobra por m³ reales × tarifa (filas sea_china /
--     sea_miami que ya existen), sin mínimo de CBM ni regla peso/volumen.
--   • Marítimo blanco — circuito formal, cobra ÚNICAMENTE por peso, con
--     tramo fijo (todos los kilos a la tarifa del tramo, no escalonado):
--       - hasta el corte de peso  → tarifa alta (USD/kg)
--       - pasado el corte         → tarifa baja (USD/kg)
--
-- Estas tres filas son editables desde admin.html → pestaña Datos → Tarifas.
-- Los cotizadores públicos NO usan ninguna de estas tarifas.

insert into public.tarifas (id, valor, unidad) values
  ('mar_blanco_alta', 9.99, 'usd_kg'),
  ('mar_blanco_baja', 5.5,  'usd_kg'),
  ('mar_blanco_corte', 100, 'kg')
on conflict (id) do nothing;
