-- ═══════════════════════════════════════════════════════════════════
-- Dino + Jackson: cadastrar RH + RECEBIDO + lotação
-- Flavio: já no menu — só garante lotação se estiver sem
-- Meta: 18 CEDIDO + 18 RECEBIDO
-- ═══════════════════════════════════════════════════════════════════
--
-- ANTES: confira se as lotações existem com estes nomes:
SELECT id, nome FROM public.lotacoes
WHERE COALESCE(ativo, true) = true
  AND (
    nome ILIKE '%Diretoria Técnica de Transporte%'
    OR nome ILIKE '%CRAS Cohab%'
    OR nome ILIKE '%Resid%ncia Inclusiva%'
    OR nome ILIKE '%Residencia Inclusiva%'
  )
ORDER BY nome;

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1) CRIAR FUNCIONÁRIOS (Dino + Jackson)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO public.funcionarios (nome, matricula, ativo, observacao)
SELECT v.nome, v.matricula, true, v.obs
FROM (VALUES
  (
    'Dino Santos Lopes',
    '35744',
    'Adicionado via migração cedências jul/2026. RECEBIDO — CEDIDO DA SEMSA'
  ),
  (
    'Jackson Junior Pereira Brandão',
    '53844',
    'Adicionado via migração cedências jul/2026. RECEBIDO — CEDIDO DO COLISEU'
  )
) AS v(nome, matricula, obs)
WHERE NOT EXISTS (
  SELECT 1 FROM public.funcionarios f
  WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') = v.matricula
);

-- ─────────────────────────────────────────────────────────────────
-- 2) LOTAÇÃO ATIVA (fecha lotação anterior se houver)
-- ─────────────────────────────────────────────────────────────────

-- Dino → Diretoria Técnica de Transporte
UPDATE public.funcionario_lotacao fl
SET ativo = false, data_fim = CURRENT_DATE
WHERE fl.ativo = true
  AND fl.funcionario_id = (
    SELECT id FROM public.funcionarios
    WHERE regexp_replace(COALESCE(matricula, ''), '[^0-9]', '', 'g') = '35744'
    LIMIT 1
  );

INSERT INTO public.funcionario_lotacao
  (funcionario_id, lotacao_id, vinculo_id, funcao, data_inicio, ativo, observacao)
SELECT
  f.id,
  l.id,
  NULL,
  NULL,
  '2026-06-24',
  true,
  'Migração RECEBIDO — CEDIDO DA SEMSA'
FROM public.funcionarios f
JOIN public.lotacoes l
  ON l.nome ILIKE '%Diretoria Técnica de Transporte%'
 AND COALESCE(l.ativo, true) = true
WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') = '35744'
  AND NOT EXISTS (
    SELECT 1 FROM public.funcionario_lotacao fl
    WHERE fl.funcionario_id = f.id AND fl.ativo = true
  )
ORDER BY length(l.nome)
LIMIT 1;

-- Jackson → CRAS Cohab
UPDATE public.funcionario_lotacao fl
SET ativo = false, data_fim = CURRENT_DATE
WHERE fl.ativo = true
  AND fl.funcionario_id = (
    SELECT id FROM public.funcionarios
    WHERE regexp_replace(COALESCE(matricula, ''), '[^0-9]', '', 'g') = '53844'
    LIMIT 1
  );

INSERT INTO public.funcionario_lotacao
  (funcionario_id, lotacao_id, vinculo_id, funcao, data_inicio, ativo, observacao)
SELECT
  f.id,
  l.id,
  NULL,
  NULL,
  '2026-06-24',
  true,
  'Migração RECEBIDO — CEDIDO DO COLISEU'
FROM public.funcionarios f
JOIN public.lotacoes l
  ON l.nome ILIKE 'CRAS Cohab%'
 AND COALESCE(l.ativo, true) = true
WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') = '53844'
  AND NOT EXISTS (
    SELECT 1 FROM public.funcionario_lotacao fl
    WHERE fl.funcionario_id = f.id AND fl.ativo = true
  )
ORDER BY length(l.nome)
LIMIT 1;

-- Flavio (já existe) → Abrigo Residência Inclusiva (se estiver sem lotação)
INSERT INTO public.funcionario_lotacao
  (funcionario_id, lotacao_id, vinculo_id, funcao, data_inicio, ativo, observacao)
SELECT
  f.id,
  l.id,
  NULL,
  NULL,
  '2026-06-24',
  true,
  'Migração RECEBIDO — CEDIDO DA SETUR'
FROM public.funcionarios f
JOIN public.lotacoes l
  ON (
    l.nome ILIKE '%Resid%ncia Inclusiva%'
    OR l.nome ILIKE '%Residencia Inclusiva%'
  )
 AND COALESCE(l.ativo, true) = true
WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') = '19924'
  AND NOT EXISTS (
    SELECT 1 FROM public.funcionario_lotacao fl
    WHERE fl.funcionario_id = f.id AND fl.ativo = true
  )
ORDER BY length(l.nome)
LIMIT 1;

-- ─────────────────────────────────────────────────────────────────
-- 3) CESSÃO RECEBIDO (menu Cedidos/Recebidos)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO public.funcionario_cedencias
  (funcionario_id, tipo, orgao_destino_origem, observacao, data_inicio, ativo)
SELECT f.id, 'RECEBIDO', 'Diretoria Técnica de Transporte', 'CEDIDO DA SEMSA', '2026-06-24', true
FROM public.funcionarios f
WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') = '35744'
  AND NOT EXISTS (
    SELECT 1 FROM public.funcionario_cedencias c
    WHERE c.funcionario_id = f.id AND COALESCE(c.ativo, true) = true
  );

INSERT INTO public.funcionario_cedencias
  (funcionario_id, tipo, orgao_destino_origem, observacao, data_inicio, ativo)
SELECT f.id, 'RECEBIDO', 'CRAS Cohab', 'CEDIDO DO COLISEU', '2026-06-24', true
FROM public.funcionarios f
WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') = '53844'
  AND NOT EXISTS (
    SELECT 1 FROM public.funcionario_cedencias c
    WHERE c.funcionario_id = f.id AND COALESCE(c.ativo, true) = true
  );

-- ─────────────────────────────────────────────────────────────────
-- 4) VERIFICAÇÃO
-- ─────────────────────────────────────────────────────────────────
SELECT tipo, COUNT(*) AS total
FROM public.v_cedencias_atuais
GROUP BY tipo
ORDER BY tipo;
-- Esperado: CEDIDO 18 | RECEBIDO 18

SELECT
  f.matricula,
  f.nome,
  c.tipo,
  c.orgao_destino_origem,
  c.observacao AS obs_cessao,
  l.nome AS lotacao
FROM public.funcionarios f
LEFT JOIN public.funcionario_cedencias c
  ON c.funcionario_id = f.id AND COALESCE(c.ativo, true) = true
LEFT JOIN public.funcionario_lotacao fl
  ON fl.funcionario_id = f.id AND fl.ativo = true
LEFT JOIN public.lotacoes l ON l.id = fl.lotacao_id
WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') IN ('35744', '19924', '53844')
ORDER BY f.nome;

COMMIT;
-- Se algo falhar: ROLLBACK;
