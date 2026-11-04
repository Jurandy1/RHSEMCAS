-- Folha de Ponto › Horário Individual
-- Horário próprio de um servidor (entrada/saída da manhã e da tarde). Quando existe, vale mais que o
-- horário da função (Funções e Horários) — inclusive para Serviço Prestado.
-- O 2º período (entrada2/saida2) pode ficar vazio: a folha sai com esses campos em branco.
-- Execute no SQL Editor do Supabase. Pode rodar de novo sem problema.

CREATE TABLE IF NOT EXISTS public.folha_ponto_servidor_horario (
  funcionario_id  bigint PRIMARY KEY,
  entrada1        text NOT NULL CHECK (entrada1 ~ '^\d{2}:\d{2}$'),
  saida1          text NOT NULL CHECK (saida1   ~ '^\d{2}:\d{2}$'),
  entrada2        text CHECK (entrada2 IS NULL OR entrada2 ~ '^\d{2}:\d{2}$'),
  saida2          text CHECK (saida2   IS NULL OR saida2   ~ '^\d{2}:\d{2}$'),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid DEFAULT auth.uid()
);

COMMENT ON TABLE public.folha_ponto_servidor_horario IS 'Folha de ponto: horário individual do servidor (sobrepõe o horário da função)';

ALTER TABLE public.folha_ponto_servidor_horario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fp_servidor_horario_select" ON public.folha_ponto_servidor_horario;
DROP POLICY IF EXISTS "fp_servidor_horario_write"  ON public.folha_ponto_servidor_horario;

CREATE POLICY "fp_servidor_horario_select" ON public.folha_ponto_servidor_horario
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "fp_servidor_horario_write" ON public.folha_ponto_servidor_horario
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.folha_ponto_servidor_horario TO authenticated;
