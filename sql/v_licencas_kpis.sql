-- =====================================================================
-- View: v_licencas_kpis
-- Recalcula os cards da tela "Licenças e Afastamentos" com base nas
-- cinco categorias oficiais em uso pelo formulário. Usa ILIKE p/ ser
-- tolerante a variações históricas do texto gravado em tipo_afastamento
-- (registros antigos com "Licença Médica / Tratamento de Saúde",
-- "Interesses Particulares" etc. continuam sendo contados).
--
-- Como aplicar:
--   1. Abrir o Supabase → SQL Editor
--   2. Colar o bloco abaixo (o script inteiro) e clicar em "Run"
--
-- Obs.: usamos DROP + CREATE porque CREATE OR REPLACE VIEW no PostgreSQL
-- não permite remover colunas nem alterar seus tipos — e a view antiga
-- tinha colunas diferentes (medica, maternidade) que estão saindo.
-- =====================================================================

-- Extensão para comparar strings sem acento (idempotente).
CREATE EXTENSION IF NOT EXISTS unaccent;

DROP VIEW IF EXISTS public.v_licencas_kpis;

CREATE VIEW public.v_licencas_kpis AS
SELECT
  COUNT(*) FILTER (WHERE ativo) AS total_afastados,

  COUNT(*) FILTER (
    WHERE ativo
      AND unaccent(lower(tipo_afastamento)) ILIKE '%premio%'
  ) AS premio,

  COUNT(*) FILTER (
    WHERE ativo
      AND (
        unaccent(lower(tipo_afastamento)) ILIKE '%tratamento de saude%'
        OR unaccent(lower(tipo_afastamento)) ILIKE '%medica%'
      )
  ) AS tratamento_saude,

  COUNT(*) FILTER (
    WHERE ativo
      AND unaccent(lower(tipo_afastamento)) ILIKE '%capacitacao%'
  ) AS capacitacao,

  COUNT(*) FILTER (
    WHERE ativo
      AND (
        unaccent(lower(tipo_afastamento)) ILIKE '%interesse particular%'
        OR unaccent(lower(tipo_afastamento)) ILIKE '%interesses particulares%'
      )
  ) AS interesse_particular,

  COUNT(*) FILTER (
    WHERE ativo
      AND unaccent(lower(tipo_afastamento)) ILIKE '%amamenta%'
  ) AS amamentacao

FROM public.funcionario_licencas;

-- Se algum dia o DROP falhar dizendo que outra view depende desta,
-- rode com CASCADE (isso remove os dependentes — verifique antes):
--   DROP VIEW IF EXISTS public.v_licencas_kpis CASCADE;
