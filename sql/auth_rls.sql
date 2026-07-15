-- =====================================================================
-- Autenticação: usuários logados têm acesso total ao sistema
--
-- Pré-requisitos no Supabase Dashboard:
--   1. Authentication → Providers → Email (habilitar)
--   2. Authentication → Users → Add user (criar cada usuário do RH)
--   3. SQL Editor → colar e executar este script
--
-- Após rodar: apenas usuários autenticados acessam tabelas/funções.
-- O papel "anon" deixa de ler/escrever dados sensíveis.
-- =====================================================================

GRANT USAGE ON SCHEMA public TO authenticated;

-- Perfis internos: somente a coordenadora pode listar e criar usuários.
CREATE TABLE IF NOT EXISTS public.usuarios_sistema (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text NOT NULL UNIQUE,
  perfil text NOT NULL DEFAULT 'usuario' CHECK (perfil IN ('coordenador', 'usuario')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.usuarios_sistema ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.usuarios_sistema TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.usuarios_sistema FROM authenticated, anon;

-- A função evita recursão nas políticas e verifica o papel pelo JWT atual.
CREATE OR REPLACE FUNCTION public.usuario_eh_coordenador()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema
    WHERE user_id = auth.uid()
      AND perfil = 'coordenador'
      AND ativo = true
  );
$$;

REVOKE ALL ON FUNCTION public.usuario_eh_coordenador() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuario_eh_coordenador() TO authenticated;

-- Coordenadora edita qualquer nome; cada usuário pode editar o próprio.
CREATE OR REPLACE FUNCTION public.fn_atualizar_nome_usuario(p_user_id uuid, p_nome text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text := trim(p_nome);
BEGIN
  IF v_nome IS NULL OR length(v_nome) < 2 THEN
    RAISE EXCEPTION 'Informe um nome válido (mínimo 2 caracteres).';
  END IF;

  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.usuario_eh_coordenador() THEN
    RAISE EXCEPTION 'Sem permissão para alterar este usuário.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.usuarios_sistema WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  UPDATE public.usuarios_sistema
  SET nome = v_nome
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_atualizar_nome_usuario(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_atualizar_nome_usuario(uuid, text) TO authenticated;

DROP POLICY IF EXISTS usuarios_ver_proprio_ou_coordenador ON public.usuarios_sistema;
CREATE POLICY usuarios_ver_proprio_ou_coordenador
ON public.usuarios_sistema
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.usuario_eh_coordenador());

-- Primeiro usuário já existente no Authentication vira coordenador.
-- Se houver mais de um, confira o resultado do SELECT ao final do arquivo.
INSERT INTO public.usuarios_sistema (user_id, nome, email, perfil, ativo, created_by)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'nome', split_part(u.email, '@', 1)),
  u.email,
  'coordenador',
  true,
  u.id
FROM auth.users u
WHERE u.email IS NOT NULL
ORDER BY u.created_at
LIMIT 1
ON CONFLICT (user_id) DO UPDATE
SET perfil = 'coordenador', ativo = true;

-- Tabelas base usadas pelo sistema
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'funcionarios',
    'funcionario_lotacao',
    'funcionario_licencas',
    'funcionario_ferias',
    'funcionario_cedencias',
    'funcionarios_folha_pendentes',
    'lotacoes',
    'vinculos',
    'turnos',
    'feriados',
    'sistema_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS auth_full_access ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY auth_full_access ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );

    -- Remove acesso anônimo direto (proteção real fica no JWT)
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT ALL ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- Views (leitura para usuários logados)
DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'v_funcionarios_atual',
    'v_lotacoes_com_count',
    'v_funcoes',
    'v_dashboard_kpis',
    'v_dashboard_vinculos',
    'v_locais_resumo',
    'v_cedencias_kpis',
    'v_cedencias_atuais',
    'v_funcionario_historico',
    'v_ferias_kpis',
    'v_pendentes_kpis',
    'v_pendentes_com_sugestao',
    'v_licencas_atuais',
    'v_licencas_kpis'
  ]
  LOOP
    BEGIN
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', v);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'View % não encontrada — ignorada', v;
    END;
  END LOOP;
END $$;

-- Funções RPC (todas no schema public)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- =====================================================================
-- Conferência: deve mostrar a coordenadora cadastrada
-- =====================================================================
SELECT user_id, nome, email, perfil, ativo
FROM public.usuarios_sistema
ORDER BY created_at;
