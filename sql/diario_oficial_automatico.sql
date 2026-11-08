-- Diário Oficial SEMCAS — conferência automática, paginação e coleta agendada.
-- Rode DEPOIS de sql/diario_oficial_eventos.sql. Pode rodar de novo sem problema.
--
-- O que este script faz:
--   1. Confere sozinho no cadastro: acha o servidor pelo nome e já marca como
--      processado o que não exige ação do RH (sem botão "Conferir").
--   2. A view passa a trazer o par nomeação/exoneração da mesma edição, para a
--      página paginar no banco sem perder a "mudança de cargo".
--   3. diario_resumo() devolve os números dos cards e do menu numa consulta só.
--   4. Agenda a coleta no próprio Supabase (pg_cron + pg_net, ambos no plano
--      gratuito): todo dia às 17:00, 17:20 e 17:30 de São Luís (20:00, 20:20 e
--      20:30 UTC) — as duas últimas pegam edição EXTRA.

-- ─── 1. Normalização ────────────────────────────────────────────────────────
-- Texto: maiúsculo, sem acento, só letras/números separados por um espaço.
CREATE OR REPLACE FUNCTION public.diario_normalizar_texto(p_txt TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(regexp_replace(
    translate(upper(coalesce(p_txt, '')),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'AAAAAEEEEIIIIOOOOOUUUUCN'),
    '[^A-Z0-9]+', ' ', 'g'));
$$;

-- Nome: igual ao texto, mas ignora DE/DA/DO/DOS/DAS/E ("Maria da Silva" = "Maria Silva").
CREATE OR REPLACE FUNCTION public.diario_normalizar_nome(p_nome TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(regexp_replace(
    ' ' || public.diario_normalizar_texto(p_nome) || ' ',
    '( (DE|DA|DO|DAS|DOS|E))+ ', ' ', 'g'));
$$;

-- Cargo: sem a simbologia ("ASSESSOR ESPECIAL DAS 3" -> "ASSESSOR ESPECIAL").
CREATE OR REPLACE FUNCTION public.diario_chave_cargo(p_cargo TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(regexp_replace(
    public.diario_normalizar_texto(p_cargo),
    '( SIMBOLOGIA)? DA[SIE] ?[0-9]+.*$', ''));
$$;

-- ─── 2. View com o par da mesma edição ───────────────────────────────────────
DROP VIEW IF EXISTS public.v_diario_oficial_eventos;
CREATE VIEW public.v_diario_oficial_eventos
WITH (security_invoker = true)
AS
SELECT
  d.*,
  f.nome AS funcionario_nome,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.simbologia AS funcionario_simbologia,
  f.ativo AS funcionario_ativo,
  par.id AS par_id,
  par.acao AS par_acao,
  par.status AS par_status,
  par.funcionario_id AS par_funcionario_id,
  pf.ativo AS par_funcionario_ativo,
  -- Nomeação + exoneração da mesma pessoa na mesma edição = mudança de cargo
  CASE WHEN par.id IS NOT NULL THEN 'promocao' ELSE d.acao END AS tipo_exibicao,
  public.diario_normalizar_texto(concat_ws(' ', d.nome, d.cargo, d.simbologia, d.edicao, f.nome)) AS busca
FROM public.diario_oficial_eventos d
LEFT JOIN public.funcionarios f ON f.id = d.funcionario_id
LEFT JOIN LATERAL (
  SELECT p.id, p.acao, p.status, p.funcionario_id
    FROM public.diario_oficial_eventos p
   WHERE d.acao IN ('nomeacao', 'exoneracao')
     AND coalesce(d.nome, '') <> ''
     AND p.id <> d.id
     AND p.acao = CASE d.acao WHEN 'nomeacao' THEN 'exoneracao' ELSE 'nomeacao' END
     AND p.data_publicacao = d.data_publicacao
     AND coalesce(p.edicao, '') = coalesce(d.edicao, '')
     AND public.diario_normalizar_nome(p.nome) = public.diario_normalizar_nome(d.nome)
   ORDER BY p.id
   LIMIT 1
) par ON true
LEFT JOIN public.funcionarios pf ON pf.id = par.funcionario_id;

GRANT SELECT ON public.v_diario_oficial_eventos TO authenticated;

-- ─── 3. Conferência automática ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.diario_auto_conferir()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER := 0;
  v_n INTEGER;
BEGIN
  -- Os UPDATEs abaixo disparam o gatilho da tabela; esta marca evita rodar de novo por dentro
  PERFORM set_config('diario.auto_conferindo', '1', true);

  -- a) Acha o servidor pelo nome nos atos que ainda estão sem vínculo
  WITH func AS (
    SELECT DISTINCT ON (public.diario_normalizar_nome(nome))
           id, public.diario_normalizar_nome(nome) AS chave
      FROM public.funcionarios
     WHERE coalesce(nome, '') <> ''
     ORDER BY public.diario_normalizar_nome(nome), coalesce(ativo, false) DESC, id DESC
  )
  UPDATE public.diario_oficial_eventos d
     SET funcionario_id = func.id
    FROM func
   WHERE d.status = 'pendente'
     AND d.funcionario_id IS NULL
     AND coalesce(d.nome, '') <> ''
     AND func.chave = public.diario_normalizar_nome(d.nome);

  -- b) Atos avulsos que já batem com o cadastro
  WITH alvo AS (
    SELECT v.id,
           CASE
             WHEN v.acao = 'nomeacao' AND v.funcionario_ativo IS TRUE
              AND (public.diario_chave_cargo(v.cargo) = ''
                   OR public.diario_chave_cargo(v.cargo) = public.diario_chave_cargo(v.funcionario_cargo))
               THEN 'Servidor já cadastrado — conferido automaticamente'
             WHEN v.acao = 'exoneracao' AND v.funcionario_ativo IS FALSE
               THEN 'Servidor já estava inativo — conferido automaticamente'
             WHEN v.acao = 'promocao' AND v.funcionario_ativo IS TRUE
              AND public.diario_chave_cargo(v.cargo) <> ''
              AND public.diario_chave_cargo(v.cargo) = public.diario_chave_cargo(v.funcionario_cargo)
               THEN 'Cargo já atualizado no cadastro — conferido automaticamente'
           END AS resultado
      FROM public.v_diario_oficial_eventos v
     WHERE v.status = 'pendente'
       AND v.funcionario_id IS NOT NULL
       AND v.par_id IS NULL
  )
  UPDATE public.diario_oficial_eventos d
     SET status = 'processado', resultado = alvo.resultado, processado_em = NOW()
    FROM alvo
   WHERE d.id = alvo.id AND alvo.resultado IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  -- c) Mudança de cargo (par) cujo cargo novo já está no cadastro: fecha as duas linhas
  WITH alvo AS (
    SELECT v.id, v.par_id, f.id AS fid
      FROM public.v_diario_oficial_eventos v
      JOIN public.funcionarios f ON f.id = coalesce(v.funcionario_id, v.par_funcionario_id)
     WHERE v.status = 'pendente'
       AND v.acao = 'nomeacao'
       AND v.par_id IS NOT NULL
       AND coalesce(f.ativo, false)
       AND public.diario_chave_cargo(v.cargo) <> ''
       AND public.diario_chave_cargo(v.cargo) = public.diario_chave_cargo(f.cargo)
  ), linhas AS (
    SELECT id, fid FROM alvo
    UNION
    SELECT par_id, fid FROM alvo
  )
  UPDATE public.diario_oficial_eventos d
     SET status = 'processado',
         resultado = 'Mudança de cargo já registrada no cadastro — conferida automaticamente',
         funcionario_id = coalesce(d.funcionario_id, linhas.fid),
         processado_em = NOW()
    FROM linhas
   WHERE d.id = linhas.id AND d.status = 'pendente';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  PERFORM set_config('diario.auto_conferindo', '', true);
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.diario_auto_conferir() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.diario_auto_conferir() TO authenticated;

