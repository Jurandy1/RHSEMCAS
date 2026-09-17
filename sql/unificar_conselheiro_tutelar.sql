-- Unifica funções de Conselheiro Tutelar (Titular / Suplente / variações)
-- para o nome único "Conselheiro Tutelar".

BEGIN;

UPDATE public.funcionario_lotacao
SET funcao = 'Conselheiro Tutelar',
    updated_at = now()
WHERE lower(trim(funcao)) ~* 'conselheiro\s+tutelar';

COMMIT;

-- Conferência
SELECT funcao, count(*) AS qtd
FROM public.funcionario_lotacao
WHERE lower(trim(funcao)) LIKE '%conselheiro%tutelar%'
GROUP BY funcao
ORDER BY funcao;
