-- ============================================================
-- SEMCAS — Sistema de Gestão de Pessoas por Lotação
-- Schema Supabase (Postgres)
-- ============================================================

-- Habilitar a extensão para busca textual (necessário para os índices gin_trgm_ops)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ====== TABELAS DE APOIO (lookups) ======

create table if not exists vinculos (
    id smallserial primary key,
    categoria text not null unique,
    descricao text,
    created_at timestamptz not null default now()
);

create table if not exists turnos (
    id smallserial primary key,
    nome text not null unique,
    created_at timestamptz not null default now()
);

-- ====== ORGANOGRAMA HIERÁRQUICO ======
-- self-referencing tree: superintendência → coordenação → diretoria → unidade

create table if not exists lotacoes (
    id bigserial primary key,
    codigo text unique,                              -- slug interno (opcional)
    nome text not null,
    tipo text not null check (tipo in (
        'superintendencia','coordenacao','diretoria','unidade','conselho','setor','nivel'
    )),
    marcador text,                                   -- "I", "1.", "a)", etc. (como aparece na planilha)
    parent_id bigint references lotacoes(id) on delete restrict,
    ativo boolean not null default true,
    observacao text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index idx_lotacoes_parent on lotacoes(parent_id);
create index idx_lotacoes_tipo on lotacoes(tipo);
create index idx_lotacoes_nome_trgm on lotacoes using gin (nome gin_trgm_ops);

-- ====== FUNCIONÁRIOS ======

create table if not exists funcionarios (
    id bigserial primary key,
    nome text not null,
    cpf text unique,                                 -- opcional (preencher depois)
    matricula text unique,                           -- matrícula SIAPE/PMSL (opcional)
    email text,
    telefone text,
    ativo boolean not null default true,
    observacao text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index idx_funcionarios_nome_trgm on funcionarios using gin (nome gin_trgm_ops);

-- ====== VÍNCULO PROFISSIONAL (N:N entre funcionário e lotação) ======
-- Permite histórico: cada vez que a pessoa muda de lotação, fecha o registro antigo (data_fim) e cria um novo.

create table if not exists funcionario_lotacao (
    id bigserial primary key,
    funcionario_id bigint not null references funcionarios(id) on delete cascade,
    lotacao_id bigint not null references lotacoes(id) on delete restrict,
    vinculo_id smallint references vinculos(id),
    funcao text,
    turno_id smallint references turnos(id),
    ano_concurso int,                                -- para efetivos
    ordem int,                                       -- número de ordem na lotação (do organograma)
    data_inicio date not null default current_date,
    data_fim date,                                   -- null = vínculo atual
    ativo boolean not null default true,
    observacao text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index idx_fl_funcionario on funcionario_lotacao(funcionario_id);
create index idx_fl_lotacao on funcionario_lotacao(lotacao_id);
create index idx_fl_ativo on funcionario_lotacao(ativo) where ativo = true;

-- ====== AUDITORIA (opcional - habilitar se precisar) ======
create table if not exists auditoria (
    id bigserial primary key,
    tabela text not null,
    registro_id bigint not null,
    acao text not null check (acao in ('INSERT','UPDATE','DELETE')),
    alterado_por uuid references auth.users(id),
    dados_antigos jsonb,
    dados_novos jsonb,
    quando timestamptz not null default now()
);
create index idx_audit_tabela_registro on auditoria(tabela, registro_id);

-- ====== VIEW: árvore completa de lotações com caminho ======

create or replace view v_lotacao_arvore as
with recursive arv as (
    select
        id, codigo, nome, tipo, marcador, parent_id,
        ativo,
        1 as nivel,
        array[id] as path_ids,
        nome::text as caminho
    from lotacoes
    where parent_id is null

    union all

    select
        l.id, l.codigo, l.nome, l.tipo, l.marcador, l.parent_id,
        l.ativo,
        arv.nivel + 1,
        arv.path_ids || l.id,
        arv.caminho || ' › ' || l.nome
    from lotacoes l
    join arv on l.parent_id = arv.id
)
select * from arv order by path_ids;

-- ====== VIEW: funcionários com lotação atual ======

create or replace view v_funcionarios_atual as
select
    f.id as funcionario_id,
    f.nome,
    f.cpf,
    f.matricula,
    fl.id as vinculo_id,
    l.id as lotacao_id,
    l.nome as lotacao_nome,
    l.tipo as lotacao_tipo,
    arv.caminho as lotacao_caminho,
    v.categoria as vinculo_categoria,
    fl.funcao,
    t.nome as turno,
    fl.ano_concurso,
    fl.ordem,
    fl.data_inicio,
    fl.observacao
from funcionarios f
join funcionario_lotacao fl on fl.funcionario_id = f.id and fl.ativo = true
join lotacoes l on l.id = fl.lotacao_id
left join v_lotacao_arvore arv on arv.id = l.id
left join vinculos v on v.id = fl.vinculo_id
left join turnos t on t.id = fl.turno_id
where f.ativo = true;

-- ====== SEED: vínculos e turnos ======

insert into vinculos (categoria, descricao) values
    ('Comissionado', 'Cargo de livre nomeação'),
    ('Efetivo', 'Servidor público concursado'),
    ('Contrato Temporário', 'Contratação temporária via processo seletivo'),
    ('Serviço Prestado', 'Prestação de serviço'),
    ('Terceirizado', 'Contrato com empresa terceirizada'),
    ('PROCAD', 'Programa PROCAD'),
    ('Contrato/SEMUS', 'Cedido pela Sec. de Saúde'),
    ('Contrato', 'Contrato direto'),
    ('Outro', 'Categoria não classificada')
on conflict (categoria) do nothing;

insert into turnos (nome) values
    ('Integral'), ('Matutino'), ('Vespertino'),
    ('Noturno'), ('Diurno'), ('Plantão')
on conflict (nome) do nothing;

-- ====== RLS (Row Level Security) — desativado por padrão, ative quando necessário ======
-- alter table funcionarios enable row level security;
-- alter table funcionario_lotacao enable row level security;
-- create policy "Servidor vê apenas sua lotação" on funcionarios for select using ( ... );
