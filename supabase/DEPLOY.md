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
