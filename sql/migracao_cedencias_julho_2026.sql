-- ═══════════════════════════════════════════════════════════════════
-- MIGRAÇÃO CEDÊNCIAS SEMCAS — julho/2026
-- Adaptado ao schema RHSEMCAS:
--   • Tabela: public.funcionario_cedencias  (PK = id)
--   • Nome/matrícula: public.funcionarios
--   • Menu: public.v_cedencias_atuais
-- Base: cruzamento com folha PMSL + folha Coliseu
-- Regra: SEMCAS na folha = não é cedido/recebido
-- Notas:
--   • Naurienne (id=41): matrícula já corrigida manualmente
--   • Andreia Carla (id=3): mantida por decisão do gestor
--   • Rosideth (id=26): mantida (não achada em nenhuma folha, validar depois)
-- ═══════════════════════════════════════════════════════════════════
--
-- ANTES: rode a seção 0 (checagem). Se os IDs baterem, rode o bloco BEGIN…COMMIT.
-- ═══════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------
-- 0) CHECAGEM — confira se os IDs são os mesmos da sua base
-- ---------------------------------------------------------------------
SELECT
  c.id AS cedencia_id,
  f.id AS funcionario_id,
  f.matricula,
  f.nome,
  c.tipo,
  c.orgao_destino_origem,
  c.observacao,
  c.ativo
FROM public.funcionario_cedencias c
JOIN public.funcionarios f ON f.id = c.funcionario_id
WHERE c.id IN (2, 6, 17, 18, 20, 25, 26, 27, 29, 41, 42, 43, 44, 45, 46, 47, 48)
ORDER BY c.id;

-- Quem será inserido (RECEBIDOS novos) — precisa existir em funcionarios
SELECT id, matricula, nome, ativo
FROM public.funcionarios
WHERE regexp_replace(COALESCE(matricula, ''), '[^0-9]', '', 'g') IN ('35744', '19924', '53844')
   OR nome ILIKE '%Dino Santos Lopes%'
   OR nome ILIKE '%Flavio%Moraes%'
   OR nome ILIKE '%Jackson Junior Pereira%';


BEGIN;

-- ───────────────────────────────────────────────────────────────────
-- 1) DELETES — servidores SEMCAS lotados em unidade SEMCAS
--    (não são cedidos nem recebidos)
-- ───────────────────────────────────────────────────────────────────

-- Marcus Vinicius (36404): servidor SEMCAS lotado no CRAS Janaína
DELETE FROM public.funcionario_cedencias WHERE id = 48;

-- Olga Helena (36758): folha PMSL mostra vínculo SEMCAS
DELETE FROM public.funcionario_cedencias WHERE id = 42;


-- ───────────────────────────────────────────────────────────────────
-- 2) UPDATES — matrículas erradas (confirmadas pelas folhas)
--    Matrícula fica em funcionarios, não na cessão
-- ───────────────────────────────────────────────────────────────────

-- Maria do Amparo: 47521 → 53024 (Coliseu)
UPDATE public.funcionarios f
SET matricula = '53024'
FROM public.funcionario_cedencias c
WHERE c.id = 18
  AND f.id = c.funcionario_id;

UPDATE public.funcionario_cedencias
SET orgao_destino_origem = 'CRAS Centro'
WHERE id = 18;

-- Rita de Cassia: 1575001 → 53395 (Coliseu)
UPDATE public.funcionarios f
SET matricula = '53395'
FROM public.funcionario_cedencias c
WHERE c.id = 25
  AND f.id = c.funcionario_id;

UPDATE public.funcionario_cedencias
SET orgao_destino_origem = 'CT Centro/Alemanha'
WHERE id = 25;

-- Sebastião Eleotério: 1204101 → 53220 (Coliseu)
UPDATE public.funcionarios f
SET matricula = '53220'
FROM public.funcionario_cedencias c
WHERE c.id = 29
  AND f.id = c.funcionario_id;

UPDATE public.funcionario_cedencias
SET orgao_destino_origem = 'Diretoria Técnica de Transporte'
WHERE id = 29;

-- Raquel Telles: 2823062 → 26185 (SEMUS)
UPDATE public.funcionarios f
SET matricula = '26185'
FROM public.funcionario_cedencias c
WHERE c.id = 44
  AND f.id = c.funcionario_id;


-- ───────────────────────────────────────────────────────────────────
-- 3) UPDATES — origem divergente (folha ≠ cadastro)
-- ───────────────────────────────────────────────────────────────────

-- Almir de Jesus Campos: folha diz SEMURH (não SEMAD)
UPDATE public.funcionario_cedencias
SET observacao = 'CEDIDO DA SEMURH',
    orgao_destino_origem = 'CRAS Anil'
