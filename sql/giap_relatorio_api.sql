-- =====================================================================
-- Relatório API GIAP — jobs, config, fila de revisão, folha PMSL
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

-- Folha oficial (mesmo schema do giap-sync-semcas)
CREATE TABLE IF NOT EXISTS public.folha_pmsl (
  id BIGSERIAL PRIMARY KEY,
  competencia INTEGER NOT NULL,
  codigo_instituicao INTEGER NOT NULL,
  codigo_orgao TEXT,
  lotacao TEXT,
  matricula TEXT NOT NULL,
  cpf TEXT,
  funcionario TEXT NOT NULL,
  funcionario_norm TEXT,
  cargo_origem TEXT,
  cargo_comissionado TEXT,
  horas_semanais INTEGER,
  vencimento_base NUMERIC(12,2),
  proventos NUMERIC(12,2),
  descontos NUMERIC(12,2),
  liquido NUMERIC(12,2),
  admissao DATE,
  demissao DATE,
  raw_json JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT folha_pmsl_uk UNIQUE (competencia, matricula, codigo_instituicao)
);

CREATE INDEX IF NOT EXISTS idx_folha_cpf ON public.folha_pmsl(cpf);
CREATE INDEX IF NOT EXISTS idx_folha_matricula ON public.folha_pmsl(matricula);
CREATE INDEX IF NOT EXISTS idx_folha_lotacao ON public.folha_pmsl(lotacao);
CREATE INDEX IF NOT EXISTS idx_folha_nome_norm ON public.folha_pmsl(funcionario_norm);
CREATE INDEX IF NOT EXISTS idx_folha_competencia ON public.folha_pmsl(competencia DESC);
CREATE INDEX IF NOT EXISTS idx_folha_demissao ON public.folha_pmsl(demissao) WHERE demissao IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.giap_sync_log (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,
  parametros JSONB NOT NULL DEFAULT '{}'::jsonb,
  registros_encontrados INTEGER DEFAULT 0,
  registros_inseridos INTEGER DEFAULT 0,
  registros_atualizados INTEGER DEFAULT 0,
  erro TEXT,
  duracao_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Config singleton (dia 27, automático on/off)
CREATE TABLE IF NOT EXISTS public.giap_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  automatico BOOLEAN NOT NULL DEFAULT false,
  dia_mes INTEGER NOT NULL DEFAULT 27 CHECK (dia_mes BETWEEN 1 AND 28),
  codigo_orgao TEXT NOT NULL DEFAULT '9',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO public.giap_config (id, automatico, dia_mes, codigo_orgao)
VALUES (1, false, 27, '9')
ON CONFLICT (id) DO NOTHING;

-- Jobs de sync/enriquecimento/exoneração
CREATE TABLE IF NOT EXISTS public.giap_jobs (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('ciclo_completo', 'enriquecer', 'exoneracoes', 'sync_orgao')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'error', 'cancelled')),
  modo TEXT NOT NULL DEFAULT 'manual' CHECK (modo IN ('manual', 'automatico')),
  competencia INTEGER NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  progresso_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  processados INTEGER NOT NULL DEFAULT 0,
  resumo JSONB NOT NULL DEFAULT '{}'::jsonb,
  erro TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_giap_jobs_status ON public.giap_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_giap_jobs_comp ON public.giap_jobs(competencia DESC);

CREATE TABLE IF NOT EXISTS public.giap_job_items (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES public.giap_jobs(id) ON DELETE CASCADE,
  funcionario_id BIGINT,
  matricula TEXT,
  nome TEXT,
  acao TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'skipped', 'error', 'revisao')),
  erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_giap_job_items_job ON public.giap_job_items(job_id);