-- Toda gravação nova (coleta das 17h ou vínculo manual) já passa pela conferência
CREATE OR REPLACE FUNCTION public.diario_trg_auto_conferir()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('diario.auto_conferindo', true), '') = '1' THEN RETURN NULL; END IF;
  PERFORM public.diario_auto_conferir();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_diario_auto_conferir_ins ON public.diario_oficial_eventos;
CREATE TRIGGER trg_diario_auto_conferir_ins
AFTER INSERT ON public.diario_oficial_eventos
FOR EACH STATEMENT EXECUTE FUNCTION public.diario_trg_auto_conferir();

DROP TRIGGER IF EXISTS trg_diario_auto_conferir_upd ON public.diario_oficial_eventos;
CREATE TRIGGER trg_diario_auto_conferir_upd
AFTER UPDATE OF funcionario_id ON public.diario_oficial_eventos
FOR EACH STATEMENT EXECUTE FUNCTION public.diario_trg_auto_conferir();

-- ─── 4. Números dos cards e do menu ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.diario_resumo()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total', count(*) FILTER (
      WHERE NOT (acao = 'exoneracao' AND par_id IS NOT NULL)),
    -- Par pendente (troca de cargo) conta uma vez só
    'pendentes', count(*) FILTER (
      WHERE status = 'pendente'
        AND NOT (acao = 'exoneracao' AND par_id IS NOT NULL AND par_status = 'pendente')),
    'processados', count(*) FILTER (
      WHERE status = 'processado'
        AND NOT (acao = 'exoneracao' AND par_id IS NOT NULL)),
    'nomeacoes', count(*) FILTER (WHERE acao = 'nomeacao' AND par_id IS NULL),
    'promocoes', count(*) FILTER (WHERE acao = 'promocao' OR (acao = 'nomeacao' AND par_id IS NOT NULL)),
    'exoneracoes', count(*) FILTER (WHERE acao = 'exoneracao' AND par_id IS NULL),
    'ultima_coleta', max(criado_em)
  )
  FROM public.v_diario_oficial_eventos;
