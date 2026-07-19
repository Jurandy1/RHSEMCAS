-- =====================================================================
-- Importados pela planilha de Cedidos, mas FORA do menu Cedidos/Recebidos
-- (caso Flavio: obs "Adicionado via planilha de Cedidos...")
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

-- 1) Todos com a mesma observação de planilha
SELECT
  f.id,
  f.matricula,
  f.nome,
  f.created_at AS cadastrado_em,
  f.observacao,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.v_cedencias_atuais c WHERE c.funcionario_id = f.id
    ) THEN 'sim_no_menu'
    ELSE 'FALTA_NO_MENU'
  END AS situacao_cedidos
FROM public.funcionarios f
WHERE f.observacao ILIKE '%planilha%Cedidos%'
   OR f.observacao ILIKE '%Adicionado via planilha%'
ORDER BY
  CASE WHEN EXISTS (
    SELECT 1 FROM public.v_cedencias_atuais c WHERE c.funcionario_id = f.id
  ) THEN 1 ELSE 0 END,
  f.created_at;

-- 2) Só os que FALTAM no menu (como o Flavio)
SELECT
  f.id,
  f.matricula,
  f.nome,
  f.created_at,
  f.observacao,
  -- tenta extrair órgão da obs: "Origem/Destino: XXX"
  NULLIF(trim(both FROM substring(f.observacao from 'Origem/Destino:\s*(.+)$')), '') AS orgao_sugerido
FROM public.funcionarios f
WHERE (
    f.observacao ILIKE '%planilha%Cedidos%'
    OR f.observacao ILIKE '%Adicionado via planilha%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.v_cedencias_atuais c WHERE c.funcionario_id = f.id
  )
ORDER BY f.nome;

-- 3) Histórico de cessão (mesmo inativa) — se existir linha antiga
SELECT c.*
FROM public.funcionario_cedencias c
JOIN public.funcionarios f ON f.id = c.funcionario_id
WHERE f.observacao ILIKE '%planilha%Cedidos%'
ORDER BY c.funcionario_id, c.id;

-- 4) OPCIONAL — recriar cessão CEDIDO a partir da obs (revise antes de rodar!)
-- Descomente só depois de conferir o SELECT 2.
/*
INSERT INTO public.funcionario_cedencias (
  funcionario_id,
  tipo,
  orgao_destino_origem,
  observacao,
  ativo,
  data_inicio
)
SELECT
  f.id,
  'CEDIDO',
  COALESCE(
    NULLIF(trim(both FROM substring(f.observacao from 'Origem/Destino:\s*(.+)$')), ''),
    'NÃO INFORMADO'
  ),
  f.observacao,
  true,
  COALESCE(f.created_at::date, CURRENT_DATE)
FROM public.funcionarios f
WHERE (
    f.observacao ILIKE '%planilha%Cedidos%'
    OR f.observacao ILIKE '%Adicionado via planilha%'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.funcionario_cedencias c
    WHERE c.funcionario_id = f.id
      AND COALESCE(c.ativo, true) = true
  );
*/
