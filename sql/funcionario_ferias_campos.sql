-- Campos extras do módulo de Controle de Férias (UI v2)
-- Execute no SQL Editor do Supabase.

ALTER TABLE public.funcionario_ferias
  ADD COLUMN IF NOT EXISTS periodo_aquisitivo text,
  ADD COLUMN IF NOT EXISTS periodo_pendente text,
  ADD COLUMN IF NOT EXISTS link_solicitacao text,
  ADD COLUMN IF NOT EXISTS status_ferias text;

COMMENT ON COLUMN public.funcionario_ferias.periodo_aquisitivo IS 'Ex.: 2024/2025';
COMMENT ON COLUMN public.funcionario_ferias.periodo_pendente IS 'Período pendente de gozo (texto livre)';
COMMENT ON COLUMN public.funcionario_ferias.link_solicitacao IS 'URL do e-mail / SEI / solicitação';
COMMENT ON COLUMN public.funcionario_ferias.status_ferias IS 'Programado | Em Gozo | Pendente | Concluído | Cancelado';
