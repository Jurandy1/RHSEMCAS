# Cadastro de usuários

O cadastro é executado por uma Edge Function para que a chave administrativa
do Supabase nunca seja exposta no navegador.

**Sem publicar a função `criar-usuario`, a coordenadora verá erro ao cadastrar.**

## 1. Banco e coordenadora

No Supabase, abra **SQL Editor** e execute `sql/auth_rls.sql`.

O primeiro usuário já cadastrado em **Authentication → Users** será marcado
como `coordenador`. Confira o `SELECT` exibido ao final do script.

## 2. Publicar a função (escolha uma opção)

### Opção A — pelo Dashboard (mais simples)

1. Abra o projeto: https://supabase.com/dashboard/project/isqslnnixdudhpunwnpx/functions
2. Clique em **Deploy a new function** → **Via Editor** (ou **Create function**)
3. Nome da função: `criar-usuario` (exatamente assim)
4. Cole o conteúdo de `supabase/functions/criar-usuario/index.ts`
5. Clique em **Deploy**

### Opção B — pela CLI

Com a Supabase CLI autenticada, na raiz do projeto:

```powershell
npx supabase login
npx supabase functions deploy criar-usuario --project-ref isqslnnixdudhpunwnpx
```

As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` são disponibilizadas automaticamente à função
publicada pelo Supabase.

### Conferir se publicou

Abra no navegador (ou no PowerShell):

```
https://isqslnnixdudhpunwnpx.supabase.co/functions/v1/criar-usuario
```

- Se a função existir, a resposta **não** será 404 (pode ser 401 sem token — isso é normal).
- Se for 404, ainda não está publicada.

## 3. Usar

A coordenadora entra normalmente e acessa **Usuários do Sistema** no menu.
Contas criadas por essa tela recebem o perfil `usuario` e acesso completo aos
módulos, mas não podem cadastrar outras contas.

# Diário Oficial (nomeações/promoções/exonerações SEMCAS)

A coleta roda sozinha no Supabase (pg_cron + pg_net, plano gratuito) todo dia
às **17:00, 17:20 e 17:30** de São Luís — as duas últimas pegam edição EXTRA.
O navegador não consulta o Diário: só lê o que já está gravado.

1. SQL Editor: rode `sql/diario_oficial_eventos.sql` (se ainda não rodou) e
   depois `sql/diario_oficial_automatico.sql`. O último `SELECT` deve mostrar o
   job `diario-semcas-coleta` com schedule `0,20,30 20 * * *` (horário UTC).
2. Publique a função com **Verify JWT desligado** (a coleta agendada chama sem
   login; a função confere a chave interna ou a sessão do usuário):

```powershell
npx supabase functions deploy diario-semcas --project-ref isqslnnixdudhpunwnpx
```

   Pelo Dashboard: cole `supabase/functions/diario-semcas/index.ts` e desmarque
   **Enforce JWT verification** nas configurações da função.

Testar sem esperar as 17h (SQL Editor):

```sql
SELECT public.diario_disparar_coleta();
-- ~20s depois:
SELECT status_code, left(content::text, 300) FROM net._http_response ORDER BY id DESC LIMIT 1;
```

No console do navegador (F12), logado: `diarioColetarAgora('2026-10-07')`
consulta o Diário daquela data e grava; `verificarDiarioSemcas('2026-10-07')`
reabre o popup com o que está no banco.