WHERE id = 2;


-- ───────────────────────────────────────────────────────────────────
-- 4) UPDATES — normalização de nomes de lotação / órgão
-- ───────────────────────────────────────────────────────────────────

UPDATE public.funcionario_cedencias SET orgao_destino_origem = 'Abrigo Casa de Acolhida Temporária'                              WHERE id = 6;   -- Cleonildes
UPDATE public.funcionario_cedencias SET orgao_destino_origem = 'Centro POP Centro'                                               WHERE id = 17;  -- Liberato
UPDATE public.funcionario_cedencias SET orgao_destino_origem = 'CREAS Sol e Mar'                                                 WHERE id = 20;  -- Marilene
UPDATE public.funcionario_cedencias SET orgao_destino_origem = 'Abrigo Casa de Acolhida Temporária'                              WHERE id = 41;  -- Naurienne
UPDATE public.funcionario_cedencias SET orgao_destino_origem = 'Abrigo Casa de Acolhida Temporária'                              WHERE id = 43;  -- Raquel Lopes
UPDATE public.funcionario_cedencias SET orgao_destino_origem = 'Coordenação do Serviço Especializado em Abordagem Social – SEAS' WHERE id = 26;  -- Rosideth
UPDATE public.funcionario_cedencias SET orgao_destino_origem = 'CRAS Cohab'                                                      WHERE id = 27;  -- Sandra
UPDATE public.funcionario_cedencias SET orgao_destino_origem = 'Abrigo Casa de Acolhida Temporária'                              WHERE id = 46;  -- Sílvia
UPDATE public.funcionario_cedencias SET orgao_destino_origem = 'Abrigo Residência Inclusiva'                                     WHERE id = 47;  -- Thayna
UPDATE public.funcionario_cedencias SET orgao_destino_origem = 'Abrigo Casa de Acolhida Temporária'                              WHERE id = 45;  -- Werliane


-- ───────────────────────────────────────────────────────────────────
-- 5) INSERTS — 3 RECEBIDOS (só se já existirem em funcionarios
--    e ainda NÃO tiverem cessão ativa)
-- ───────────────────────────────────────────────────────────────────

-- Dino Santos Lopes (35744)
INSERT INTO public.funcionario_cedencias
  (funcionario_id, tipo, orgao_destino_origem, observacao, data_inicio, ativo)
SELECT
  f.id,
  'RECEBIDO',
  'Diretoria Técnica de Transporte',
  'CEDIDO DA SEMSA',
  '2026-06-24',
  true
FROM public.funcionarios f
WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') = '35744'
  AND NOT EXISTS (
    SELECT 1 FROM public.funcionario_cedencias c
    WHERE c.funcionario_id = f.id AND COALESCE(c.ativo, true) = true
  );

-- Flavio Márcio de Sousa Moraes (19924)
INSERT INTO public.funcionario_cedencias
  (funcionario_id, tipo, orgao_destino_origem, observacao, data_inicio, ativo)
SELECT
  f.id,
  'RECEBIDO',
  'Abrigo Residência Inclusiva',
  'CEDIDO DA SETUR',
  '2026-06-24',
  true
FROM public.funcionarios f
WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') = '19924'
  AND NOT EXISTS (
    SELECT 1 FROM public.funcionario_cedencias c
    WHERE c.funcionario_id = f.id AND COALESCE(c.ativo, true) = true
  );

-- Jackson Junior Pereira Brandão (53844)
INSERT INTO public.funcionario_cedencias
  (funcionario_id, tipo, orgao_destino_origem, observacao, data_inicio, ativo)
SELECT
  f.id,
  'RECEBIDO',
  'CRAS Cohab',
  'CEDIDO DO COLISEU',
  '2026-06-24',
  true
FROM public.funcionarios f
WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') = '53844'
  AND NOT EXISTS (
    SELECT 1 FROM public.funcionario_cedencias c
    WHERE c.funcionario_id = f.id AND COALESCE(c.ativo, true) = true
  );


-- ───────────────────────────────────────────────────────────────────
-- 6) VERIFICAÇÃO — conferir resultado antes de COMMIT
-- ───────────────────────────────────────────────────────────────────

SELECT tipo, COUNT(*) AS total
FROM public.v_cedencias_atuais
GROUP BY tipo
ORDER BY tipo;
-- Esperado aproximado: 18 CEDIDO + 18 RECEBIDO = 36
-- (ajuste se sua base tiver outros registros fora desta migração)

-- Se tudo ok:
COMMIT;

-- Se algo estiver errado:
-- ROLLBACK;
