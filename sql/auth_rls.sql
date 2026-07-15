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
-- Criar usuário de exemplo (opcional — prefira o Dashboard)
-- Dashboard → Authentication → Users → Add user → Email + Password
-- =====================================================================
