-- =====================================================================
-- Exonerados / Demitidos / Falecimento / Outros
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS data_exoneracao date;

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS motivo_saida text;

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS tipo_saida text;

COMMENT ON COLUMN public.funcionarios.data_exoneracao IS
  'Data da saída do quadro ativo (exoneração, demissão, falecimento ou outros).';
COMMENT ON COLUMN public.funcionarios.motivo_saida IS
  'Texto livre do motivo da saída.';
COMMENT ON COLUMN public.funcionarios.tipo_saida IS
  'EXONERACAO | DEMISSAO_TERCEIRIZADO | FALECIMENTO | OUTROS';

-- Backfill dos já inativos com data de saída
UPDATE public.funcionarios
SET tipo_saida = CASE
  WHEN NULLIF(trim(matricula), '') IS NOT NULL THEN 'EXONERACAO'
  ELSE 'DEMISSAO_TERCEIRIZADO'
END
WHERE ativo = false
  AND data_exoneracao IS NOT NULL
  AND (tipo_saida IS NULL OR trim(tipo_saida) = '');

-- Remove sobrecargas antigas de exonera / atualizar / reativar
DO $cleanup$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS assinatura
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'fn_exonerar_funcionario',
        'fn_atualizar_saida_funcionario',
        'fn_reativar_funcionario'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.assinatura);
  END LOOP;
END
$cleanup$;

