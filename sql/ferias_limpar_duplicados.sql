-- ============================================================
-- Férias: limpar cadastros repetidos
-- Execute no SQL Editor do Supabase.
--
-- Repetido = mesmo servidor, mesma data de início e de fim, ativo e não
-- cancelado. Em 08/11/2026 eram 42 casos com 50 registros sobrando.
--
-- O que acontece:
--   1. Guarda cópia de tudo em backup_funcionario_ferias_20261108.
--   2. Em cada caso fica UM registro (o mais completo; empate = o mais antigo).
--   3. O que só existia nas cópias é juntado no registro que fica:
--      campos vazios são preenchidos; pendências e observações diferentes
--      são somadas (separadas por " · "); período aquisitivo diferente
--      vai para a observação.
--   4. Pendências automáticas que apontavam para uma cópia passam a apontar
--      para o registro que ficou.
--   5. Apaga as cópias.
--   6. Corrige a situação gravada (Pendente / Programado / Em Gozo / Concluído)
--      de todos os registros com data, conforme o dia de hoje.
--
-- Datas que se cruzam mas NÃO são iguais não são mexidas: veja a consulta 4.
-- ============================================================

-- 1) CONFERÊNCIA — casos repetidos e o registro que vai ficar
WITH base AS (
  SELECT ff.*,
         (CASE WHEN coalesce(link_solicitacao, '') <> '' THEN 4 ELSE 0 END
          + CASE WHEN trim(coalesce(periodo_aquisitivo, '')) ~ '^[0-9]{4}/[0-9]{4}$' THEN 2 ELSE 0 END
          + CASE WHEN coalesce(periodo_pendente, '') <> '' THEN 1 ELSE 0 END
          + CASE WHEN coalesce(observacao, '') <> '' THEN 1 ELSE 0 END) AS pontos
    FROM public.funcionario_ferias ff
   WHERE ff.ativo = true
     AND coalesce(ff.status_ferias, '') <> 'Cancelado'
     AND ff.data_inicio IS NOT NULL
), grupos AS (
  SELECT b.*,
         count(*)     OVER w AS qtd,
         row_number() OVER (PARTITION BY funcionario_id, data_inicio, data_fim
                            ORDER BY pontos DESC, id) AS ordem
    FROM base b
  WINDOW w AS (PARTITION BY funcionario_id, data_inicio, data_fim)
)
SELECT f.nome, g.data_inicio, g.data_fim, g.qtd,
       g.id AS id_que_fica,
       (SELECT string_agg(x.id::text, ', ' ORDER BY x.id) FROM grupos x
         WHERE x.funcionario_id = g.funcionario_id AND x.data_inicio = g.data_inicio
           AND x.data_fim = g.data_fim AND x.ordem > 1) AS ids_apagados
  FROM grupos g
  JOIN public.funcionarios f ON f.id = g.funcionario_id
 WHERE g.qtd > 1 AND g.ordem = 1
 ORDER BY f.nome;

-- 2) LIMPAR (rode só depois de conferir a lista acima)
BEGIN;

CREATE TABLE IF NOT EXISTS public.backup_funcionario_ferias_20261108 AS
SELECT ff.*, now() AS copiado_em FROM public.funcionario_ferias ff WHERE false;
INSERT INTO public.backup_funcionario_ferias_20261108
SELECT ff.*, now() FROM public.funcionario_ferias ff;
REVOKE ALL ON public.backup_funcionario_ferias_20261108 FROM anon, authenticated;

CREATE TEMP TABLE tmp_fer_grupos ON COMMIT DROP AS
WITH base AS (
  SELECT ff.id, ff.funcionario_id, ff.data_inicio, ff.data_fim,
         (CASE WHEN coalesce(link_solicitacao, '') <> '' THEN 4 ELSE 0 END
          + CASE WHEN trim(coalesce(periodo_aquisitivo, '')) ~ '^[0-9]{4}/[0-9]{4}$' THEN 2 ELSE 0 END
          + CASE WHEN coalesce(periodo_pendente, '') <> '' THEN 1 ELSE 0 END
          + CASE WHEN coalesce(observacao, '') <> '' THEN 1 ELSE 0 END) AS pontos
    FROM public.funcionario_ferias ff
   WHERE ff.ativo = true
     AND coalesce(ff.status_ferias, '') <> 'Cancelado'
     AND ff.data_inicio IS NOT NULL
), ord AS (
  SELECT b.*,
         count(*) OVER (PARTITION BY funcionario_id, data_inicio, data_fim) AS qtd,
         first_value(id) OVER (PARTITION BY funcionario_id, data_inicio, data_fim
                               ORDER BY pontos DESC, id) AS id_fica
    FROM base b
)
SELECT id, id_fica FROM ord WHERE qtd > 1;

