-- =====================================================================
-- Menu "Cedidos e Recebidos" — consulta + correção
-- Fonte da tela: view public.v_cedencias_atuais
-- Tabela editável: public.funcionario_cedencias
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) O QUE O MENU MOSTRA (igual à tela)
-- ---------------------------------------------------------------------
SELECT
  id AS cedencia_id,
  funcionario_id,
  matricula,
  nome,
  tipo,                      -- CEDIDO | RECEBIDO
  orgao_destino_origem,      -- órgão (destino/origem)
  observacao,
  lotacao_nome,
  vinculo,
  data_inicio,
  created_at
FROM public.v_cedencias_atuais
ORDER BY tipo, nome;

-- Contagem (KPIs do menu)
SELECT * FROM public.v_cedencias_kpis;

-- ---------------------------------------------------------------------
-- 2) TABELA REAL (para corrigir) + dados do servidor
-- ---------------------------------------------------------------------
SELECT
  c.id AS cedencia_id,
  c.funcionario_id,
  f.matricula,
  f.nome,
  f.ativo AS funcionario_ativo,
  c.tipo,
  c.orgao_destino_origem,
  c.observacao,
  c.data_inicio,
  c.ativo AS cedencia_ativa,
  c.created_at
FROM public.funcionario_cedencias c
JOIN public.funcionarios f ON f.id = c.funcionario_id
WHERE COALESCE(c.ativo, true) = true
ORDER BY c.tipo, f.nome;

-- Histórico completo (ativas + inativas)
SELECT
  c.id,
  f.matricula,
  f.nome,
  c.tipo,
  c.orgao_destino_origem,
  c.observacao,
  c.data_inicio,
  c.ativo,
  c.created_at
FROM public.funcionario_cedencias c
JOIN public.funcionarios f ON f.id = c.funcionario_id
ORDER BY f.nome, c.id;

-- ---------------------------------------------------------------------
-- 3) BUSCAR UM REGISTRO ANTES DE CORRIGIR
-- ---------------------------------------------------------------------
-- Por nome:
-- SELECT c.*, f.nome, f.matricula
-- FROM public.funcionario_cedencias c
-- JOIN public.funcionarios f ON f.id = c.funcionario_id
-- WHERE f.nome ILIKE '%FLAVIO%MORAES%';

-- Por matrícula:
-- SELECT c.*, f.nome, f.matricula
-- FROM public.funcionario_cedencias c
-- JOIN public.funcionarios f ON f.id = c.funcionario_id
-- WHERE regexp_replace(COALESCE(f.matricula,''), '[^0-9]', '', 'g') LIKE '%19924%';

-- Por órgão errado:
-- SELECT c.id, f.matricula, f.nome, c.tipo, c.orgao_destino_origem, c.observacao
-- FROM public.funcionario_cedencias c
-- JOIN public.funcionarios f ON f.id = c.funcionario_id
-- WHERE c.orgao_destino_origem ILIKE '%RESIDENCIA%';

-- ---------------------------------------------------------------------
-- 4) CORREÇÕES (edite os valores / IDs antes de rodar)
-- ---------------------------------------------------------------------

-- 4a) Corrigir órgão / tipo / observação / data
-- UPDATE public.funcionario_cedencias
-- SET
--   tipo = 'CEDIDO',                          -- ou 'RECEBIDO'
--   orgao_destino_origem = 'NOME CORRETO DO ÓRGÃO',
--   observacao = 'texto corrigido',
--   data_inicio = '2026-06-24'
-- WHERE id = 123;                            -- cedencia_id da consulta

-- 4b) Corrigir vários com o mesmo órgão errado
-- UPDATE public.funcionario_cedencias
-- SET orgao_destino_origem = 'NOME CORRETO'
-- WHERE orgao_destino_origem = 'NOME ERRADO'
--   AND COALESCE(ativo, true) = true;

-- 4c) Trocar tipo CEDIDO ↔ RECEBIDO
-- UPDATE public.funcionario_cedencias
-- SET tipo = 'RECEBIDO'
-- WHERE id = 123;

-- 4d) Inativar (some do menu, sem apagar histórico)
-- UPDATE public.funcionario_cedencias
-- SET ativo = false
-- WHERE id = 123;

-- 4e) Excluir de vez (some do menu)
-- DELETE FROM public.funcionario_cedencias
-- WHERE id = 123;

-- 4f) Incluir quem está no RH mas falta no menu (ex.: import planilha)
-- INSERT INTO public.funcionario_cedencias (
--   funcionario_id, tipo, orgao_destino_origem, observacao, ativo, data_inicio
-- ) VALUES (
--   1261,                    -- id do funcionarios
--   'CEDIDO',
--   'RESIDENCIA INCLUSIVA',
--   'Corrigido manualmente',
--   true,
--   '2026-06-24'
-- );

-- ---------------------------------------------------------------------
-- 5) ÓRGÃOS QUE APARECEM NO FILTRO DO MENU
-- ---------------------------------------------------------------------
SELECT DISTINCT trim(orgao_destino_origem) AS orgao, count(*) AS qtd
FROM public.v_cedencias_atuais
WHERE NULLIF(trim(orgao_destino_origem), '') IS NOT NULL
GROUP BY 1
ORDER BY 1;
