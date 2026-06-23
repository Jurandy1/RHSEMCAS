-- ==========================================
-- Adicionar Conselhos Tutelares nos Locais Operacionais
-- ==========================================

drop view if exists v_locais_resumo cascade;
create or replace view v_locais_resumo as
select 
  (case 
     when upper(nome) like '%CRAS%' then 'CRAS'
     when upper(nome) like '%CREAS%' then 'CREAS'
     when upper(nome) like '%ABRIGO%' then 'Abrigos'
     when upper(nome) like '%CENTRO POP%' then 'Centros POP'
     when upper(nome) like 'CT %' or upper(nome) like '%CONSELHO TUTELAR%' then 'Conselhos Tutelares'
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

-- Recriar fn_organograma_completo com as contagens corretas
drop function if exists fn_organograma_completo();
create or replace function fn_organograma_completo()
returns table (
    id bigint,
    nome text,
    tipo text,
    marcador text,
    parent_id bigint,
    funcionarios_direto bigint,
    funcionarios_total bigint
) as $$
begin
    return query
    select 
        l.id,
        l.nome,
        l.tipo,
        l.marcador,
        l.parent_id,
        (select count(*) from funcionario_lotacao fl where fl.lotacao_id = l.id and fl.ativo = true) as funcionarios_direto,
        (select count(*) from funcionario_lotacao fl 
         join v_lotacao_arvore arv on fl.lotacao_id = arv.id
         where l.id = any(arv.path_ids) and fl.ativo = true) as funcionarios_total
    from lotacoes l
    where l.ativo = true
    order by l.id;
end;
$$ language plpgsql security definer;
