-- ==========================================
-- CORREÇÃO DA CONTAGEM DE SERVIDORES (VIEWS)
-- ==========================================

-- A view anterior não estava retornando as colunas 'funcionarios_direto' e 'funcionarios_total'
-- que o novo painel (index.html) espera para exibir as somas na árvore.

drop view if exists v_lotacoes_com_count cascade;
create or replace view v_lotacoes_com_count as
select 
  l.*,
  
  -- 1. Servidores que estão lotados DIRETAMENTE neste setor
  (select count(*) 
   from funcionario_lotacao fl 
   where fl.lotacao_id = l.id and fl.ativo = true) as funcionarios_direto,
   
  -- 2. Servidores que estão lotados neste setor + todos os subsetores abaixo dele
  (select count(*) 
   from funcionario_lotacao fl 
   join v_lotacao_arvore arv on fl.lotacao_id = arv.id
   where l.id = any(arv.path_ids) and fl.ativo = true) as funcionarios_total

from lotacoes l;
