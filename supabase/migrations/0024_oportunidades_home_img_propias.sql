-- ============================================================
-- Jawa Logistic — Autohospedar las fotos de "Cuánto podrías ganar" (home)
-- Pegá este archivo completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Requiere que 0001_init.sql a 0023_limite_uso_ia.sql ya se hayan corrido antes.
-- ============================================================
-- Las 4 fotos de oportunidades_home apuntaban a Pexels/Unsplash — Lighthouse
-- marcó las de Pexels por las cookies de terceros que esos dominios ponen
-- (issue "third-party-cookies"). Las 4 imágenes ya están en el repo, en
-- images/oportunidades/ (el Dockerfile copia esa carpeta al build), así que
-- solo actualizamos la URL para que se sirvan desde el propio dominio (de
-- paso, una carga más rápida: mismo origen, sin ida y vuelta a un CDN externo).
update public.oportunidades_home set imagen_url = '/images/oportunidades/anillo-inteligente.jpg'
  where imagen_url like '%unsplash.com/photo-1744697307482%';
update public.oportunidades_home set imagen_url = '/images/oportunidades/soporte-notebook.jpg'
  where imagen_url like '%pexels.com/photos/34502055%';
update public.oportunidades_home set imagen_url = '/images/oportunidades/cargador-inalambrico.jpg'
  where imagen_url like '%unsplash.com/photo-1575543419095%';
update public.oportunidades_home set imagen_url = '/images/oportunidades/mini-impresora.jpg'
  where imagen_url like '%pexels.com/photos/34223368%';
