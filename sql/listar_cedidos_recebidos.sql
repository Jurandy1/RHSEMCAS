-- =====================================================================
-- Nomes que estão no menu Cedidos/Recebidos (cessões atuais)
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

-- Lista completa
SELECT
  matricula,
  nome,
  tipo,                      -- CEDIDO ou RECEBIDO
  orgao_destino_origem,
  data_inicio,
  lotacao_nome,
  vinculo,
  funcionario_id,
  id AS cedencia_id
FROM public.v_cedencias_atuais
ORDER BY tipo, nome;

-- Só os nomes (rápido)
SELECT nome
FROM public.v_cedencias_atuais
ORDER BY nome;

-- Contagem por tipo
SELECT tipo, count(*) AS total
FROM public.v_cedencias_atuais
GROUP BY tipo
ORDER BY tipo;
