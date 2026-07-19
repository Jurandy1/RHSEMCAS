-- =====================================================================
-- Diagnóstico: Flavio (19924) e casos parecidos
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

-- 1) Flavio: de onde vem no RH?
SELECT
  f.id,
  f.nome,
  f.matricula,
  f.data_admissao,
  f.ativo,
  f.cpf
FROM public.funcionarios f
WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') LIKE '%19924%'
   OR f.nome ILIKE '%FLAVIO%MORAES%'
   OR f.nome ILIKE '%Flavio%Moraes%';

-- 2) Tem cessão ativa? (menu Cedidos/Recebidos)
SELECT *
FROM public.v_cedencias_atuais
WHERE regexp_replace(COALESCE(matricula, ''), '[^0-9]', '', 'g') LIKE '%19924%'
   OR nome ILIKE '%FLAVIO%MORAES%';

-- 3) Histórico de cessão (mesmo inativa)
SELECT c.*
FROM public.funcionario_cedencias c
WHERE c.funcionario_id IN (
  SELECT id FROM public.funcionarios f
  WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') LIKE '%19924%'
);

-- 4) Lotação / vínculo atuais (por isso aparece "—" na lista)
SELECT
  f.matricula,
  f.nome,
  v.vinculo,
  v.funcao,
  v.lotacao_nome
FROM public.funcionarios f
LEFT JOIN public.v_funcionarios_atual v ON v.funcionario_id = f.id
WHERE regexp_replace(COALESCE(f.matricula, ''), '[^0-9]', '', 'g') LIKE '%19924%';

-- 5) Mesmo padrão do Flavio: ativos no RH SEM lotação/vínculo na view
--    (aparecem em Funcionários com "—", NÃO precisam estar em Cedidos)
SELECT
  f.matricula,
  f.nome,
  f.data_admissao,
  v.vinculo,
  v.lotacao_nome,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.v_cedencias_atuais c WHERE c.funcionario_id = f.id
    ) THEN 'sim'
    ELSE 'nao'
  END AS esta_em_cedidos
FROM public.funcionarios f
LEFT JOIN public.v_funcionarios_atual v ON v.funcionario_id = f.id
WHERE COALESCE(f.ativo, true) = true
  AND (
    v.funcionario_id IS NULL
    OR NULLIF(trim(COALESCE(v.lotacao_nome, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(v.vinculo, '')), '') IS NULL
  )
ORDER BY f.nome;

-- 6) Parecem "cedidos" pela lotação, mas NÃO estão no menu Cedidos
SELECT
  f.matricula,
  f.nome,
  v.lotacao_nome,
  v.vinculo
FROM public.v_funcionarios_atual v
JOIN public.funcionarios f ON f.id = v.funcionario_id
WHERE (
    v.lotacao_nome ILIKE '%CEDIDO%'
    OR v.lotacao_nome ILIKE '%RECEBID%'
    OR v.lotacao_nome ILIKE '%OUTROS ORG%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.v_cedencias_atuais c WHERE c.funcionario_id = f.id
  )
ORDER BY f.nome;

-- 7) Contagem rápida
SELECT
  (SELECT count(*) FROM public.funcionarios WHERE COALESCE(ativo, true)) AS ativos_rh,
  (SELECT count(*) FROM public.v_cedencias_atuais) AS na_lista_cedidos,
  (SELECT count(*) FROM public.v_funcionarios_atual v
   WHERE NULLIF(trim(COALESCE(v.lotacao_nome, '')), '') IS NULL) AS sem_lotacao_na_view;
