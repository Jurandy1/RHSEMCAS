-- Campo "Nome da Empresa" para servidores com vínculo Terceirizado
-- Execute no SQL Editor do Supabase.

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS empresa text;

COMMENT ON COLUMN public.funcionarios.empresa IS 'Nome da empresa terceirizada — usado quando o vínculo do servidor é "Terceirizado" (substitui matrícula/simbologia/ano do concurso na UI)';
