-- Campo "Cargo" separado de "Função"
-- Função permanece em funcionario_lotacao.funcao
-- Cargo fica no cadastro do servidor (funcionarios.cargo)
-- Execute no SQL Editor do Supabase.

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS cargo text;

COMMENT ON COLUMN public.funcionarios.cargo IS 'Cargo do servidor (folha GIAP / cadastro) — separado da função atual na lotação';

-- Alimenta funcionarios.cargo com o cargo_origem mais recente da folha GIAP
-- (só preenche onde cargo ainda está vazio; não sobrescreve edição manual)
UPDATE public.funcionarios f
SET cargo = sub.cargo_origem
FROM (
  SELECT DISTINCT ON (funcionario_id)
    funcionario_id,
    cargo_origem
  FROM public.funcionario_remuneracoes
  WHERE NULLIF(TRIM(cargo_origem), '') IS NOT NULL
  ORDER BY funcionario_id, competencia DESC
) sub
WHERE f.id = sub.funcionario_id
  AND NULLIF(TRIM(f.cargo), '') IS NULL;
