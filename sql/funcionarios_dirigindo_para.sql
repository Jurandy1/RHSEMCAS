-- Campo "Dirigindo para" — motoristas terceirizados
-- Lotação oficial permanece em Diretoria Técnica de Transporte (id 106).
-- Execute no SQL Editor do Supabase.

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS dirigindo_para text;

COMMENT ON COLUMN public.funcionarios.dirigindo_para IS
  'Unidade/setor para o qual o motorista terceirizado dirige (lotação oficial fixa na Diretoria Técnica de Transporte)';