-- Exonerar / demitir / falecimento / outros
CREATE OR REPLACE FUNCTION public.fn_exonerar_funcionario(
  p_funcionario_id bigint,
  p_data_exoneracao date DEFAULT CURRENT_DATE,
  p_motivo text DEFAULT NULL,
  p_tipo_saida text DEFAULT 'EXONERACAO'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo text;
  v_lotacoes_encerradas int := 0;
BEGIN
  IF p_funcionario_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário não informado.';
  END IF;
  IF p_data_exoneracao IS NULL THEN
    RAISE EXCEPTION 'Informe a data da saída.';
  END IF;

  v_tipo := upper(trim(COALESCE(p_tipo_saida, 'EXONERACAO')));
  IF v_tipo NOT IN ('EXONERACAO', 'DEMISSAO_TERCEIRIZADO', 'FALECIMENTO', 'OUTROS') THEN
    RAISE EXCEPTION 'Tipo de saída inválido: %', v_tipo;
  END IF;
  IF v_tipo = 'OUTROS' AND NULLIF(trim(COALESCE(p_motivo, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo quando o tipo for OUTROS.';
  END IF;

  UPDATE public.funcionario_lotacao
  SET
    ativo = false,
    data_fim = COALESCE(data_fim, p_data_exoneracao),
    observacao = CASE
      WHEN observacao IS NULL OR trim(observacao) = '' THEN
        'Encerrada por saída em ' || to_char(p_data_exoneracao, 'DD/MM/YYYY')
      WHEN observacao ~* 'Encerrada por (exoneração|saída) em' THEN observacao
      ELSE observacao || ' | Encerrada por saída em ' || to_char(p_data_exoneracao, 'DD/MM/YYYY')
    END
  WHERE funcionario_id = p_funcionario_id
    AND ativo = true;

  GET DIAGNOSTICS v_lotacoes_encerradas = ROW_COUNT;

  UPDATE public.funcionarios
  SET
    ativo = false,
    data_exoneracao = p_data_exoneracao,
    motivo_saida = NULLIF(trim(COALESCE(p_motivo, '')), ''),
    tipo_saida = v_tipo
  WHERE id = p_funcionario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Servidor não encontrado.';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'funcionario_id', p_funcionario_id,
    'tipo_saida', v_tipo,
    'data_exoneracao', p_data_exoneracao,
    'lotacoes_encerradas', v_lotacoes_encerradas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_exonerar_funcionario(bigint, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_exonerar_funcionario(bigint, date, text, text) TO authenticated;

-- Editar saída de quem já está inativo (sem reativar)
CREATE OR REPLACE FUNCTION public.fn_atualizar_saida_funcionario(
  p_funcionario_id bigint,
  p_tipo_saida text,
  p_data_exoneracao date,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_func public.funcionarios%ROWTYPE;
  v_tipo text;
BEGIN
  IF p_funcionario_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário não informado.';
  END IF;
  IF p_data_exoneracao IS NULL THEN
    RAISE EXCEPTION 'Informe a data da saída.';
  END IF;

  SELECT * INTO v_func
  FROM public.funcionarios
  WHERE id = p_funcionario_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Servidor não encontrado.';
  END IF;
  IF COALESCE(v_func.ativo, true) = true THEN
    RAISE EXCEPTION 'Só é possível editar a saída de quem já está inativo.';
  END IF;

  v_tipo := upper(trim(COALESCE(p_tipo_saida, 'EXONERACAO')));
  IF v_tipo NOT IN ('EXONERACAO', 'DEMISSAO_TERCEIRIZADO', 'FALECIMENTO', 'OUTROS') THEN
    RAISE EXCEPTION 'Tipo de saída inválido: %', v_tipo;
  END IF;
  IF v_tipo = 'OUTROS' AND NULLIF(trim(COALESCE(p_motivo, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo quando o tipo for OUTROS.';
  END IF;

  UPDATE public.funcionarios
  SET
    data_exoneracao = p_data_exoneracao,
    motivo_saida = NULLIF(trim(COALESCE(p_motivo, '')), ''),
    tipo_saida = v_tipo,
    ativo = false
  WHERE id = p_funcionario_id;

  RETURN jsonb_build_object(
    'ok', true,
    'funcionario_id', p_funcionario_id,
    'tipo_saida', v_tipo,
    'data_exoneracao', p_data_exoneracao
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_atualizar_saida_funcionario(bigint, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_saida_funcionario(bigint, text, date, text) TO authenticated;

-- Reativar: desfaz saída e reabre última lotação
CREATE OR REPLACE FUNCTION public.fn_reativar_funcionario(
  p_funcionario_id bigint,
  p_data_reativacao date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_func public.funcionarios%ROWTYPE;
  v_ultima public.funcionario_lotacao%ROWTYPE;
BEGIN
  IF p_funcionario_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário não informado.';
  END IF;
  IF p_data_reativacao IS NULL THEN
    RAISE EXCEPTION 'Informe a data da reativação.';
  END IF;

  SELECT *
  INTO v_func
  FROM public.funcionarios
  WHERE id = p_funcionario_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Servidor não encontrado.';
  END IF;
  IF COALESCE(v_func.ativo, true) = true THEN
    RAISE EXCEPTION 'Servidor já está ativo.';
  END IF;

  SELECT fl.*
  INTO v_ultima
  FROM public.funcionario_lotacao fl
  WHERE fl.funcionario_id = p_funcionario_id
  ORDER BY
    COALESCE(fl.data_fim, fl.data_inicio) DESC NULLS LAST,
    fl.id DESC
  LIMIT 1;

  UPDATE public.funcionarios
  SET
    ativo = true,
    data_exoneracao = NULL,
    motivo_saida = NULL,
    tipo_saida = NULL
  WHERE id = p_funcionario_id;

  IF v_ultima.id IS NOT NULL AND v_ultima.lotacao_id IS NOT NULL THEN
    UPDATE public.funcionario_lotacao
    SET
      ativo = true,
      data_fim = NULL,
      observacao = NULLIF(
        trim(BOTH ' |' FROM regexp_replace(
          COALESCE(observacao, ''),
          '(^|[[:space:]]*\|[[:space:]]*)Encerrada por (exoneração|saída) em [0-9]{2}/[0-9]{2}/[0-9]{4}[[:space:]]*$',
          '',
          'i'
        )),
        ''
      )
    WHERE id = v_ultima.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'funcionario_id', p_funcionario_id,
    'lotacao_restaurada', v_ultima.lotacao_id,
    'historico_reaberto_id', v_ultima.id,
    'exoneracao_desfeita', true,
    'sem_lotacao', v_ultima.id IS NULL OR v_ultima.lotacao_id IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reativar_funcionario(bigint, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reativar_funcionario(bigint, date) TO authenticated;

-- Lista unificada (exonerados, demitidos, falecidos, outros)
-- DROP obrigatório: CREATE OR REPLACE não permite remover/reordenar colunas da view antiga
DROP VIEW IF EXISTS public.v_exonerados;

CREATE VIEW public.v_exonerados AS
SELECT
  f.id AS funcionario_id,
  f.nome,
  f.matricula,
  f.cpf,
  f.data_admissao,
  f.data_exoneracao,
  f.motivo_saida,
  COALESCE(f.tipo_saida, 'EXONERACAO') AS tipo_saida,
  f.simbologia,
  fl.funcao,
  l.nome AS lotacao_nome,
  v.categoria AS vinculo
FROM public.funcionarios f
LEFT JOIN LATERAL (
  SELECT fl2.*
  FROM public.funcionario_lotacao fl2
  WHERE fl2.funcionario_id = f.id
  ORDER BY
    COALESCE(fl2.data_fim, fl2.data_inicio) DESC NULLS LAST,
    fl2.id DESC
  LIMIT 1
) fl ON true
LEFT JOIN public.lotacoes l ON l.id = fl.lotacao_id
LEFT JOIN public.vinculos v ON v.id = fl.vinculo_id
WHERE f.ativo = false
  AND f.data_exoneracao IS NOT NULL;

GRANT SELECT ON public.v_exonerados TO authenticated;

NOTIFY pgrst, 'reload schema';
