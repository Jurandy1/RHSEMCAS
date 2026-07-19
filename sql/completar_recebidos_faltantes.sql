-- ═══════════════════════════════════════════════════════════════════
-- Completar RECEBIDOS faltantes (meta: 18 CEDIDO + 18 RECEBIDO)
-- Situação atual reportada: 18 CEDIDO + 16 RECEBIDO (−2)
-- ═══════════════════════════════════════════════════════════════════

-- 1) Os 3 que a migração tentou inserir — status
SELECT
  x.matricula_alvo,
  x.nome_alvo,
  f.id AS funcionario_id,
  f.matricula AS mat_no_rh,
  f.nome AS nome_no_rh,
  CASE
    WHEN f.id IS NULL THEN 'SEM_CADASTRO_RH'
    WHEN EXISTS (
      SELECT 1 FROM public.v_cedencias_atuais c WHERE c.funcionario_id = f.id
    ) THEN 'JA_NO_MENU'
    ELSE 'FALTA_NO_MENU'
  END AS status
FROM (VALUES
  ('35744', 'Dino Santos Lopes'),
  ('19924', 'Flavio Márcio de Sousa Moraes'),
  ('53844', 'Jackson Junior Pereira Brandão')
) AS x(matricula_alvo, nome_alvo)
LEFT JOIN public.funcionarios f
  ON regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') = x.matricula_alvo
  OR f.nome ILIKE '%' || split_part(x.nome_alvo, ' ', 1) || '%' || split_part(x.nome_alvo, ' ', -1) || '%';

-- 2) Quem está no menu RECEBIDO agora
SELECT matricula, nome, orgao_destino_origem, observacao
FROM public.v_cedencias_atuais
WHERE tipo = 'RECEBIDO'
ORDER BY nome;


-- 3) INSERIR os que faltam (só os que existem no RH e não estão no menu)
-- Dino
INSERT INTO public.funcionario_cedencias
  (funcionario_id, tipo, orgao_destino_origem, observacao, data_inicio, ativo)
SELECT f.id, 'RECEBIDO', 'Diretoria Técnica de Transporte', 'CEDIDO DA SEMSA', '2026-06-24', true
FROM public.funcionarios f
WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') = '35744'
  AND NOT EXISTS (
    SELECT 1 FROM public.funcionario_cedencias c
    WHERE c.funcionario_id = f.id AND COALESCE(c.ativo, true) = true
  );

-- Flavio
INSERT INTO public.funcionario_cedencias
  (funcionario_id, tipo, orgao_destino_origem, observacao, data_inicio, ativo)
SELECT f.id, 'RECEBIDO', 'Abrigo Residência Inclusiva', 'CEDIDO DA SETUR', '2026-06-24', true
FROM public.funcionarios f
WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') = '19924'
  AND NOT EXISTS (
    SELECT 1 FROM public.funcionario_cedencias c
    WHERE c.funcionario_id = f.id AND COALESCE(c.ativo, true) = true
  );

-- Jackson
INSERT INTO public.funcionario_cedencias
  (funcionario_id, tipo, orgao_destino_origem, observacao, data_inicio, ativo)
SELECT f.id, 'RECEBIDO', 'CRAS Cohab', 'CEDIDO DO COLISEU', '2026-06-24', true
FROM public.funcionarios f
WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') = '53844'
  AND NOT EXISTS (
    SELECT 1 FROM public.funcionario_cedencias c
    WHERE c.funcionario_id = f.id AND COALESCE(c.ativo, true) = true
  );

-- 4) Conferir de novo
SELECT tipo, COUNT(*) AS total
FROM public.v_cedencias_atuais
GROUP BY tipo
ORDER BY tipo;
-- Meta: CEDIDO 18 + RECEBIDO 18