$$;

GRANT EXECUTE ON FUNCTION public.diario_resumo() TO authenticated;

-- Fecha agora o que já existe e bate com o cadastro
SELECT public.diario_auto_conferir() AS atos_conferidos_automaticamente;

-- ─── 5. Coleta agendada: 17:00, 17:20 e 17:30 (São Luís) ────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Chave que só o banco e a Edge Function conhecem (ninguém do navegador lê)
CREATE TABLE IF NOT EXISTS public.diario_cron_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
INSERT INTO public.diario_cron_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.diario_cron_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.diario_cron_config FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.diario_disparar_coleta()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token TEXT;
  v_req BIGINT;
BEGIN
  SELECT token INTO v_token FROM public.diario_cron_config WHERE id = 1;
  SELECT net.http_post(
    url := 'https://isqslnnixdudhpunwnpx.supabase.co/functions/v1/diario-semcas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_SwgnEdoGqmDetD2DX5aRfA_mhANTIPe',
      'x-diario-cron', v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO v_req;
  RETURN v_req;
END;
$$;

REVOKE ALL ON FUNCTION public.diario_disparar_coleta() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'diario-semcas-coleta';
SELECT cron.schedule(
  'diario-semcas-coleta',
  '0,20,30 20 * * 1-5',             -- dias úteis; 20:00/20:20/20:30 UTC = 17:00/17:20/17:30 em São Luís
  $$SELECT public.diario_disparar_coleta()$$
);

-- Conferência: deve listar o job com schedule "0,20,30 20 * * 1-5"
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'diario-semcas-coleta';

-- Para testar na hora (não precisa esperar as 17h):
--   SELECT public.diario_disparar_coleta();
--   -- depois de ~20s:
--   SELECT status_code, left(content::text, 300) FROM net._http_response ORDER BY id DESC LIMIT 1;
