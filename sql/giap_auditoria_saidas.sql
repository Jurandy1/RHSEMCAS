-- =====================================================================
-- Auditoria de Saídas GIAP — resultado persistido do job auditoria_saidas
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.giap_auditoria_saidas (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL,
  funcionario_id BIGINT NOT NULL,
  matricula TEXT,
  nome TEXT,
  status TEXT NOT NULL,
  competencia INTEGER,
  demissao DATE,
  fonte TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, funcionario_id)
);

COMMENT ON TABLE public.giap_auditoria_saidas IS
  'Veredito por servidor de cada execução do job auditoria_saidas (Render).';
COMMENT ON COLUMN public.giap_auditoria_saidas.status IS
  'ativo_compref | candidato_exo | sumiu | sem_historico | pendente';

CREATE INDEX IF NOT EXISTS idx_giap_auditoria_saidas_job
  ON public.giap_auditoria_saidas (job_id);
CREATE INDEX IF NOT EXISTS idx_giap_auditoria_saidas_func
  ON public.giap_auditoria_saidas (funcionario_id);
CREATE INDEX IF NOT EXISTS idx_giap_auditoria_saidas_status
  ON public.giap_auditoria_saidas (status);

GRANT SELECT ON public.giap_auditoria_saidas TO authenticated;

NOTIFY pgrst, 'reload schema';
