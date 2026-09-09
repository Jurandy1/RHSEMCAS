-- KPIs de férias (referência — o front calcula client-side em ferContarKpis)
-- Execute no Supabase se quiser usar a view em relatórios externos.
--
-- A view antiga tinha colunas diferentes (ex.: concluidas_ultimo_ano).
-- CREATE OR REPLACE não permite renomear colunas — é preciso dropar antes.

DROP VIEW IF EXISTS public.v_ferias_kpis CASCADE;

CREATE VIEW public.v_ferias_kpis AS
WITH referencia AS (
  SELECT (now() AT TIME ZONE 'America/Fortaleza')::date AS hoje
),
ativos AS (
  SELECT DISTINCT ON (ff.funcionario_id)
    ff.funcionario_id,
    ff.data_inicio,
    ff.data_fim,
    ff.periodo_pendente,
    ff.observacao,
    CASE
      WHEN ff.status_ferias = 'Cancelado' OR ff.ativo = false THEN 'Cancelado'
      WHEN ff.data_inicio IS NULL THEN 'Pendente'
      WHEN ff.data_inicio <= r.hoje AND ff.data_fim >= r.hoje THEN 'Em Gozo'
      WHEN ff.data_inicio > r.hoje THEN 'Programado'
      WHEN ff.data_fim < r.hoje THEN 'Concluído'
      ELSE COALESCE(ff.status_ferias, 'Programado')
    END AS status_calc,
    r.hoje
  FROM public.funcionario_ferias ff
  CROSS JOIN referencia r
  WHERE ff.ativo = true
  ORDER BY ff.funcionario_id, ff.data_inicio DESC NULLS LAST, ff.id DESC
)
SELECT
  count(*) FILTER (
    WHERE status_calc = 'Em Gozo'
       OR (data_inicio <= hoje AND data_fim >= hoje)
  ) AS em_ferias_hoje,
  count(*) FILTER (
    WHERE data_inicio > hoje
      AND data_inicio <= hoje + 60
      AND NOT (data_inicio <= hoje AND data_fim >= hoje)
  ) AS proximas_60_dias,
  count(*) FILTER (
    WHERE status_calc = 'Pendente'
      AND status_calc NOT IN ('Concluído', 'Cancelado')
  ) AS pendentes,
  count(*) FILTER (
    WHERE status_calc NOT IN ('Concluído', 'Cancelado')
      AND (
        coalesce(periodo_pendente, '') ILIKE '%acumulado%'
        OR coalesce(observacao, '') ILIKE '%risco%'
      )
  ) AS risco
FROM ativos;

GRANT SELECT ON public.v_ferias_kpis TO authenticated;
