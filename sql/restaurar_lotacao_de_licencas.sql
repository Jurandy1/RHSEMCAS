-- =====================================================================
-- 1) Remove licenças duplicadas (mantém só a mais recente)
-- 2) Restaura lotação original de quem está em "LICENÇAS E AFASTAMENTOS"
--
-- Critério para "mais recente" (nessa ordem):
--   a) data do log em sistema_logs (AFASTAMENTO / LICENÇA), se existir
--   b) data_inicial da licença
--   c) id do registro (maior = mais novo)
--
-- Como aplicar (Supabase → SQL Editor), nesta ordem:
--   1) PREVIEW duplicados
--   2) DEDUP (encerra as antigas)
--   3) PREVIEW restauração de lotação
--   4) RESTORE lotação
--   5) PREVIEW restauração de novo (confirmar)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) PREVIEW DUPLICADOS — quem tem mais de 1 licença ativa
--    acolher = registro que fica; encerrar = os demais
-- ---------------------------------------------------------------------
WITH ranked AS (
  SELECT
    lic.id AS licenca_id,
    lic.funcionario_id,
    f.nome,
    f.matricula,
    lic.tipo_afastamento,
    lic.data_inicial,
    lic.data_final,
    (
      SELECT MAX(sl.created_at)
      FROM public.sistema_logs sl
      WHERE sl.funcionario_id = lic.funcionario_id
        AND sl.tipo_acao ILIKE '%AFASTAMENTO%'
        AND (
          sl.detalhes->>'tipo' IS NULL
          OR sl.detalhes->>'tipo' = lic.tipo_afastamento
        )
    ) AS log_em,
    ROW_NUMBER() OVER (
      PARTITION BY lic.funcionario_id
      ORDER BY
        COALESCE(
          (
            SELECT MAX(sl.created_at)
            FROM public.sistema_logs sl
            WHERE sl.funcionario_id = lic.funcionario_id
              AND sl.tipo_acao ILIKE '%AFASTAMENTO%'
              AND (
                sl.detalhes->>'tipo' IS NULL
                OR sl.detalhes->>'tipo' = lic.tipo_afastamento
              )
          ),
          lic.data_inicial::timestamptz,
          to_timestamp(0)
        ) DESC,
        lic.id DESC
    ) AS rn
  FROM public.funcionario_licencas lic
  JOIN public.funcionarios f ON f.id = lic.funcionario_id
  WHERE lic.ativo = true
)
SELECT
  funcionario_id,
  nome,
  matricula,
  tipo_afastamento,
  data_inicial,
  log_em,
  CASE WHEN rn = 1 THEN 'MANTER (mais recente)' ELSE 'ENCERRAR (duplicada)' END AS acao,
  licenca_id
FROM ranked
WHERE funcionario_id IN (
  SELECT funcionario_id FROM ranked GROUP BY funcionario_id HAVING COUNT(*) > 1
)
ORDER BY nome, rn;


-- ---------------------------------------------------------------------
-- 2) DEDUP — encerra licenças ativas duplicadas; mantém só a mais recente
-- ---------------------------------------------------------------------
WITH ranked AS (
  SELECT
    lic.id AS licenca_id,
    ROW_NUMBER() OVER (
      PARTITION BY lic.funcionario_id
      ORDER BY
        COALESCE(
          (
            SELECT MAX(sl.created_at)
            FROM public.sistema_logs sl
            WHERE sl.funcionario_id = lic.funcionario_id
              AND sl.tipo_acao ILIKE '%AFASTAMENTO%'
              AND (
                sl.detalhes->>'tipo' IS NULL
                OR sl.detalhes->>'tipo' = lic.tipo_afastamento
              )
          ),
          lic.data_inicial::timestamptz,
          to_timestamp(0)
        ) DESC,
        lic.id DESC
    ) AS rn
  FROM public.funcionario_licencas lic
  WHERE lic.ativo = true
)
UPDATE public.funcionario_licencas fl
SET
  ativo = false,
  data_final = COALESCE(fl.data_final, CURRENT_DATE),
  observacao = CONCAT(
    COALESCE(fl.observacao || ' | ', ''),
    'Encerrada automaticamente: duplicata (mantida a licença mais recente)'
  )
FROM ranked r
WHERE fl.id = r.licenca_id
  AND r.rn > 1
RETURNING fl.id, fl.funcionario_id, fl.tipo_afastamento, fl.data_inicial;


-- ---------------------------------------------------------------------
-- 3) PREVIEW LOTAÇÃO — 1 linha por servidor (já sem duplicata de licença)
-- ---------------------------------------------------------------------
SELECT DISTINCT ON (f.id)
  f.id AS funcionario_id,
  f.nome,
  f.matricula,
  l.nome AS lotacao_atual,
  lp.nome AS lotacao_anterior,
  prev.lotacao_id AS lotacao_anterior_id,
  lic.tipo_afastamento,
  lic.data_inicial
FROM public.funcionario_lotacao fl
JOIN public.funcionarios f ON f.id = fl.funcionario_id
JOIN public.lotacoes l ON l.id = fl.lotacao_id
JOIN public.funcionario_licencas lic
  ON lic.funcionario_id = fl.funcionario_id AND lic.ativo = true
LEFT JOIN LATERAL (
  SELECT fl2.lotacao_id
  FROM public.funcionario_lotacao fl2
  JOIN public.lotacoes l2 ON l2.id = fl2.lotacao_id
  WHERE fl2.funcionario_id = fl.funcionario_id
    AND fl2.ativo = false
    AND l2.nome NOT ILIKE '%LICENÇAS E AFASTAMENTOS%'
  ORDER BY fl2.data_fim DESC NULLS LAST, fl2.id DESC
  LIMIT 1
) prev ON true
LEFT JOIN public.lotacoes lp ON lp.id = prev.lotacao_id
WHERE fl.ativo = true
  AND l.nome ILIKE '%LICENÇAS E AFASTAMENTOS%'
