-- KPIs de férias (referência — o front calcula client-side em ferContarKpis)
-- Execute no Supabase se quiser usar a view em relatórios externos.
--
-- A view antiga tinha colunas diferentes (ex.: concluidas_ultimo_ano).
-- CREATE OR REPLACE não permite renomear colunas — é preciso dropar antes.

DROP VIEW IF EXISTS public.v_ferias_kpis CASCADE;

CREATE VIEW public.v_ferias_kpis AS
WITH ativos AS (
  SELECT DISTINCT ON (ff.funcionario_id)
    ff.funcionario_id,
    ff.data_inicio,
    ff.data_fim,
    ff.periodo_pendente,
    ff.observacao,
    COALESCE(ff.status_ferias,
      CASE
        WHEN ff.data_inicio IS NULL THEN 'Pendente'
        WHEN ff.data_inicio <= CURRENT_DATE AND ff.data_fim >= CURRENT_DATE THEN 'Em Gozo'
        WHEN ff.data_inicio > CURRENT_DATE THEN 'Programado'
        WHEN ff.data_fim < CURRENT_DATE THEN 'Concluído'
        ELSE 'Programado'
      END
    ) AS status_calc
  FROM public.funcionario_ferias ff
  WHERE ff.ativo = true
  ORDER BY ff.funcionario_id, ff.data_inicio DESC NULLS LAST, ff.id DESC
)
SELECT
  count(*) FILTER (
    WHERE status_calc = 'Em Gozo'
       OR (data_inicio <= CURRENT_DATE AND data_fim >= CURRENT_DATE)
  ) AS em_ferias_hoje,
  count(*) FILTER (
    WHERE data_inicio > CURRENT_DATE
      AND data_inicio <= CURRENT_DATE + 60
      AND NOT (data_inicio <= CURRENT_DATE AND data_fim >= CURRENT_DATE)
  ) AS proximas_60_dias,
  count(*) FILTER (
    WHERE status_calc = 'Pendente'
       OR data_inicio IS NULL
       OR nullif(trim(periodo_pendente), '') IS NOT NULL
  ) AS pendentes,
  count(*) FILTER (
    WHERE coalesce(periodo_pendente, '') ILIKE '%acumulado%'
       OR coalesce(observacao, '') ILIKE '%risco%'
  ) AS risco
FROM ativos;

GRANT SELECT ON public.v_ferias_kpis TO authenticated;
