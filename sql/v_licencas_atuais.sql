-- Fonte da verdade: funcionario_licencas.ativo = true
-- Não filtra pela lotação "Licenças e Afastamentos".
-- Rode no SQL Editor do Supabase.

DROP VIEW IF EXISTS public.v_licencas_atuais;

CREATE VIEW public.v_licencas_atuais AS
SELECT
  fl.id              AS licenca_id,
  fl.funcionario_id,
  f.nome,
  f.matricula,
  fl.tipo_afastamento,
  fl.data_inicial,
  fl.data_final,
  fl.portaria,
  fl.num_sei,
  fl.observacao,
  fl.ativo,
  fl.created_at
FROM public.funcionario_licencas fl
JOIN public.funcionarios f
  ON f.id = fl.funcionario_id
WHERE fl.ativo = true;

GRANT SELECT ON public.v_licencas_atuais TO authenticated;
