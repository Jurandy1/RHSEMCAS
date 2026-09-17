-- Corrige o nó fantasma "Sem Lotação" (lotacoes.id = 124).
-- Sem Lotação é STATUS (sem funcionario_lotacao.ativo), não uma lotação física.
-- 1) Encerra quem estava "lotado" nesse nó
-- 2) Inativa o nó para sumir do organograma

BEGIN;

UPDATE public.funcionario_lotacao fl
SET
  ativo = false,
  data_fim = COALESCE(fl.data_fim, CURRENT_DATE),
  observacao = trim(both ' | ' from concat_ws(' | ',
    NULLIF(trim(fl.observacao), ''),
    'Encerrado: migrado do nó fantasma Sem Lotação para status Sem Lotação.'
  )),
  updated_at = now()
WHERE fl.lotacao_id = 124
  AND fl.ativo = true;

UPDATE public.lotacoes
SET
  ativo = false,
  observacao = 'Nó fantasma desativado — Sem Lotação é status do menu, não unidade.',
  updated_at = now()
WHERE id = 124
   OR lower(trim(nome)) = 'sem lotação';

COMMIT;

-- Conferência
SELECT count(*) AS sem_lotacao
FROM public.v_servidores_sem_lotacao;
