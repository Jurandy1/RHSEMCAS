-- Unifica funções "Educador Social de Rua" (e variações)
-- para o nome único "Educador Social".

BEGIN;

UPDATE public.funcionario_lotacao
SET funcao = 'Educador Social',
    updated_at = now()
WHERE lower(trim(funcao)) ~* '^educador\s+social(\s+de\s+rua)?$';

COMMIT;

-- Conferência
SELECT funcao, count(*) AS qtd
FROM public.funcionario_lotacao
WHERE lower(trim(funcao)) LIKE '%educador%social%'
GROUP BY funcao
ORDER BY funcao;