-- Junta as informações das cópias no registro que fica
WITH junto AS (
  SELECT g.id_fica,
         string_agg(DISTINCT nullif(trim(ff.periodo_pendente), ''), ' · ') AS pendentes,
         string_agg(DISTINCT nullif(trim(ff.observacao), ''), ' · ')       AS observacoes,
         string_agg(DISTINCT nullif(trim(ff.link_solicitacao), ''), ' ')   AS links,
         array_agg(DISTINCT nullif(trim(ff.periodo_aquisitivo), ''))
           FILTER (WHERE nullif(trim(ff.periodo_aquisitivo), '') IS NOT NULL) AS aquisitivos
    FROM tmp_fer_grupos g
    JOIN public.funcionario_ferias ff ON ff.id = g.id
   GROUP BY g.id_fica
)
UPDATE public.funcionario_ferias d
   SET periodo_pendente  = j.pendentes,
       link_solicitacao  = coalesce(nullif(trim(d.link_solicitacao), ''), split_part(j.links, ' ', 1)),
       periodo_aquisitivo = coalesce(nullif(trim(d.periodo_aquisitivo), ''), j.aquisitivos[1]),
       observacao = nullif(concat_ws(' · ',
                      j.observacoes,
                      CASE WHEN cardinality(j.aquisitivos) > 1
                           THEN 'Outro período aquisitivo informado em cadastro repetido: '
                                || array_to_string(j.aquisitivos, ', ')
                      END), '')
  FROM junto j
 WHERE d.id = j.id_fica;

-- Tudo o que aponta para uma cópia passa a apontar para o registro que fica
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tabela, a.attname AS coluna
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.funcionario_ferias'::regclass
       AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format(
      'UPDATE %s t SET %I = g.id_fica FROM tmp_fer_grupos g WHERE t.%I = g.id AND g.id <> g.id_fica',
      r.tabela, r.coluna, r.coluna);
    RAISE NOTICE 'Ajustado: %.%', r.tabela, r.coluna;
  END LOOP;
END $$;

-- Apaga as cópias
DELETE FROM public.funcionario_ferias d
 USING tmp_fer_grupos g
 WHERE d.id = g.id AND g.id <> g.id_fica;

-- Situação conforme as datas (hora de São Luís)
UPDATE public.funcionario_ferias
   SET status_ferias = CASE
         WHEN data_inicio > (now() AT TIME ZONE 'America/Fortaleza')::date THEN 'Programado'
         WHEN data_fim    < (now() AT TIME ZONE 'America/Fortaleza')::date THEN 'Concluído'
         ELSE 'Em Gozo'
       END
 WHERE ativo = true
   AND data_inicio IS NOT NULL AND data_fim IS NOT NULL
   AND coalesce(status_ferias, '') <> 'Cancelado';

COMMIT;

-- 3) Conferência final (deve retornar 0)
SELECT count(*) AS casos_repetidos_restantes FROM (
  SELECT 1 FROM public.funcionario_ferias
   WHERE ativo = true AND coalesce(status_ferias, '') <> 'Cancelado' AND data_inicio IS NOT NULL
   GROUP BY funcionario_id, data_inicio, data_fim
  HAVING count(*) > 1
) x;

-- 4) PARA VOCÊ DECIDIR — mesmo servidor com férias que se cruzam (datas diferentes)
SELECT f.nome,
       a.id AS id_a, a.data_inicio AS inicio_a, a.data_fim AS fim_a, a.periodo_aquisitivo AS aquisitivo_a,
       b.id AS id_b, b.data_inicio AS inicio_b, b.data_fim AS fim_b, b.periodo_aquisitivo AS aquisitivo_b
  FROM public.funcionario_ferias a
  JOIN public.funcionario_ferias b
    ON b.funcionario_id = a.funcionario_id AND b.id > a.id
   AND b.data_inicio <= a.data_fim AND a.data_inicio <= b.data_fim
  JOIN public.funcionarios f ON f.id = a.funcionario_id
 WHERE a.ativo AND b.ativo
   AND coalesce(a.status_ferias, '') <> 'Cancelado' AND coalesce(b.status_ferias, '') <> 'Cancelado'
 ORDER BY f.nome;
