-- =====================================================================
-- Desfazer exoneração acidental e reabrir a última lotação
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

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
    motivo_saida = NULL
  WHERE id = p_funcionario_id;

  IF v_ultima.id IS NOT NULL AND v_ultima.lotacao_id IS NOT NULL THEN
    -- Reabre o mesmo registro que fn_exonerar_funcionario encerrou.
    -- Assim, uma exoneração lançada por engano é realmente desfeita.
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
