-- =====================================================================
-- Apaga da folha_pmsl tudo que NÃO é SEMCAS
-- (Cedidos/Recebidos de outras secretarias: puxar de novo depois pelo Relatório API)
-- =====================================================================

-- Preview
SELECT
  CASE
    WHEN upper(trim(COALESCE(lotacao, ''))) = 'SEMCAS' OR trim(COALESCE(codigo_orgao, '')) = '9'
      THEN 'MANTER_SEMCAS'
    ELSE 'APAGAR'
  END AS destino,
  COUNT(*) AS qtd
FROM public.folha_pmsl
GROUP BY 1;

-- Delete (descomente para executar)
/*
DELETE FROM public.folha_pmsl
WHERE NOT (
  upper(trim(COALESCE(lotacao, ''))) = 'SEMCAS'
  OR trim(COALESCE(codigo_orgao, '')) = '9'
);
*/
