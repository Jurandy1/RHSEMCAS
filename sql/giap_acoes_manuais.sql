-- =====================================================================
-- GIAP: competênciasências buscadas + tipos de job (rodar no Supabase SQL Editor)
-- =====================================================================

ALTER TABLE public.giap_config
  ADD COLUMN IF NOT EXISTS competencias_buscadas JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  ALTER TABLE public.giap_jobs DROP CONSTRAINT IF EXISTS giap_jobs_tipo_check;
  ALTER TABLE public.giap_jobs
    ADD CONSTRAINT giap_jobs_tipo_check
    CHECK (tipo IN (
      'ciclo_completo',
      'enriquecer',
      'exoneracoes',
      'sync_orgao',
      'sync_folha',
      'buscar_demissoes'
    ));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Ajuste de giap_jobs_tipo_check: %', SQLERRM;
END $$;
