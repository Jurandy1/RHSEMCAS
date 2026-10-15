-- Folha de Ponto › Funções e Horários
-- Guarda, por Função + Vínculo do servidor (ex.: ADMINISTRATIVO / Comissionado), se ele sai na folha
-- com o horário Padrão ou Dia todo. Sem linha aqui = Padrão. Serviço Prestado é sempre Padrão (regra no app).
-- Os horários de cada tipo ficam no app (js/app.js).
-- Execute no SQL Editor do Supabase. Pode rodar de novo sem problema: cria a tabela se não existir
-- e atualiza a versão antiga (chave só por função) para função + vínculo, mantendo o que já foi marcado.

CREATE TABLE IF NOT EXISTS public.folha_ponto_funcao_horario (
  funcao      text NOT NULL,
  vinculo     text NOT NULL DEFAULT '',
  horario     text NOT NULL DEFAULT 'padrao' CHECK (horario IN ('padrao', 'dia_todo')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid DEFAULT auth.uid()
);

-- Versão antiga: chave só por função → passa a ser função + vínculo
ALTER TABLE public.folha_ponto_funcao_horario ADD COLUMN IF NOT EXISTS vinculo text NOT NULL DEFAULT '';
ALTER TABLE public.folha_ponto_funcao_horario DROP CONSTRAINT IF EXISTS folha_ponto_funcao_horario_pkey;
ALTER TABLE public.folha_ponto_funcao_horario ADD CONSTRAINT folha_ponto_funcao_horario_pkey PRIMARY KEY (funcao, vinculo);

COMMENT ON TABLE public.folha_ponto_funcao_horario IS 'Folha de ponto: horário (padrao | dia_todo) por função + vínculo do servidor';

ALTER TABLE public.folha_ponto_funcao_horario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fp_funcao_horario_select" ON public.folha_ponto_funcao_horario;
DROP POLICY IF EXISTS "fp_funcao_horario_write"  ON public.folha_ponto_funcao_horario;

CREATE POLICY "fp_funcao_horario_select" ON public.folha_ponto_funcao_horario
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "fp_funcao_horario_write" ON public.folha_ponto_funcao_horario
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.folha_ponto_funcao_horario TO authenticated;

-- Função + vínculo de quem tem folha (com matrícula, ou efetivo/comissionado/contrato), menos Serviço Prestado
DROP TABLE IF EXISTS _fp_funcao_vinculo;
CREATE TEMP TABLE _fp_funcao_vinculo AS
SELECT DISTINCT UPPER(TRIM(v.funcao)) AS funcao, COALESCE(NULLIF(TRIM(v.vinculo), ''), 'Sem vínculo') AS vinculo
FROM public.v_funcionarios_atual v
WHERE NULLIF(TRIM(v.funcao), '') IS NOT NULL
  AND COALESCE(v.vinculo, '') NOT ILIKE '%prestado%'
  AND (
       NULLIF(TRIM(v.matricula), '') IS NOT NULL
    OR (COALESCE(v.vinculo, '') NOT ILIKE '%terceiriz%'
        AND (v.vinculo ILIKE '%efetivo%' OR v.vinculo ILIKE '%comission%' OR v.vinculo ILIKE '%contrat%'))
  );

-- Linhas antigas (só função) viram uma linha por vínculo, com o mesmo horário
INSERT INTO public.folha_ponto_funcao_horario (funcao, vinculo, horario)
SELECT h.funcao, fv.vinculo, h.horario
FROM public.folha_ponto_funcao_horario h
JOIN _fp_funcao_vinculo fv ON fv.funcao = h.funcao
WHERE h.vinculo = ''
ON CONFLICT (funcao, vinculo) DO NOTHING;

DELETE FROM public.folha_ponto_funcao_horario WHERE vinculo = '';

-- Carga inicial: funções que ficam o dia todo (não mexe no que já foi escolhido)
INSERT INTO public.folha_ponto_funcao_horario (funcao, vinculo, horario)
SELECT fv.funcao, fv.vinculo, 'dia_todo'
FROM _fp_funcao_vinculo fv
WHERE fv.funcao ILIKE 'COORD%'
   OR fv.funcao ILIKE 'DIRETOR% T_CNIC%'
   OR fv.funcao ILIKE 'ANALISTA T_CNIC%'
   OR fv.funcao ILIKE 'CHEFE D_ ASSESSORIA JUR_DICA%'
   OR fv.funcao ILIKE 'SECRET_RIO% MUNICIPAL%'
   OR fv.funcao ILIKE 'SECRET_RIO% ADJUNTO%'
   OR fv.funcao ILIKE 'CHEFE DE GABINETE%'
   OR fv.funcao ILIKE 'SUPERINTENDENTE%'
ON CONFLICT (funcao, vinculo) DO NOTHING;

DROP TABLE IF EXISTS _fp_funcao_vinculo;
