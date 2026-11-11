-- =====================================================================
-- Simbologia: padroniza no formato com hífen (DAS-1, DAI-3...)
-- O sistema passou a gravar "DAS-1", mas a constraint antiga só aceitava
-- "DAS 1" (com espaço) — por isso dava erro ao criar/editar servidor.
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

BEGIN;

ALTER TABLE public.funcionarios
  DROP CONSTRAINT IF EXISTS funcionarios_simbologia_check;

-- Converte os valores já gravados para o padrão com hífen.
-- Aceita variações como "DAS 1", "das-1", "DAS1", "DAS - 01", "DAÍ 3",
-- "SIMBOLOGIA DAS 3", espaço especial (nbsp) etc.
UPDATE public.funcionarios f
SET simbologia = x.nova
FROM (
  SELECT id,
    CASE
      WHEN m IS NOT NULL THEN m[1] || '-' || (m[2]::int)::text
      WHEN limpo IN ('DAS', 'DAE') THEN limpo
      WHEN limpo = '' THEN NULL
    END AS nova,
    (m IS NOT NULL OR limpo IN ('DAS', 'DAE', '')) AS reconhecido
  FROM (
    SELECT id,
      btrim(translate(upper(replace(simbologia, chr(160), ' ')), 'ÍÌ', 'II')) AS limpo,
      regexp_match(
        translate(upper(replace(simbologia, chr(160), ' ')), 'ÍÌ', 'II'),
        '(DA[SIE])\s*[-–—_.]?\s*([0-9]+)'
      ) AS m
    FROM public.funcionarios
    WHERE simbologia IS NOT NULL
  ) s
) x
WHERE f.id = x.id
  AND x.reconhecido
  AND f.simbologia IS DISTINCT FROM x.nova;

-- NOT VALID: não trava o script se sobrar algum valor antigo fora do padrão.
ALTER TABLE public.funcionarios
  ADD CONSTRAINT funcionarios_simbologia_check
  CHECK (
    simbologia IS NULL
    OR simbologia IN (
      'DAS',
      'DAS-1', 'DAS-2', 'DAS-3', 'DAS-4', 'DAS-5', 'DAS-6', 'DAS-7',
      'DAI-1', 'DAI-2', 'DAI-3', 'DAI-4', 'DAI-5',
      'DAE',
      'DAE-1', 'DAE-2', 'DAE-3', 'DAE-4', 'DAE-5'
    )
  ) NOT VALID;

COMMENT ON COLUMN public.funcionarios.simbologia IS
  'Simbologia funcional: DAS, DAS-1 a DAS-7, DAI-1 a DAI-5, DAE, DAE-1 a DAE-5';

COMMIT;

-- Confere também os registros antigos. Se sobrar valor fora da lista, só esta
-- etapa dá erro (o que veio antes já ficou salvo) — rode o SELECT abaixo sozinho.
ALTER TABLE public.funcionarios VALIDATE CONSTRAINT funcionarios_simbologia_check;

-- Resultado: servidores que AINDA estão com simbologia fora da lista.
-- Se vier vazio, está tudo certo. Se vier algo, mande os valores para ajustar.
SELECT id, nome, simbologia
FROM public.funcionarios
WHERE simbologia IS NOT NULL
  AND simbologia NOT IN (
    'DAS',
    'DAS-1', 'DAS-2', 'DAS-3', 'DAS-4', 'DAS-5', 'DAS-6', 'DAS-7',
    'DAI-1', 'DAI-2', 'DAI-3', 'DAI-4', 'DAI-5',
    'DAE',
    'DAE-1', 'DAE-2', 'DAE-3', 'DAE-4', 'DAE-5'
  )
ORDER BY simbologia, nome;