ORDER BY f.id, lic.data_inicial DESC NULLS LAST, lic.id DESC;


-- ---------------------------------------------------------------------
-- 4) RESTORE — devolve cada um à lotação anterior (licença continua ativa)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  prev_lotacao_id bigint;
  qtd_ok integer := 0;
  qtd_sem_hist integer := 0;
BEGIN
  FOR r IN
    SELECT fl.funcionario_id, f.nome
    FROM public.funcionario_lotacao fl
    JOIN public.lotacoes l ON l.id = fl.lotacao_id
    JOIN public.funcionarios f ON f.id = fl.funcionario_id
    WHERE fl.ativo = true
      AND l.nome ILIKE '%LICENÇAS E AFASTAMENTOS%'
      AND EXISTS (
        SELECT 1
        FROM public.funcionario_licencas lic
        WHERE lic.funcionario_id = fl.funcionario_id
          AND lic.ativo = true
      )
  LOOP
    SELECT fl2.lotacao_id
      INTO prev_lotacao_id
    FROM public.funcionario_lotacao fl2
    JOIN public.lotacoes l2 ON l2.id = fl2.lotacao_id
    WHERE fl2.funcionario_id = r.funcionario_id
      AND fl2.ativo = false
      AND l2.nome NOT ILIKE '%LICENÇAS E AFASTAMENTOS%'
    ORDER BY fl2.data_fim DESC NULLS LAST, fl2.id DESC
    LIMIT 1;

    IF prev_lotacao_id IS NULL THEN
      qtd_sem_hist := qtd_sem_hist + 1;
      RAISE NOTICE 'Sem lotação anterior para: % (id %)', r.nome, r.funcionario_id;
      CONTINUE;
    END IF;

    PERFORM public.fn_transferir_funcionario(
      p_funcionario_id   := r.funcionario_id,
      p_nova_lotacao_id  := prev_lotacao_id,
      p_novo_vinculo_id  := NULL,
      p_nova_funcao      := NULL,
      p_novo_turno_id    := NULL,
      p_motivo           := 'Restauração: licença não altera lotação'
    );

    qtd_ok := qtd_ok + 1;
  END LOOP;

  RAISE NOTICE 'Restaurados: %. Sem histórico anterior: %.', qtd_ok, qtd_sem_hist;
END $$;


-- =====================================================================
-- 5) CASOS SEM HISTÓRICO — investigação dos 3 que sobraram
--    Jercenilde (1237), Lyvia (1242), Marcela (1245)
-- =====================================================================

-- 5a) Todo o histórico de lotação (incluindo Licenças)
SELECT
  f.id AS funcionario_id,
  f.nome,
  fl.id AS hist_id,
  fl.ativo,
  fl.data_inicio,
  fl.data_fim,
  fl.observacao,
  l.nome AS lotacao,
  l.id AS lotacao_id
FROM public.funcionarios f
JOIN public.funcionario_lotacao fl ON fl.funcionario_id = f.id
JOIN public.lotacoes l ON l.id = fl.lotacao_id
WHERE f.id IN (1237, 1242, 1245)
ORDER BY f.nome, fl.data_inicio DESC NULLS LAST, fl.id DESC;

-- 5b) Logs do sistema (transferências / afastamentos)
SELECT
  sl.created_at,
  sl.funcionario_id,
  sl.funcionario_nome,
  sl.tipo_acao,
  sl.detalhes,
  (sl.detalhes->>'nova_lot_id')::bigint AS nova_lot_id,
  l.nome AS nova_lotacao_nome
FROM public.sistema_logs sl
LEFT JOIN public.lotacoes l
  ON l.id = NULLIF(sl.detalhes->>'nova_lot_id', '')::bigint
WHERE sl.funcionario_id IN (1237, 1242, 1245)
ORDER BY sl.created_at DESC;

-- 5c) Lista de lotações para escolher destino manual
SELECT id, nome, categoria
FROM public.lotacoes
WHERE ativo IS DISTINCT FROM false
  AND nome NOT ILIKE '%LICENÇAS E AFASTAMENTOS%'
ORDER BY nome;


-- ---------------------------------------------------------------------
-- 6) RESTORE MANUAL — preencha o lotacao_id destino e rode
--    Exemplo: REPLACE valores em VALUES (...).
-- ---------------------------------------------------------------------
/*
DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      (1237, NULL::bigint),  -- Jercenilde → informe lotacao_id
      (1242, NULL::bigint),  -- Lyvia       → informe lotacao_id
      (1245, NULL::bigint)   -- Marcela     → informe lotacao_id
    ) AS t(funcionario_id, lotacao_id)
  LOOP
    IF v.lotacao_id IS NULL THEN
      RAISE NOTICE 'Pulando % — lotacao_id não informado', v.funcionario_id;
      CONTINUE;
    END IF;

    PERFORM public.fn_transferir_funcionario(
      p_funcionario_id   := v.funcionario_id,
      p_nova_lotacao_id  := v.lotacao_id,
      p_novo_vinculo_id  := NULL,
      p_nova_funcao      := NULL,
      p_novo_turno_id    := NULL,
      p_motivo           := 'Restauração manual: sem histórico de lotação anterior'
    );
  END LOOP;
END $$;
*/
