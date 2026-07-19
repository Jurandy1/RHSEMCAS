-- =====================================================================
-- Remunerações GIAP — últimos 2 salários por servidor
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.funcionario_remuneracoes (
  id BIGSERIAL PRIMARY KEY,
  funcionario_id BIGINT NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  competencia INTEGER NOT NULL,
  matricula TEXT,
  vencimento_base NUMERIC(12,2),
  proventos NUMERIC(12,2),
  descontos NUMERIC(12,2),
  liquido NUMERIC(12,2),
  cargo_origem TEXT,
  lotacao_giap TEXT,
  codigo_orgao TEXT,
  cpf TEXT,
  fonte TEXT NOT NULL DEFAULT 'giap',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT funcionario_remuneracoes_uk UNIQUE (funcionario_id, competencia),
  CONSTRAINT funcionario_remuneracoes_comp_chk CHECK (
    competencia >= 200001 AND competencia <= 210012
  )
);

CREATE INDEX IF NOT EXISTS idx_remun_func ON public.funcionario_remuneracoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_remun_comp ON public.funcionario_remuneracoes(competencia DESC);
CREATE INDEX IF NOT EXISTS idx_remun_mat ON public.funcionario_remuneracoes(matricula);

COMMENT ON TABLE public.funcionario_remuneracoes IS
  'Últimos salários GIAP por servidor (mantém no máximo 2 competências).';

-- Normaliza matrícula (só dígitos, sem zeros à esquerda)
CREATE OR REPLACE FUNCTION public.fn_mat_key(m text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    ltrim(regexp_replace(COALESCE(m, ''), '[^0-9]', '', 'g'), '0'),
    ''
  );
$$;

-- Alimenta remunerações a partir de folha_pmsl e mantém só 2 competências por pessoa
CREATE OR REPLACE FUNCTION public.fn_giap_alimentar_remuneracoes(p_competencia integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comp integer;
  v_upserted integer := 0;
  v_pruned integer := 0;
BEGIN
  v_comp := COALESCE(
    p_competencia,
    (SELECT MAX(competencia) FROM public.folha_pmsl)
  );
  IF v_comp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Sem competência / folha vazia');
  END IF;

  WITH src AS (
    SELECT DISTINCT ON (public.fn_mat_key(fp.matricula))
      f.id AS funcionario_id,
      fp.competencia,
      fp.matricula::text AS matricula,
      fp.vencimento_base,
      fp.proventos,
      fp.descontos,
      COALESCE(fp.liquido, COALESCE(fp.proventos, 0) - COALESCE(fp.descontos, 0)) AS liquido,
      fp.cargo_origem,
      fp.lotacao AS lotacao_giap,
      fp.codigo_orgao,
      fp.cpf,
      COALESCE(fp.fetched_at, now()) AS fetched_at
    FROM public.folha_pmsl fp
    JOIN public.funcionarios f
      ON public.fn_mat_key(f.matricula) = public.fn_mat_key(fp.matricula::text)
    WHERE fp.competencia = v_comp
      AND public.fn_mat_key(fp.matricula::text) IS NOT NULL
      AND COALESCE(f.ativo, true) = true
    ORDER BY public.fn_mat_key(fp.matricula), fp.fetched_at DESC NULLS LAST
  ),
  ups AS (
    INSERT INTO public.funcionario_remuneracoes AS r (
      funcionario_id, competencia, matricula,
      vencimento_base, proventos, descontos, liquido,
      cargo_origem, lotacao_giap, codigo_orgao, cpf, fonte, fetched_at
    )
    SELECT
      s.funcionario_id, s.competencia, s.matricula,
      s.vencimento_base, s.proventos, s.descontos, s.liquido,
      s.cargo_origem, s.lotacao_giap, s.codigo_orgao, s.cpf, 'giap', s.fetched_at
    FROM src s
    ON CONFLICT (funcionario_id, competencia) DO UPDATE SET
      matricula = EXCLUDED.matricula,
      vencimento_base = EXCLUDED.vencimento_base,
      proventos = EXCLUDED.proventos,
      descontos = EXCLUDED.descontos,
      liquido = EXCLUDED.liquido,
      cargo_origem = EXCLUDED.cargo_origem,
      lotacao_giap = EXCLUDED.lotacao_giap,
      codigo_orgao = EXCLUDED.codigo_orgao,
      cpf = EXCLUDED.cpf,
      fonte = 'giap',
      fetched_at = EXCLUDED.fetched_at
    RETURNING r.funcionario_id
  )
  SELECT COUNT(*) INTO v_upserted FROM ups;

  -- Remove competências antigas: fica só as 2 mais recentes por servidor
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY funcionario_id
        ORDER BY competencia DESC
      ) AS rn
    FROM public.funcionario_remuneracoes
  ),
  del AS (
    DELETE FROM public.funcionario_remuneracoes r
    USING ranked x
    WHERE r.id = x.id AND x.rn > 2
    RETURNING r.id
  )
  SELECT COUNT(*) INTO v_pruned FROM del;

  RETURN jsonb_build_object(
    'ok', true,
    'competencia', v_comp,
    'gravados', v_upserted,
    'podados', v_pruned
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_giap_alimentar_remuneracoes(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mat_key(text) TO authenticated;

-- View para o menu Remunerações (inclui lotação RH onde o servidor trabalha)
CREATE OR REPLACE VIEW public.v_remuneracoes_atuais AS
SELECT
  r.id,
  r.funcionario_id,
  f.nome,
  f.matricula AS matricula_rh,
  r.matricula AS matricula_giap,
  r.competencia,
  to_char(to_date(r.competencia::text || '01', 'YYYYMMDD'), 'MM/YYYY') AS competencia_fmt,
  r.vencimento_base,
  r.proventos,
  r.descontos,
  r.liquido,
  r.cargo_origem,
  r.lotacao_giap,
  r.codigo_orgao,
  r.fetched_at,
  (
    SELECT va.lotacao_nome
    FROM public.v_funcionarios_atual va
    WHERE va.funcionario_id = f.id
    LIMIT 1
  ) AS lotacao_nome,
  (
    SELECT va.caminho_lotacao
    FROM public.v_funcionarios_atual va
    WHERE va.funcionario_id = f.id
    LIMIT 1
  ) AS caminho_lotacao
FROM public.funcionario_remuneracoes r
JOIN public.funcionarios f ON f.id = r.funcionario_id
WHERE COALESCE(f.ativo, true) = true;

GRANT SELECT ON public.v_remuneracoes_atuais TO authenticated;
REVOKE ALL ON public.v_remuneracoes_atuais FROM anon;

-- RLS
ALTER TABLE public.funcionario_remuneracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_full_access ON public.funcionario_remuneracoes;
CREATE POLICY auth_full_access ON public.funcionario_remuneracoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.funcionario_remuneracoes FROM anon;
GRANT ALL ON public.funcionario_remuneracoes TO authenticated;

-- Teste opcional (descomente):
-- SELECT public.fn_giap_alimentar_remuneracoes(202606);
