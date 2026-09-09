-- Mantém "Plantão" para os 41 registros históricos, mas a aplicação não
-- oferece mais essa opção em novos cadastros.
UPDATE public.turnos
SET nome = '40hrs'
WHERE lower(trim(nome)) IN ('40h', '40 horas', '40hrs');

INSERT INTO public.turnos (nome)
SELECT nome
FROM (VALUES
  ('Plantão diurno'),
  ('Plantão noturno'),
  ('Matutino'),
  ('Vespertino'),
  ('40hrs')
) AS novos(nome)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.turnos t
  WHERE lower(trim(t.nome)) = lower(trim(novos.nome))
);
