-- =====================================================================
-- Corrige usuários que existem no Auth mas não aparecem na lista
-- Cole no Supabase → SQL Editor → Run
-- =====================================================================

-- 1) Quem está no Authentication e ainda NÃO está em usuarios_sistema
SELECT
  u.id AS user_id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'nome', split_part(u.email, '@', 1)) AS nome,
  u.created_at
FROM auth.users u
LEFT JOIN public.usuarios_sistema s ON s.user_id = u.id
WHERE s.user_id IS NULL
ORDER BY u.created_at DESC;

-- 2) Importa os que faltam (perfil usuario)
INSERT INTO public.usuarios_sistema (user_id, nome, email, perfil, ativo, created_by)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'nome', split_part(u.email, '@', 1)),
  u.email,
  'usuario',
  true,
  u.id
FROM auth.users u
LEFT JOIN public.usuarios_sistema s ON s.user_id = u.id
WHERE s.user_id IS NULL
  AND u.email IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- 3) Função de listagem (coordenadora vê todos; demais só o próprio)
CREATE OR REPLACE FUNCTION public.fn_listar_usuarios_sistema()
RETURNS TABLE (
  user_id uuid,
  nome text,
  email text,
  perfil text,
  ativo boolean,
  created_at timestamptz
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
    s.created_at
  FROM public.usuarios_sistema s
  WHERE public.usuario_eh_coordenador()
     OR s.user_id = auth.uid()
  ORDER BY s.nome;
$$;

REVOKE ALL ON FUNCTION public.fn_listar_usuarios_sistema() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_listar_usuarios_sistema() TO authenticated;

-- 4) Conferência final
SELECT user_id, nome, email, perfil, ativo, created_at
FROM public.usuarios_sistema
ORDER BY nome;
