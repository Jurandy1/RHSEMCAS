-- Remove vínculos Contrato, Contrato/SEMUS e PROCAD.
-- Quem estava com vínculo PROCAD é EXCLUÍDO (não migra para Terceirizado).
-- Contrato/SEMUS histórico inativo é remapeado só para liberar o DELETE do vínculo.

BEGIN;

-- IDs que estavam com vínculo PROCAD (antes da limpeza)
CREATE TEMP TABLE tmp_ex_procad ON COMMIT DROP AS
SELECT unnest(ARRAY[751, 1386, 1600]::bigint[]) AS funcionario_id;

-- Apaga dependências e o cadastro desses servidores
DELETE FROM public.funcionario_remuneracoes
WHERE funcionario_id IN (SELECT funcionario_id FROM tmp_ex_procad);

DELETE FROM public.funcionario_ferias
WHERE funcionario_id IN (SELECT funcionario_id FROM tmp_ex_procad);

DELETE FROM public.funcionario_licencas
WHERE funcionario_id IN (SELECT funcionario_id FROM tmp_ex_procad);

DELETE FROM public.giap_revisao_ausencia
WHERE funcionario_id IN (SELECT funcionario_id FROM tmp_ex_procad);

DELETE FROM public.giap_auditoria_saidas
WHERE funcionario_id IN (SELECT funcionario_id FROM tmp_ex_procad);

DELETE FROM public.sistema_logs
WHERE funcionario_id IN (SELECT funcionario_id FROM tmp_ex_procad);

DELETE FROM public.funcionario_lotacao
WHERE funcionario_id IN (SELECT funcionario_id FROM tmp_ex_procad);

DELETE FROM public.funcionarios
WHERE id IN (SELECT funcionario_id FROM tmp_ex_procad);

-- Remapeia históricos de Contrato/SEMUS (se o vínculo ainda existir)
UPDATE public.funcionario_lotacao fl
SET vinculo_id = v_temp.id,
    updated_at = now()
FROM public.vinculos v_old
JOIN public.vinculos v_temp
  ON lower(trim(v_temp.categoria)) = 'contrato temporário'
WHERE fl.vinculo_id = v_old.id
  AND lower(trim(v_old.categoria)) = 'contrato/semus';

-- Remove os vínculos da tabela (se ainda existirem)
DELETE FROM public.vinculos
WHERE lower(trim(categoria)) IN ('contrato', 'contrato/semus', 'procad');

COMMIT;

-- Conferência
SELECT id, categoria FROM public.vinculos ORDER BY id;

SELECT count(*) AS ex_procad_restantes
FROM public.funcionarios
WHERE id IN (751, 1386, 1600);
