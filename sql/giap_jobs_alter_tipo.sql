-- =====================================================================
-- Amplia o CHECK de giap_jobs.tipo para aceitar 'auditoria_saidas'
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

ALTER TABLE public.giap_jobs
  DROP CONSTRAINT IF EXISTS giap_jobs_tipo_check;

ALTER TABLE public.giap_jobs
  ADD CONSTRAINT giap_jobs_tipo_check CHECK (
    tipo IN (
      'ciclo_completo',
      'enriquecer',
      'exoneracoes',
      'sync_orgao',
      'sync_folha',
      'buscar_demissoes',
      'auditoria_saidas'
    )
  );

NOTIFY pgrst, 'reload schema';