-- Fila: sumiu da folha sem demissão no GIAP
CREATE TABLE IF NOT EXISTS public.giap_revisao_ausencia (
  id BIGSERIAL PRIMARY KEY,
  funcionario_id BIGINT NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  competencia INTEGER NOT NULL,
  matricula TEXT,
  nome TEXT,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'exonerado', 'ignorado')),
  job_id BIGINT REFERENCES public.giap_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (funcionario_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_giap_revisao_status ON public.giap_revisao_ausencia(status, created_at DESC);

-- View resumo para o menu
CREATE OR REPLACE VIEW public.v_giap_relatorio AS
SELECT
  (SELECT COUNT(*) FROM public.funcionarios WHERE COALESCE(ativo, true) = true) AS total_ativos,
  (SELECT COUNT(*) FROM public.funcionarios
     WHERE COALESCE(ativo, true) = true
       AND (matricula IS NULL OR trim(matricula) = '')) AS sem_matricula,
  (SELECT COUNT(*) FROM public.giap_revisao_ausencia WHERE status = 'pendente') AS revisao_pendente,
  (SELECT progresso_pct FROM public.giap_jobs ORDER BY created_at DESC LIMIT 1) AS ultimo_progresso,
  (SELECT status FROM public.giap_jobs ORDER BY created_at DESC LIMIT 1) AS ultimo_status,
  (SELECT competencia FROM public.giap_jobs ORDER BY created_at DESC LIMIT 1) AS ultima_competencia,
  (SELECT automatico FROM public.giap_config WHERE id = 1) AS automatico,
  (SELECT dia_mes FROM public.giap_config WHERE id = 1) AS dia_mes;

-- RLS
ALTER TABLE public.folha_pmsl ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giap_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giap_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giap_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giap_job_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giap_revisao_ausencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_full_access ON public.folha_pmsl;
DROP POLICY IF EXISTS auth_full_access ON public.giap_sync_log;
DROP POLICY IF EXISTS auth_full_access ON public.giap_config;
DROP POLICY IF EXISTS auth_full_access ON public.giap_jobs;
DROP POLICY IF EXISTS auth_full_access ON public.giap_job_items;
DROP POLICY IF EXISTS auth_full_access ON public.giap_revisao_ausencia;

CREATE POLICY auth_full_access ON public.folha_pmsl FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON public.giap_sync_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON public.giap_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON public.giap_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON public.giap_job_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_full_access ON public.giap_revisao_ausencia FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON public.folha_pmsl FROM anon;
REVOKE ALL ON public.giap_sync_log FROM anon;
REVOKE ALL ON public.giap_config FROM anon;
REVOKE ALL ON public.giap_jobs FROM anon;
REVOKE ALL ON public.giap_job_items FROM anon;
REVOKE ALL ON public.giap_revisao_ausencia FROM anon;

GRANT ALL ON public.folha_pmsl TO authenticated;
GRANT ALL ON public.giap_sync_log TO authenticated;
GRANT ALL ON public.giap_config TO authenticated;
GRANT ALL ON public.giap_jobs TO authenticated;
GRANT ALL ON public.giap_job_items TO authenticated;
GRANT ALL ON public.giap_revisao_ausencia TO authenticated;

GRANT SELECT ON public.v_giap_relatorio TO authenticated;
REVOKE ALL ON public.v_giap_relatorio FROM anon;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

COMMENT ON TABLE public.giap_config IS 'Configuração do Relatório API GIAP (agendamento dia 27).';
COMMENT ON TABLE public.giap_jobs IS 'Jobs de sync/enriquecimento/exoneração GIAP.';
COMMENT ON TABLE public.giap_revisao_ausencia IS 'Servidores ausentes na folha sem demissão — revisão manual.';

-- Competências já buscadas (só gravação de folha; sem auto-exonerar)
ALTER TABLE public.giap_config
  ADD COLUMN IF NOT EXISTS competencias_buscadas JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Tipos de job novos (sync_folha / buscar_demissoes)
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

-- Service role (Railway) precisa executar a RPC de exoneração
DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.fn_exonerar_funcionario(bigint, date, text) TO service_role;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'fn_exonerar_funcionario ainda não existe — rode sql/exonerados_e_sem_lotacao.sql antes.';
END $$;
