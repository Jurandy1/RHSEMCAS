-- ============================================================
-- Exonerados com motivo "DUPLICADO" ou "ERRO": apagar de vez
-- Execute no SQL Editor do Supabase.
--
-- Pega só servidores INATIVOS cujo motivo da saída é exatamente
-- duplicado / diplicado / erro (sem diferenciar maiúsculas).
-- Em 08/11/2026 eram 15 cadastros.
--
-- Antes de apagar, guarda uma cópia dos cadastros na tabela
-- backup_exonerados_duplicado_erro (para consulta, se precisar).
-- ============================================================

-- 1) CONFERÊNCIA — quem será apagado
SELECT f.id, f.nome, f.matricula, f.motivo_saida, f.tipo_saida, f.data_exoneracao
FROM public.funcionarios f
WHERE coalesce(f.ativo, false) = false
  AND upper(trim(coalesce(f.motivo_saida, ''))) IN ('DUPLICADO', 'DIPLICADO', 'ERRO')
ORDER BY f.nome;

-- 2) APAGAR (rode só depois de conferir a lista acima)
BEGIN;

CREATE TEMP TABLE tmp_excluir ON COMMIT DROP AS
SELECT f.id AS funcionario_id
FROM public.funcionarios f
WHERE coalesce(f.ativo, false) = false
  AND upper(trim(coalesce(f.motivo_saida, ''))) IN ('DUPLICADO', 'DIPLICADO', 'ERRO');

-- Cópia de segurança dos cadastros
CREATE TABLE IF NOT EXISTS public.backup_exonerados_duplicado_erro AS
SELECT f.*, now() AS apagado_em FROM public.funcionarios f WHERE false;
INSERT INTO public.backup_exonerados_duplicado_erro
SELECT f.*, now() FROM public.funcionarios f
WHERE f.id IN (SELECT funcionario_id FROM tmp_excluir);
REVOKE ALL ON public.backup_exonerados_duplicado_erro FROM anon, authenticated;

-- Remove tudo o que aponta para esses cadastros em qualquer tabela.
-- Diário Oficial e outros cadastros de servidores apenas perdem o vínculo (nada além disso é apagado).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tabela, a.attname AS coluna
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.funcionarios'::regclass
      AND array_length(c.conkey, 1) = 1
  LOOP
    IF r.tabela::text IN ('diario_oficial_eventos', 'public.diario_oficial_eventos', 'funcionarios', 'public.funcionarios') THEN
      EXECUTE format('UPDATE %s SET %I = NULL WHERE %I IN (SELECT funcionario_id FROM tmp_excluir)',
                     r.tabela, r.coluna, r.coluna);
    ELSE
      EXECUTE format('DELETE FROM %s WHERE %I IN (SELECT funcionario_id FROM tmp_excluir)',
                     r.tabela, r.coluna);
    END IF;
    RAISE NOTICE 'Limpo: %.%', r.tabela, r.coluna;
  END LOOP;
END $$;

-- Cadastro do servidor
DELETE FROM public.funcionarios
WHERE id IN (SELECT funcionario_id FROM tmp_excluir);

COMMIT;

-- 3) Conferência final (deve retornar 0)
SELECT count(*) AS restantes
FROM public.funcionarios
WHERE coalesce(ativo, false) = false
  AND upper(trim(coalesce(motivo_saida, ''))) IN ('DUPLICADO', 'DIPLICADO', 'ERRO');
