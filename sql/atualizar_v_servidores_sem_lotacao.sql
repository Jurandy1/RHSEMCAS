-- =====================================================================
-- Atualiza v_servidores_sem_lotacao: última função, lotação e data de saída
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

CREATE OR REPLACE VIEW public.v_servidores_sem_lotacao AS
SELECT
  f.id AS funcionario_id,
  f.nome,
  f.matricula,
  f.cpf,
  f.email,
  f.telefone,
  f.simbologia,
  f.data_admissao,
  f.observacao,
  f.ativo,
  fl.funcao AS ultima_funcao,
  fl.funcao AS ultimo_cargo,
  l.nome AS ultima_lotacao,
  v.categoria AS ultimo_vinculo,
  fl.data_fim AS sem_lotacao_desde,
  fl.data_inicio AS ultima_lotacao_inicio,
  fl.observacao AS ultima_lotacao_obs
FROM public.funcionarios f
LEFT JOIN LATERAL (
  SELECT fl2.*
  FROM public.funcionario_lotacao fl2
  WHERE fl2.funcionario_id = f.id
  ORDER BY
    COALESCE(fl2.data_fim, fl2.data_inicio) DESC NULLS LAST,
    fl2.id DESC
  LIMIT 1
) fl ON true
LEFT JOIN public.lotacoes l ON l.id = fl.lotacao_id
LEFT JOIN public.vinculos v ON v.id = fl.vinculo_id
WHERE COALESCE(f.ativo, true) = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.funcionario_lotacao flx
    WHERE flx.funcionario_id = f.id
      AND flx.ativo = true
  );

GRANT SELECT ON public.v_servidores_sem_lotacao TO authenticated;
REVOKE ALL ON public.v_servidores_sem_lotacao FROM anon;
