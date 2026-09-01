-- =====================================================================
-- Amplia o CHECK de giap_jobs.modo para aceitar 'continuar'
--
-- Causa raiz do "para no lote 1": o backend (agendarProximoLote em
-- giap-sync-semcas/src/jobs.js) já cria o próximo lote sozinho, sem
-- depender do navegador, mas o INSERT do job de continuação usa
-- modo='continuar' — valor que o CHECK constraint original de giap_jobs
-- nunca permitiu (só 'manual' foi usado até hoje). O Postgres rejeita a
-- linha, a falha é só logada no servidor (nunca aparece pro usuário), e o
-- job anterior fica marcado done_parcial/continuara=true pra sempre, sem
-- nenhum job seguinte ser criado.
--
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

ALTER TABLE public.giap_jobs
  DROP CONSTRAINT IF EXISTS giap_jobs_modo_check;

ALTER TABLE public.giap_jobs
  ADD CONSTRAINT giap_jobs_modo_check CHECK (
    modo IN (
      'manual',
      'automatico',
      'continuar'
    )
  );

NOTIFY pgrst, 'reload schema';
