-- ==========================================
-- CORREÇÃO: Função de busca com ORDENAÇÃO
-- ==========================================

-- Remove todas as versões anteriores
drop function if exists fn_buscar_funcionarios(text, bigint, bigint, int, int);
drop function if exists fn_buscar_funcionarios(text, bigint, bigint, int, int, text, text);
drop function if exists fn_buscar_funcionarios(text, int, int, int, int);
drop function if exists fn_buscar_funcionarios(text, smallint, bigint, int, int);
drop function if exists fn_buscar_funcionarios(text, integer, integer, integer, integer);
drop function if exists fn_buscar_funcionarios(text, smallint, bigint, integer, integer);

-- Recria com suporte a ordenação por coluna
create or replace function fn_buscar_funcionarios(
    p_termo text default null,
    p_vinculo_id bigint default null,
    p_lotacao_id bigint default null,
    p_limite int default 50,
    p_offset int default 0,
    p_order_by text default 'nome',
    p_order_dir text default 'asc'
) returns table (
    funcionario_id bigint,
    nome text,
    vinculo text,
    funcao text,
    lotacao_nome text,
    caminho_lotacao text,
    turno text,
    total bigint
) as $$
begin
    return query
    with filtro_lotacao as (
        select arv.id from v_lotacao_arvore arv
        where p_lotacao_id = any(arv.path_ids)
    ),
    resultados as (
        select 
            f.id as funcionario_id,
            f.nome,
            v.categoria as vinculo,
            fl.funcao,
            l.nome as lotacao_nome,
            arv.caminho as caminho_lotacao,
            t.nome as turno
        from funcionarios f
        join funcionario_lotacao fl on fl.funcionario_id = f.id
        join lotacoes l on l.id = fl.lotacao_id
        left join vinculos v on v.id = fl.vinculo_id
        left join turnos t on t.id = fl.turno_id
        left join v_lotacao_arvore arv on arv.id = l.id
        where fl.ativo = true
          and f.ativo = true
          and (p_termo is null or f.nome ilike '%' || p_termo || '%')
          and (p_vinculo_id is null or fl.vinculo_id = p_vinculo_id)
          and (p_lotacao_id is null or fl.lotacao_id in (select id from filtro_lotacao))
    )
    select r.*, (select count(*) from resultados) as total
    from resultados r
    order by
      case when p_order_by = 'nome'         and p_order_dir = 'asc'  then r.nome end asc nulls last,
      case when p_order_by = 'nome'         and p_order_dir = 'desc' then r.nome end desc nulls last,
      case when p_order_by = 'vinculo'      and p_order_dir = 'asc'  then r.vinculo end asc nulls last,
      case when p_order_by = 'vinculo'      and p_order_dir = 'desc' then r.vinculo end desc nulls last,
      case when p_order_by = 'funcao'       and p_order_dir = 'asc'  then r.funcao end asc nulls last,
      case when p_order_by = 'funcao'       and p_order_dir = 'desc' then r.funcao end desc nulls last,
      case when p_order_by = 'lotacao_nome' and p_order_dir = 'asc'  then r.lotacao_nome end asc nulls last,
      case when p_order_by = 'lotacao_nome' and p_order_dir = 'desc' then r.lotacao_nome end desc nulls last,
      case when p_order_by = 'turno'        and p_order_dir = 'asc'  then r.turno end asc nulls last,
      case when p_order_by = 'turno'        and p_order_dir = 'desc' then r.turno end desc nulls last,
      r.nome asc
    limit p_limite offset p_offset;
end;
$$ language plpgsql security definer;
