-- Folha de Ponto › Feriados — gerenciamento completo
-- Todos os feriados (inclusive os oficiais) passam a morar na tabela public.feriados, editáveis pelo app.
--   abrangencia : nacional | estadual (Maranhão) | municipal (São Luís)
--   tipo        : feriado | ponto_facultativo  (ponto facultativo NÃO bloqueia o dia na folha)
--   recorrente  : true = repete todo ano no mesmo dia/mês
--   regra       : data móvel calculada pela Páscoa (ex.: 'pascoa-47' = Carnaval). Ignora a data gravada.
--   oficial     : feriado de lei; excluir só desativa (ativo = false), pode ser reativado pelo SQL
-- Execute no SQL Editor do Supabase. Pode rodar de novo sem problema.

ALTER TABLE public.feriados ADD COLUMN IF NOT EXISTS abrangencia text;
ALTER TABLE public.feriados ADD COLUMN IF NOT EXISTS recorrente  boolean NOT NULL DEFAULT false;
ALTER TABLE public.feriados ADD COLUMN IF NOT EXISTS regra       text;
ALTER TABLE public.feriados ADD COLUMN IF NOT EXISTS oficial     boolean NOT NULL DEFAULT false;
ALTER TABLE public.feriados ADD COLUMN IF NOT EXISTS ativo       boolean NOT NULL DEFAULT true;
ALTER TABLE public.feriados ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.feriados ADD COLUMN IF NOT EXISTS created_by  uuid DEFAULT auth.uid();
ALTER TABLE public.feriados ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.feriados ADD COLUMN IF NOT EXISTS updated_by  uuid DEFAULT auth.uid();

-- Cadastros antigos ("Personalizado") viram feriado municipal de data única
UPDATE public.feriados SET abrangencia = 'municipal' WHERE abrangencia IS NULL;
UPDATE public.feriados SET tipo = 'feriado' WHERE tipo IS NULL OR tipo NOT IN ('feriado', 'ponto_facultativo');

ALTER TABLE public.feriados ALTER COLUMN abrangencia SET NOT NULL;
ALTER TABLE public.feriados ALTER COLUMN abrangencia SET DEFAULT 'municipal';
ALTER TABLE public.feriados ALTER COLUMN tipo SET DEFAULT 'feriado';

ALTER TABLE public.feriados DROP CONSTRAINT IF EXISTS feriados_abrangencia_chk;
ALTER TABLE public.feriados ADD  CONSTRAINT feriados_abrangencia_chk CHECK (abrangencia IN ('nacional', 'estadual', 'municipal'));
ALTER TABLE public.feriados DROP CONSTRAINT IF EXISTS feriados_tipo_chk;
ALTER TABLE public.feriados ADD  CONSTRAINT feriados_tipo_chk CHECK (tipo IN ('feriado', 'ponto_facultativo'));
ALTER TABLE public.feriados DROP CONSTRAINT IF EXISTS feriados_regra_chk;
ALTER TABLE public.feriados ADD  CONSTRAINT feriados_regra_chk CHECK (regra IS NULL OR regra ~ '^pascoa[+-][0-9]+$');

COMMENT ON TABLE public.feriados IS 'Folha de ponto: feriados e pontos facultativos (nacional, estadual MA, municipal São Luís)';

-- updated_at / updated_by automáticos
CREATE OR REPLACE FUNCTION public.fn_feriados_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_feriados_touch ON public.feriados;
CREATE TRIGGER trg_feriados_touch BEFORE UPDATE ON public.feriados
  FOR EACH ROW EXECUTE FUNCTION public.fn_feriados_touch();

-- Feriados oficiais (só insere o que ainda não existe com o mesmo nome)
INSERT INTO public.feriados (data, nome, abrangencia, tipo, recorrente, regra, oficial, ativo)
SELECT v.data::date, v.nome, v.abrangencia, v.tipo, true, v.regra, true, true
FROM (VALUES
  ('2026-01-01', 'Confraternização Universal',    'nacional',  'feriado',           NULL),
  ('2026-02-17', 'Carnaval',                      'nacional',  'ponto_facultativo', 'pascoa-47'),
  ('2026-04-03', 'Sexta-feira Santa',             'nacional',  'feriado',           'pascoa-2'),
  ('2026-04-05', 'Páscoa',                        'nacional',  'feriado',           'pascoa+0'),
  ('2026-04-21', 'Tiradentes',                    'nacional',  'feriado',           NULL),
  ('2026-05-01', 'Dia do Trabalhador',            'nacional',  'feriado',           NULL),
  ('2026-06-04', 'Corpus Christi',                'nacional',  'ponto_facultativo', 'pascoa+60'),
  ('2026-09-07', 'Independência do Brasil',       'nacional',  'feriado',           NULL),
  ('2026-10-12', 'Nossa Senhora Aparecida',       'nacional',  'feriado',           NULL),
  ('2026-11-02', 'Finados',                       'nacional',  'feriado',           NULL),
  ('2026-11-15', 'Proclamação da República',      'nacional',  'feriado',           NULL),
  ('2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional', 'feriado', NULL),
  ('2026-12-25', 'Natal',                         'nacional',  'feriado',           NULL),
  ('2026-07-28', 'Adesão do Maranhão à Independência', 'estadual', 'feriado',       NULL),
  ('2026-09-08', 'Aniversário de São Luís',       'municipal', 'feriado',           NULL)
) AS v(data, nome, abrangencia, tipo, regra)
WHERE NOT EXISTS (SELECT 1 FROM public.feriados f WHERE lower(f.nome) = lower(v.nome));

-- Permissões: usuários logados leem e mantêm o calendário (o app registra cada ação em sistema_logs)
ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feriados_select" ON public.feriados;
DROP POLICY IF EXISTS "feriados_write"  ON public.feriados;
CREATE POLICY "feriados_select" ON public.feriados FOR SELECT TO authenticated USING (true);
CREATE POLICY "feriados_write"  ON public.feriados FOR ALL    TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feriados TO authenticated;
