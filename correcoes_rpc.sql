-- ==========================================
-- CORREÇÃO: Remover função duplicada e recriar
-- ==========================================

-- Dropar TODAS as versões existentes da função
drop function if exists fn_buscar_funcionarios(text, int, int, int, int);
drop function if exists fn_buscar_funcionarios(text, smallint, bigint, int, int);
drop function if exists fn_buscar_funcionarios(text, integer, integer, integer, integer);
drop function if exists fn_buscar_funcionarios(text, smallint, bigint, integer, integer);

-- Recriar com tipos compatíveis (bigint para IDs)
create or replace function fn_buscar_funcionarios(
    p_termo text default null,
    p_vinculo_id bigint default null,
    p_lotacao_id bigint default null,
    p_limite int default 50,
    p_offset int default 0
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
    order by r.nome
    limit p_limite offset p_offset;
end;
$$ language plpgsql security definer;
