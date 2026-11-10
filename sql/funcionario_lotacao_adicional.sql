-- Lotações adicionais do servidor (2ª, 3ª lotação...).
-- O servidor continua com UMA lotação oficial em funcionario_lotacao;
-- aqui ficam as outras unidades onde ele também aparece.
-- Na contagem da unidade ele entra; no total geral do painel NÃO (é o mesmo servidor).
-- Rodar no SQL Editor do Supabase.

create table if not exists public.funcionario_lotacao_adicional (
  id             bigint generated always as identity primary key,
  funcionario_id bigint not null references public.funcionarios(id) on delete cascade,
  lotacao_id     bigint not null references public.lotacoes(id) on delete cascade,
  funcao         text,
  observacao     text,
  criado_em      timestamptz not null default now(),
  unique (funcionario_id, lotacao_id)
);

create index if not exists idx_func_lot_adic_lotacao on public.funcionario_lotacao_adicional (lotacao_id);
create index if not exists idx_func_lot_adic_func    on public.funcionario_lotacao_adicional (funcionario_id);

alter table public.funcionario_lotacao_adicional enable row level security;

drop policy if exists "func_lot_adic_select" on public.funcionario_lotacao_adicional;
drop policy if exists "func_lot_adic_write"  on public.funcionario_lotacao_adicional;
create policy "func_lot_adic_select" on public.funcionario_lotacao_adicional
  for select to authenticated using (true);
create policy "func_lot_adic_write" on public.funcionario_lotacao_adicional
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.funcionario_lotacao_adicional to authenticated;

notify pgrst, 'reload schema';
