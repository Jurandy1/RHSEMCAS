-- Lotação na atuação terceirizada (quando "Também atua como terceirizado")
-- Unidade onde o servidor trabalha na empresa, sem alterar a lotação oficial SEMCAS.
-- Execute no SQL Editor do Supabase.

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS lotacao_terceirizada text;

COMMENT ON COLUMN public.funcionarios.lotacao_terceirizada IS
  'Unidade/lotação onde o servidor atua na empresa terceirizada (quando atuacao_terceirizada = true)';
