-- Função para excluir o funcionário com segurança (limpando dependências e logando a ação)
CREATE OR REPLACE FUNCTION fn_excluir_funcionario(p_id INT)
RETURNS void AS $$
DECLARE
  v_nome VARCHAR;
BEGIN
  -- 1. Obter o nome do funcionário para o log
  SELECT nome INTO v_nome FROM funcionarios WHERE id = p_id;

  -- 2. Desvincular de possíveis pendências na folha (para não quebrar a tela de pendentes)
  UPDATE funcionarios_folha_pendentes 
  SET funcionario_id = NULL, status = 'pendente' 
  WHERE funcionario_id = p_id;

  -- 3. Excluir dependências (se houver histórico de lotações, etc)
  -- Adicione aqui outras tabelas que referenciam funcionario_id, se necessário
  -- DELETE FROM lotacoes_historico WHERE funcionario_id = p_id;

  -- 4. Excluir o funcionário da tabela principal
  DELETE FROM funcionarios WHERE id = p_id;

  -- 5. Registrar a ação nos logs do sistema
  INSERT INTO sistema_logs (tipo_acao, funcionario_id, funcionario_nome, detalhes, usuario)
  VALUES (
    'EXCLUSAO', 
    p_id, 
    COALESCE(v_nome, 'Desconhecido'), 
    '{"mensagem": "Funcionário excluído via painel"}', 
    COALESCE(current_user, 'Sistema')
  );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garantir que anon/authenticated possam chamar a função (padrão Supabase)
GRANT EXECUTE ON FUNCTION fn_excluir_funcionario(INT) TO anon, authenticated;

-- Caso não use a RPC e prefira usar DELETE direto no front, também adicionamos a policy:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'funcionarios' AND policyname = 'Allow anon delete'
  ) THEN
    CREATE POLICY "Allow anon delete" ON funcionarios FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;
