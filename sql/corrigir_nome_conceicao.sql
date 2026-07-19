-- Corrige nome fragmentado no RH: "Concei Ção" → "Conceição"
-- Rode no SQL Editor do Supabase.

-- Conferir antes:
SELECT id, nome, matricula, ativo
FROM funcionarios
WHERE nome ILIKE '%Concei%Ção%'
   OR nome ILIKE '%Concei Ção%'
   OR nome ILIKE '%Concei Cao%';

-- Corrigir:
UPDATE funcionarios
SET nome = 'Maria Do Amparo Conceição Lima'
WHERE nome ILIKE '%Maria%Amparo%Concei%Lima%'
  AND (
    nome ILIKE '%Concei Ção%'
    OR nome ILIKE '%Concei%Ção%'
    OR nome ILIKE '%Concei Cao%'
  );

-- Conferir depois:
SELECT id, nome, matricula, ativo
FROM funcionarios
WHERE nome ILIKE '%Maria%Amparo%Concei%Lima%';
