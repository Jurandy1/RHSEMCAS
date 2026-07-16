-- =====================================================================
-- Simbologia (DAS / DAI) no cadastro de servidores
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS simbologia text;

COMMENT ON COLUMN public.funcionarios.simbologia IS
  'Simbologia funcional: DAS, DAS 1–7, DAI 1–5';

-- Opcional: restringe aos valores oficiais (comenta se preferir livre)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'funcionarios_simbologia_check'
  ) THEN
    ALTER TABLE public.funcionarios
      ADD CONSTRAINT funcionarios_simbologia_check
      CHECK (
        simbologia IS NULL
        OR simbologia IN (
          'DAS',
          'DAS 1', 'DAS 2', 'DAS 3', 'DAS 4', 'DAS 5', 'DAS 6', 'DAS 7',
          'DAI 1', 'DAI 2', 'DAI 3', 'DAI 4', 'DAI 5'
        )
      );
  END IF;
END $$;
