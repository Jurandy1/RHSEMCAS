-- Ciclo automático de férias:
-- 1. conclui períodos cujo gozo terminou;
-- 2. cria uma única pendência para o próximo ciclo;
-- 3. preserva o registro concluído no histórico.

ALTER TABLE public.funcionario_ferias
  ALTER COLUMN data_inicio DROP NOT NULL,
  ALTER COLUMN data_fim DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS gerado_automaticamente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ferias_origem_id bigint REFERENCES public.funcionario_ferias(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_funcionario_ferias_origem_automatica
  ON public.funcionario_ferias (ferias_origem_id)
  WHERE ferias_origem_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_ferias_atualizar_ciclo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Fortaleza')::date;
  v_concluidas integer := 0;
  v_pendencias integer := 0;
BEGIN
  UPDATE public.funcionario_ferias
     SET status_ferias = 'Concluído'
   WHERE ativo = true
     AND data_fim IS NOT NULL
     AND data_fim < v_hoje
     AND COALESCE(status_ferias, '') <> 'Cancelado'
     AND COALESCE(status_ferias, '') <> 'Concluído';
  GET DIAGNOSTICS v_concluidas = ROW_COUNT;

  WITH ultimas_concluidas AS (
    SELECT DISTINCT ON (ff.funcionario_id)
      ff.id,
      ff.funcionario_id,
      ff.tipo,
      ff.periodo_aquisitivo
    FROM public.funcionario_ferias ff
    WHERE ff.ativo = true
      AND ff.data_fim IS NOT NULL
      AND ff.data_fim < v_hoje
      AND COALESCE(ff.status_ferias, '') = 'Concluído'
    ORDER BY ff.funcionario_id, ff.data_fim DESC, ff.id DESC
  )
  INSERT INTO public.funcionario_ferias (
    funcionario_id,
    data_inicio,
    data_fim,
    tipo,
    observacao,
    ativo,
    periodo_aquisitivo,
    periodo_pendente,
    status_ferias,
    gerado_automaticamente,
    ferias_origem_id
  )
  SELECT
    u.funcionario_id,
    NULL,
    NULL,
    COALESCE(u.tipo, 'Regulamentar'),
    'Pendência do próximo ciclo gerada automaticamente após conclusão das férias.',
    true,
    CASE
      WHEN trim(COALESCE(u.periodo_aquisitivo, '')) ~ '^[0-9]{4}\s*/\s*[0-9]{4}$'
      THEN
        ((split_part(regexp_replace(trim(u.periodo_aquisitivo), '\s', '', 'g'), '/', 1)::integer + 1)::text)
        || '/' ||
        ((split_part(regexp_replace(trim(u.periodo_aquisitivo), '\s', '', 'g'), '/', 2)::integer + 1)::text)
      ELSE NULL
    END,
    CASE
      WHEN trim(COALESCE(u.periodo_aquisitivo, '')) ~ '^[0-9]{4}\s*/\s*[0-9]{4}$'
      THEN
        ((split_part(regexp_replace(trim(u.periodo_aquisitivo), '\s', '', 'g'), '/', 1)::integer + 1)::text)
        || '/' ||
        ((split_part(regexp_replace(trim(u.periodo_aquisitivo), '\s', '', 'g'), '/', 2)::integer + 1)::text)
      ELSE 'Próximo período a programar'
    END,
    'Pendente',
    true,
    u.id
  FROM ultimas_concluidas u
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.funcionario_ferias atual
    WHERE atual.funcionario_id = u.funcionario_id
      AND atual.ativo = true
      AND atual.id <> u.id
      AND COALESCE(atual.status_ferias, '') <> 'Cancelado'
      AND (
        atual.data_inicio IS NULL
        OR atual.data_fim >= v_hoje
        OR COALESCE(atual.status_ferias, '') IN ('Pendente', 'Programado', 'Em Gozo')
      )
  )
  ON CONFLICT (ferias_origem_id) WHERE ferias_origem_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_pendencias = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'data_referencia', v_hoje,
    'concluidas', v_concluidas,
    'pendencias_criadas', v_pendencias
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_ferias_atualizar_ciclo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ferias_atualizar_ciclo() TO service_role;

