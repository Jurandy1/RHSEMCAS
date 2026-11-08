-- ============================================================
-- Férias: corrigir pendências automáticas que pularam de período
-- Execute no SQL Editor do Supabase.
--
-- A rotina antiga, ao terminar uma parcela de 15 dias, criava pendência do
-- PRÓXIMO período aquisitivo, mesmo com saldo no período atual.
-- Aqui essas pendências passam a cobrar o saldo do período de origem.
-- Quando o saldo for gozado, a rotina nova cria a do próximo período.
-- Em 08/11/2026 eram 4 casos (servidores 8, 249, 302 e 876).
-- ============================================================

-- 1) CONFERÊNCIA
WITH alvo AS (
  SELECT p.id AS pendencia_id, p.funcionario_id, p.periodo_aquisitivo AS aquisitivo_atual,
         regexp_replace(o.periodo_aquisitivo, '\s', '', 'g') AS aquisitivo_certo,
         30 - (SELECT coalesce(sum(x.data_fim - x.data_inicio + 1), 0)
                 FROM public.funcionario_ferias x
                WHERE x.funcionario_id = p.funcionario_id
                  AND x.ativo = true AND coalesce(x.status_ferias, '') <> 'Cancelado'
                  AND x.data_inicio IS NOT NULL AND x.data_fim IS NOT NULL
                  AND regexp_replace(coalesce(x.periodo_aquisitivo, ''), '\s', '', 'g')
                      = regexp_replace(o.periodo_aquisitivo, '\s', '', 'g')) AS saldo
    FROM public.funcionario_ferias p
    JOIN public.funcionario_ferias o ON o.id = p.ferias_origem_id
   WHERE p.ativo = true
     AND p.data_inicio IS NULL
     AND coalesce(p.status_ferias, '') <> 'Cancelado'
     AND regexp_replace(coalesce(o.periodo_aquisitivo, ''), '\s', '', 'g') ~ '^[0-9]{4}/[0-9]{4}$'
     AND regexp_replace(coalesce(p.periodo_aquisitivo, ''), '\s', '', 'g')
         <> regexp_replace(o.periodo_aquisitivo, '\s', '', 'g')
)
SELECT f.nome, a.* FROM alvo a JOIN public.funcionarios f ON f.id = a.funcionario_id
 WHERE a.saldo > 0
 ORDER BY f.nome;

-- 2) CORRIGIR
BEGIN;

WITH alvo AS (
  SELECT p.id,
         regexp_replace(o.periodo_aquisitivo, '\s', '', 'g') AS aq,
         30 - (SELECT coalesce(sum(x.data_fim - x.data_inicio + 1), 0)
                 FROM public.funcionario_ferias x
                WHERE x.funcionario_id = p.funcionario_id
                  AND x.ativo = true AND coalesce(x.status_ferias, '') <> 'Cancelado'
                  AND x.data_inicio IS NOT NULL AND x.data_fim IS NOT NULL
                  AND regexp_replace(coalesce(x.periodo_aquisitivo, ''), '\s', '', 'g')
                      = regexp_replace(o.periodo_aquisitivo, '\s', '', 'g')) AS saldo
    FROM public.funcionario_ferias p
    JOIN public.funcionario_ferias o ON o.id = p.ferias_origem_id
   WHERE p.ativo = true
     AND p.data_inicio IS NULL
     AND coalesce(p.status_ferias, '') <> 'Cancelado'
     AND regexp_replace(coalesce(o.periodo_aquisitivo, ''), '\s', '', 'g') ~ '^[0-9]{4}/[0-9]{4}$'
     AND regexp_replace(coalesce(p.periodo_aquisitivo, ''), '\s', '', 'g')
         <> regexp_replace(o.periodo_aquisitivo, '\s', '', 'g')
)
UPDATE public.funcionario_ferias d
   SET periodo_aquisitivo = a.aq,
       periodo_pendente   = a.saldo || ' dias do período ' || a.aq,
       observacao         = 'Saldo de ' || a.saldo || ' dias do período ' || a.aq
                            || ' (2ª parcela) — corrigido automaticamente.'
  FROM alvo a
 WHERE d.id = a.id AND a.saldo > 0;

COMMIT;

-- 3) Conferência final (deve retornar 0 linhas na consulta 1 se rodar de novo)
