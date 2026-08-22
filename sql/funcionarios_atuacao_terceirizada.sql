-- Atuação extra em empresa terceirizada (ex.: Comissionado que também atua na PROCAD)
-- Mantém o vínculo oficial e ainda assim aparece no menu Terceirizados.
-- Execute no SQL Editor do Supabase.

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS atuacao_terceirizada boolean DEFAULT false;

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS funcao_terceirizada text;

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS turno_terceirizada text;

COMMENT ON COLUMN public.funcionarios.atuacao_terceirizada IS
  'true = servidor com vínculo SEMCAS (ex. Comissionado) que também atua em empresa terceirizada';
COMMENT ON COLUMN public.funcionarios.funcao_terceirizada IS
  'Função na empresa terceirizada (quando atuacao_terceirizada = true)';
COMMENT ON COLUMN public.funcionarios.turno_terceirizada IS
  'Turno na empresa terceirizada (quando atuacao_terceirizada = true)';
