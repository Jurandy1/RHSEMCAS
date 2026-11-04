-- Folha de Ponto › Horário Individual
-- Horário próprio de um servidor (entrada/saída do 1º e do 2º período). Quando existe, vale mais que o
-- horário da função (Funções e Horários) — inclusive para Serviço Prestado.
-- Pode ter só o 1º período, só o 2º ou os dois; o período vazio sai em branco na folha.
-- Execute no SQL Editor do Supabase. Pode rodar de novo sem problema (também atualiza a versão anterior,
-- que exigia o 1º período).

CREATE TABLE IF NOT EXISTS public.folha_ponto_servidor_horario (
  funcionario_id  bigint PRIMARY KEY,
  entrada1        text,
  saida1          text,
  entrada2        text,
  saida2          text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid DEFAULT auth.uid()
);

-- Versão anterior: 1º período obrigatório
ALTER TABLE public.folha_ponto_servidor_horario ALTER COLUMN entrada1 DROP NOT NULL;
ALTER TABLE public.folha_ponto_servidor_horario ALTER COLUMN saida1   DROP NOT NULL;

-- Troca as regras antigas pelas atuais
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.folha_ponto_servidor_horario'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.folha_ponto_servidor_horario DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.folha_ponto_servidor_horario
  ADD CONSTRAINT fp_srv_hor_formato CHECK (
        (entrada1 IS NULL OR entrada1 ~ '^\d{2}:\d{2}$') AND (saida1 IS NULL OR saida1 ~ '^\d{2}:\d{2}$')
    AND (entrada2 IS NULL OR entrada2 ~ '^\d{2}:\d{2}$') AND (saida2 IS NULL OR saida2 ~ '^\d{2}:\d{2}$')),
  -- cada período tem entrada e saída juntas (ou nenhuma das duas)
  ADD CONSTRAINT fp_srv_hor_pares CHECK ((entrada1 IS NULL) = (saida1 IS NULL) AND (entrada2 IS NULL) = (saida2 IS NULL)),
  -- pelo menos um período preenchido
  ADD CONSTRAINT fp_srv_hor_algum CHECK (entrada1 IS NOT NULL OR entrada2 IS NOT NULL);

COMMENT ON TABLE public.folha_ponto_servidor_horario IS 'Folha de ponto: horário individual do servidor (sobrepõe o horário da função)';

ALTER TABLE public.folha_ponto_servidor_horario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fp_servidor_horario_select" ON public.folha_ponto_servidor_horario;
DROP POLICY IF EXISTS "fp_servidor_horario_write"  ON public.folha_ponto_servidor_horario;

CREATE POLICY "fp_servidor_horario_select" ON public.folha_ponto_servidor_horario
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "fp_servidor_horario_write" ON public.folha_ponto_servidor_horario
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.folha_ponto_servidor_horario TO authenticated;
