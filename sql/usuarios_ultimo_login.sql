-- Usuários do Sistema: inclui o último login (auth.users.last_sign_in_at).
-- Executar no SQL Editor do Supabase.
-- O tipo de retorno muda, então a função precisa ser recriada.

DROP FUNCTION IF EXISTS public.fn_listar_usuarios_sistema();

CREATE FUNCTION public.fn_listar_usuarios_sistema()
RETURNS TABLE (
  user_id uuid,
  nome text,
  email text,
  perfil text,
  ativo boolean,
  created_at timestamptz,
  ultimo_login timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.user_id,
    s.nome,
    s.email,
    s.perfil,
    s.ativo,
    s.created_at,
    u.last_sign_in_at AS ultimo_login
  FROM public.usuarios_sistema s
  LEFT JOIN auth.users u ON u.id = s.user_id
  WHERE public.usuario_eh_coordenador()
     OR s.user_id = auth.uid()
  ORDER BY s.nome;
$$;

REVOKE ALL ON FUNCTION public.fn_listar_usuarios_sistema() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_listar_usuarios_sistema() TO authenticated;

-- Conferência
SELECT s.nome, s.email, u.last_sign_in_at AS ultimo_login FROM public.usuarios_sistema s
LEFT JOIN auth.users u ON u.id = s.user_id
ORDER BY u.last_sign_in_at DESC NULLS LAST;
