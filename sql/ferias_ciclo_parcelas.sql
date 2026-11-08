-- ============================================================
-- Férias: ciclo automático entendendo parcelas de 15 dias
-- Execute no SQL Editor do Supabase (substitui a função antiga).
--
-- Regra: cada período aquisitivo dá 30 dias — mês inteiro ou 2 parcelas de 15.
-- Quando termina um gozo e o servidor não tem nada aberto:
--   • se o período aquisitivo ainda tem saldo (ex.: só tirou 15) →
--     cria pendência do MESMO período com o saldo;
--   • se o período já somou 30 dias → cria pendência do PRÓXIMO período.
-- ============================================================

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
  -- Situação conforme as datas
  UPDATE public.funcionario_ferias
     SET status_ferias = 'Concluído'
   WHERE ativo = true
     AND data_fim IS NOT NULL
     AND data_fim < v_hoje
     AND COALESCE(status_ferias, '') NOT IN ('Cancelado', 'Concluído');
  GET DIAGNOSTICS v_concluidas = ROW_COUNT;

  UPDATE public.funcionario_ferias
     SET status_ferias = CASE WHEN data_inicio > v_hoje THEN 'Programado' ELSE 'Em Gozo' END
   WHERE ativo = true
     AND data_inicio IS NOT NULL AND data_fim IS NOT NULL
     AND data_fim >= v_hoje
     AND COALESCE(status_ferias, '') <> 'Cancelado'
     AND COALESCE(status_ferias, '') IS DISTINCT FROM
         CASE WHEN data_inicio > v_hoje THEN 'Programado' ELSE 'Em Gozo' END;

  WITH ultimas AS (
    SELECT DISTINCT ON (ff.funcionario_id)
           ff.id, ff.funcionario_id, ff.tipo,
           CASE WHEN regexp_replace(coalesce(ff.periodo_aquisitivo, ''), '\s', '', 'g') ~ '^[0-9]{4}/[0-9]{4}$'
                THEN regexp_replace(ff.periodo_aquisitivo, '\s', '', 'g') END AS aq
      FROM public.funcionario_ferias ff
     WHERE ff.ativo = true
       AND ff.data_fim IS NOT NULL
       AND ff.data_fim < v_hoje
       AND COALESCE(ff.status_ferias, '') = 'Concluído'
     ORDER BY ff.funcionario_id, ff.data_fim DESC, ff.id DESC
  ), saldo AS (
    SELECT u.*,
           CASE WHEN u.aq IS NULL THEN NULL ELSE 30 - COALESCE((
             SELECT sum(x.data_fim - x.data_inicio + 1)
               FROM public.funcionario_ferias x
              WHERE x.funcionario_id = u.funcionario_id
                AND x.ativo = true
                AND COALESCE(x.status_ferias, '') <> 'Cancelado'
                AND x.data_inicio IS NOT NULL AND x.data_fim IS NOT NULL
                AND regexp_replace(coalesce(x.periodo_aquisitivo, ''), '\s', '', 'g') = u.aq
           ), 0) END AS dias_saldo
      FROM ultimas u
  )
  INSERT INTO public.funcionario_ferias (
    funcionario_id, data_inicio, data_fim, tipo, observacao, ativo,
    periodo_aquisitivo, periodo_pendente, status_ferias,
    gerado_automaticamente, ferias_origem_id
  )
  SELECT
    s.funcionario_id, NULL, NULL,
    COALESCE(s.tipo, 'Regulamentar'),
    CASE WHEN s.dias_saldo > 0
         THEN 'Saldo de ' || s.dias_saldo || ' dias do período ' || s.aq || ' (2ª parcela) — gerado automaticamente.'
         ELSE 'Pendência do próximo ciclo gerada automaticamente após conclusão das férias.' END,
    true,
    CASE WHEN s.dias_saldo > 0 THEN s.aq
         WHEN s.aq IS NOT NULL
         THEN (split_part(s.aq, '/', 1)::int + 1) || '/' || (split_part(s.aq, '/', 2)::int + 1)
         ELSE NULL END,
    CASE WHEN s.dias_saldo > 0 THEN s.dias_saldo || ' dias do período ' || s.aq
         WHEN s.aq IS NOT NULL
         THEN (split_part(s.aq, '/', 1)::int + 1) || '/' || (split_part(s.aq, '/', 2)::int + 1)
         ELSE 'Próximo período a programar' END,
    'Pendente', true, s.id
  FROM saldo s
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.funcionario_ferias atual
     WHERE atual.funcionario_id = s.funcionario_id
       AND atual.ativo = true
       AND atual.id <> s.id
       AND COALESCE(atual.status_ferias, '') <> 'Cancelado'
       AND (atual.data_inicio IS NULL
            OR atual.data_fim >= v_hoje
            OR COALESCE(atual.status_ferias, '') IN ('Pendente', 'Programado', 'Em Gozo'))
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
