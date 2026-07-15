-- =====================================================================
-- Lista todas as funções/cargos em uso (lotação atual)
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

-- 1) Todas as funções distintas + quantidade de servidores
SELECT
  TRIM(fl.funcao) AS funcao,
  COUNT(*) AS qtd_servidores
FROM public.funcionario_lotacao fl
WHERE fl.ativo = true
  AND TRIM(COALESCE(fl.funcao, '')) <> ''
GROUP BY TRIM(fl.funcao)
ORDER BY TRIM(fl.funcao);

-- 2) Possíveis duplicidades (mesma função com caixa/acento/espaços diferentes)
-- Ex.: "Administrativo" x "ADMINISTRATIVO"
CREATE EXTENSION IF NOT EXISTS unaccent;

WITH base AS (
  SELECT
    TRIM(fl.funcao) AS funcao,
    COUNT(*) AS qtd
  FROM public.funcionario_lotacao fl
  WHERE fl.ativo = true
    AND TRIM(COALESCE(fl.funcao, '')) <> ''
  GROUP BY TRIM(fl.funcao)
),
agrupado AS (
  SELECT
    LOWER(unaccent(funcao)) AS chave_normalizada,
    STRING_AGG(funcao || ' (' || qtd || ')', '  |  ' ORDER BY qtd DESC, funcao) AS variantes,
    SUM(qtd) AS total_servidores,
    COUNT(*) AS qtd_grafias
  FROM base
  GROUP BY LOWER(unaccent(funcao))
)
SELECT chave_normalizada, variantes, total_servidores, qtd_grafias
FROM agrupado
WHERE qtd_grafias > 1
ORDER BY total_servidores DESC, chave_normalizada;

-- 3) Detalhe: quem está em cada função (descomente se quiser)
-- SELECT
--   TRIM(fl.funcao) AS funcao,
--   f.nome,
--   f.matricula,
--   l.nome AS lotacao
-- FROM public.funcionario_lotacao fl
-- JOIN public.funcionarios f ON f.id = fl.funcionario_id
-- LEFT JOIN public.lotacoes l ON l.id = fl.lotacao_id
-- WHERE fl.ativo = true
--   AND TRIM(COALESCE(fl.funcao, '')) <> ''
-- ORDER BY TRIM(fl.funcao), f.nome;
