-- =====================================================================
-- Exonerados + suporte a "Servidores sem lotação"
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

-- Data e motivo da saída (exoneração)
ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS data_exoneracao date;

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS motivo_saida text;

COMMENT ON COLUMN public.funcionarios.data_exoneracao IS
  'Data da exoneração. Quando preenchida, ativo=false e o servidor aparece em Exonerados.';

-- Exonerar: marca inativo, encerra lotação ativa, registra data
CREATE OR REPLACE FUNCTION public.fn_exonerar_funcionario(
  p_funcionario_id bigint,
  p_data_exoneracao date DEFAULT CURRENT_DATE,
  p_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_funcionario_id IS NULL THEN
    RAISE EXCEPTION 'Funcionário não informado.';
  END IF;
  IF p_data_exoneracao IS NULL THEN
    RAISE EXCEPTION 'Informe a data da exoneração.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.funcionarios
    WHERE id = p_funcionario_id AND COALESCE(ativo, true) = true
  ) THEN
    RAISE EXCEPTION 'Servidor não encontrado ou já inativo.';
  END IF;

  UPDATE public.funcionario_lotacao
  SET
    ativo = false,
    data_fim = COALESCE(data_fim, p_data_exoneracao),
    observacao = CONCAT(
      COALESCE(observacao || ' | ', ''),
      'Encerrada por exoneração em ',
      to_char(p_data_exoneracao, 'DD/MM/YYYY')
    )
  WHERE funcionario_id = p_funcionario_id
    AND ativo = true;

  UPDATE public.funcionarios
  SET
    ativo = false,
    data_exoneracao = p_data_exoneracao,
    motivo_saida = NULLIF(trim(COALESCE(p_motivo, '')), '')
  WHERE id = p_funcionario_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_exonerar_funcionario(bigint, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_exonerar_funcionario(bigint, date, text) TO authenticated;

-- Reativar: desfaz uma exoneração acidental e reabre a última lotação.
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
  SET ativo = true, data_exoneracao = NULL, motivo_saida = NULL
  WHERE id = p_funcionario_id;

  IF v_ultima.id IS NOT NULL AND v_ultima.lotacao_id IS NOT NULL THEN
    UPDATE public.funcionario_lotacao
    SET
      ativo = true,
      data_fim = NULL,
      observacao = NULLIF(
        trim(BOTH ' |' FROM regexp_replace(
          COALESCE(observacao, ''),
          '(^|[[:space:]]*\|[[:space:]]*)Encerrada por exoneração em [0-9]{2}/[0-9]{2}/[0-9]{4}[[:space:]]*$',
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

-- Lista de exonerados com última lotação/função conhecidas
CREATE OR REPLACE VIEW public.v_exonerados AS
SELECT
  f.id AS funcionario_id,
  f.nome,
  f.matricula,
  f.cpf,
  f.email,
  f.telefone,
  f.simbologia,
  f.data_admissao,
  f.data_exoneracao,
  f.motivo_saida,
  f.observacao,
  fl.funcao,
  l.nome AS lotacao_nome,
  v.categoria AS vinculo,
  t.nome AS turno
FROM public.funcionarios f
LEFT JOIN LATERAL (
  SELECT fl2.*
  FROM public.funcionario_lotacao fl2
  WHERE fl2.funcionario_id = f.id
  ORDER BY
    CASE WHEN fl2.ativo THEN 0 ELSE 1 END,
    COALESCE(fl2.data_fim, fl2.data_inicio) DESC NULLS LAST,
    fl2.id DESC
  LIMIT 1
) fl ON true
LEFT JOIN public.lotacoes l ON l.id = fl.lotacao_id
LEFT JOIN public.vinculos v ON v.id = fl.vinculo_id
LEFT JOIN public.turnos t ON t.id = fl.turno_id
WHERE COALESCE(f.ativo, true) = false
  AND f.data_exoneracao IS NOT NULL;

GRANT SELECT ON public.v_exonerados TO authenticated;
REVOKE ALL ON public.v_exonerados FROM anon;

-- Servidores ativos sem lotação ativa (com última função/lotação do histórico)
CREATE OR REPLACE VIEW public.v_servidores_sem_lotacao AS
SELECT
  f.id AS funcionario_id,
  f.nome,
  f.matricula,
  f.cpf,
  f.email,
  f.telefone,
  f.simbologia,
  f.data_admissao,
  f.observacao,
  f.ativo,
  fl.funcao AS ultima_funcao,
  fl.funcao AS ultimo_cargo,
  l.nome AS ultima_lotacao,
  v.categoria AS ultimo_vinculo,
  fl.data_fim AS sem_lotacao_desde,
  fl.data_inicio AS ultima_lotacao_inicio,
  fl.observacao AS ultima_lotacao_obs
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
WHERE COALESCE(f.ativo, true) = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.funcionario_lotacao flx
    WHERE flx.funcionario_id = f.id
      AND flx.ativo = true
  );

GRANT SELECT ON public.v_servidores_sem_lotacao TO authenticated;
REVOKE ALL ON public.v_servidores_sem_lotacao FROM anon;

-- Conferência
SELECT 'sem_lotacao' AS lista, COUNT(*)::int AS total FROM public.v_servidores_sem_lotacao
UNION ALL
SELECT 'exonerados', COUNT(*)::int FROM public.v_exonerados;
