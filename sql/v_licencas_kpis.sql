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
--   2. Colar o bloco abaixo e clicar em "Run"
-- =====================================================================

CREATE OR REPLACE VIEW public.v_licencas_kpis AS
SELECT
  COUNT(*) FILTER (WHERE ativo)::int AS total_afastados,

  COUNT(*) FILTER (
    WHERE ativo
      AND unaccent(lower(tipo_afastamento)) ILIKE '%premio%'
  )::int AS premio,

  COUNT(*) FILTER (
    WHERE ativo
      AND (
        unaccent(lower(tipo_afastamento)) ILIKE '%tratamento de saude%'
        OR unaccent(lower(tipo_afastamento)) ILIKE '%medica%'
      )
  )::int AS tratamento_saude,

  COUNT(*) FILTER (
    WHERE ativo
      AND unaccent(lower(tipo_afastamento)) ILIKE '%capacitacao%'
  )::int AS capacitacao,

  COUNT(*) FILTER (
    WHERE ativo
      AND (
        unaccent(lower(tipo_afastamento)) ILIKE '%interesse particular%'
        OR unaccent(lower(tipo_afastamento)) ILIKE '%interesses particulares%'
      )
  )::int AS interesse_particular,

  COUNT(*) FILTER (
    WHERE ativo
      AND unaccent(lower(tipo_afastamento)) ILIKE '%amamenta%'
  )::int AS amamentacao

FROM public.funcionario_licencas;

-- Se a extensão unaccent não estiver instalada, rodar antes:
--   CREATE EXTENSION IF NOT EXISTS unaccent;
