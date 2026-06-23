-- ==========================================
-- CORREÇÕES DO BANCO DE DADOS (SUPABASE)
-- ==========================================

-- 1. Desativar RLS (Permitir que o painel HTML acesse os dados sem login)
--    Isso resolve o erro "Nenhum vínculo carregado"
alter table vinculos disable row level security;
alter table turnos disable row level security;
alter table lotacoes disable row level security;
alter table funcionarios disable row level security;
alter table funcionario_lotacao disable row level security;

-- 2. Criar as Views exigidas pelo novo Painel (Dashboard e Gráficos)
--    O HTML novo depende dessas Views que não existiam no schema original.

-- View: v_lotacoes_com_count (Lotações com contagem de servidores)
drop view if exists v_lotacoes_com_count cascade;
create or replace view v_lotacoes_com_count as
select l.*,
       (select count(*) from funcionario_lotacao fl 
        where fl.lotacao_id = l.id and fl.ativo = true) as funcionarios_count
from lotacoes l;

-- View: v_dashboard_kpis (Estatísticas do topo do painel)
drop view if exists v_dashboard_kpis cascade;
create or replace view v_dashboard_kpis as
select 
  (select count(*) from lotacoes where ativo = true) as total_lotacoes,
  (select count(*) from lotacoes where tipo = 'superintendencia' and ativo = true) as total_superintendencias,
  (select count(*) from lotacoes where tipo = 'coordenacao' and ativo = true) as total_coordenacoes,
  (select count(*) from lotacoes where tipo = 'diretoria' and ativo = true) as total_diretorias,
  (select count(*) from lotacoes where tipo = 'unidade' and ativo = true) as total_unidades,
  (select count(*) from funcionario_lotacao where ativo = true) as total_servidores;

-- View: v_dashboard_vinculos (Distribuição por Vínculos para o Gráfico)
drop view if exists v_dashboard_vinculos cascade;
create or replace view v_dashboard_vinculos as
select v.categoria as vinculo, count(fl.id) as total
from vinculos v
left join funcionario_lotacao fl on fl.vinculo_id = v.id and fl.ativo = true
group by v.categoria
order by total desc;

-- View: v_locais_resumo (Agrupamento de CRAS, CREAS e Conselhos para o Gráfico)
drop view if exists v_locais_resumo cascade;
create or replace view v_locais_resumo as
select 
  (case 
     when upper(nome) like '%CRAS%' then 'CRAS'
     when upper(nome) like '%CREAS%' then 'CREAS'
     when upper(nome) like '%ABRIGO%' then 'Abrigos'
     when upper(nome) like '%CENTRO POP%' then 'Centros POP'
     when upper(nome) like '%CONSELHO%' then 'Conselhos'
     else 'Outros'
   end) as categoria,
  count(id) as qtd_unidades,
  coalesce(sum((select count(*) from funcionario_lotacao fl where fl.lotacao_id = lotacoes.id and fl.ativo = true)), 0) as qtd_funcionarios,
  max(parent_id) as parent_id_ref
from lotacoes
where tipo = 'unidade' and ativo = true
group by 1
order by 2 desc;

-- View: v_funcionario_historico (Histórico de transferências do funcionário)
drop view if exists v_funcionario_historico cascade;
create or replace view v_funcionario_historico as
select 
  fl.id, 
  fl.funcionario_id, 
  f.nome as funcionario_nome,
  fl.data_inicio, 
  fl.data_fim, 
  fl.ativo as lotacao_ativa,
  l.nome as lotacao_nome,
  v.categoria as vinculo,
  fl.funcao,
  fl.observacao,
  EXTRACT(DAY FROM (coalesce(fl.data_fim, current_date)::timestamp - fl.data_inicio::timestamp)) as dias_na_lotacao
from funcionario_lotacao fl
join funcionarios f on f.id = fl.funcionario_id
join lotacoes l on fl.lotacao_id = l.id
left join vinculos v on fl.vinculo_id = v.id
order by fl.data_inicio desc;
