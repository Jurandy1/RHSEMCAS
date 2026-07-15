# Cadastro de usuários

O cadastro é executado por uma Edge Function para que a chave administrativa
do Supabase nunca seja exposta no navegador.

## 1. Banco e coordenadora

No Supabase, abra **SQL Editor** e execute `sql/auth_rls.sql`.

O primeiro usuário já cadastrado em **Authentication → Users** será marcado
como `coordenador`. Confira o `SELECT` exibido ao final do script.

## 2. Publicar a função

Com a Supabase CLI autenticada, na raiz do projeto:

```powershell
npx supabase login
npx supabase functions deploy criar-usuario --project-ref isqslnnixdudhpunwnpx
```

As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` são disponibilizadas automaticamente à função
publicada pelo Supabase.

## 3. Usar

A coordenadora entra normalmente e acessa **Usuários do Sistema** no menu.
Contas criadas por essa tela recebem o perfil `usuario` e acesso completo aos
módulos, mas não podem cadastrar outras contas.
