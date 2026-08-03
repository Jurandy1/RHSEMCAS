-- Limpa licenças ativas duplicadas do mesmo servidor.
-- Mantém 1 ativa por pessoa (a de data_final mais recente; empate = maior id).
-- Rode no SQL Editor do Supabase DEPOIS de revisar o SELECT.

-- 1) Conferir duplicatas
SELECT funcionario_id, COUNT(*) AS qtd, array_agg(id ORDER BY id) AS ids
FROM public.funcionario_licencas
WHERE ativo = true
GROUP BY funcionario_id
HAVING COUNT(*) > 1
ORDER BY qtd DESC;

-- 2) Desativar as “extras” (mantém a melhor)
WITH ranked AS (
  SELECT
    id,
    funcionario_id,
    ROW_NUMBER() OVER (
      PARTITION BY funcionario_id
      ORDER BY
        COALESCE(data_final, '9999-12-31'::date) DESC,
        COALESCE(data_inicial, '1900-01-01'::date) DESC,
        id DESC
    ) AS rn
  FROM public.funcionario_licencas
  WHERE ativo = true
)
UPDATE public.funcionario_licencas fl
SET ativo = false,
    observacao = COALESCE(fl.observacao || ' | ', '') || 'Desativada automaticamente (duplicata ativa)'
FROM ranked r
WHERE fl.id = r.id
  AND r.rn > 1;

-- 3) Opcional: datas sentinela 0001-01-01 → NULL
UPDATE public.funcionario_licencas
SET data_inicial = NULL
WHERE data_inicial IS NOT NULL AND data_inicial < DATE '1900-01-01';

UPDATE public.funcionario_licencas
SET data_final = NULL
WHERE data_final IS NOT NULL AND data_final < DATE '1900-01-01';
