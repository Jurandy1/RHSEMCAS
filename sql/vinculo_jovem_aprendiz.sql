-- Vínculo "Jovem Aprendiz" (aparece no dashboard e nos selects de cadastro)
-- Execute no SQL Editor do Supabase.

INSERT INTO public.vinculos (categoria)
SELECT 'Jovem Aprendiz'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.vinculos
  WHERE lower(trim(categoria)) = 'jovem aprendiz'
);
