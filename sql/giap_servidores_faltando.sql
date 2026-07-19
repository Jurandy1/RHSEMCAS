-- =====================================================================
-- Vasculha: servidores do RH que AINDA NÃO estão na folha GIAP
-- Cole no Supabase → SQL Editor → ajuste a competência → Run
-- (Não depende da extensão unaccent)
-- =====================================================================

-- Altere a competência aqui (ex.: 202606 = junho/2026):
WITH params AS (
  SELECT 202606::int AS competencia
),

folha_mats AS (
  SELECT DISTINCT
    NULLIF(ltrim(regexp_replace(COALESCE(matricula, ''), '[^0-9]', '', 'g'), '0'), '') AS mat_key
  FROM public.folha_pmsl f
  CROSS JOIN params p
  WHERE f.competencia = p.competencia
),

folha_nomes AS (
  SELECT DISTINCT upper(trim(both FROM COALESCE(funcionario_norm, funcionario))) AS nome_norm
  FROM public.folha_pmsl f
  CROSS JOIN params p
  WHERE f.competencia = p.competencia
),

rh AS (
  SELECT
    f.id,
    f.nome,
    f.matricula,
    f.data_admissao,
    NULLIF(ltrim(regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g'), '0'), '') AS mat_key,
    upper(trim(both FROM f.nome)) AS nome_norm
  FROM public.funcionarios f
  WHERE COALESCE(f.ativo, true) = true
)

SELECT
  r.matricula,
  r.nome,
  r.data_admissao,
  CASE
    WHEN r.mat_key IS NULL THEN 'sem_matricula'
    ELSE 'com_matricula'
  END AS tipo,
  (SELECT competencia FROM params) AS competencia
FROM rh r
WHERE
  (
    r.mat_key IS NULL
    OR NOT EXISTS (SELECT 1 FROM folha_mats fm WHERE fm.mat_key = r.mat_key)
  )
  AND NOT EXISTS (
    SELECT 1 FROM folha_nomes fn WHERE fn.nome_norm = r.nome_norm
  )
ORDER BY
  CASE WHEN r.mat_key IS NULL THEN 0 ELSE 1 END,
  r.nome;

-- Contagem rápida (rode depois, ou use o resumo da tela no RHSEMCAS):
-- SELECT
--   count(*) FILTER (WHERE matricula IS NULL OR trim(matricula) = '') AS sem_mat,
--   count(*) FILTER (WHERE matricula IS NOT NULL AND trim(matricula) <> '') AS com_mat,
--   count(*) AS total
-- FROM ( ... cole o SELECT acima ... ) x;
