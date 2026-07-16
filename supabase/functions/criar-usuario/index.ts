import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Sessão não informada.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Sessão inválida ou expirada.' }, 401)

    const { data: perfil, error: perfilError } = await adminClient
      .from('usuarios_sistema')
      .select('nome, email, perfil, ativo')
      .eq('user_id', user.id)
      .single()

    if (perfilError || perfil?.perfil !== 'coordenador' || perfil?.ativo === false) {
      return json({ error: 'Apenas a coordenadora pode cadastrar usuários.' }, 403)
    }

    const { nome, email, senha } = await req.json()
    const nomeLimpo = String(nome || '').trim()
    const emailLimpo = String(email || '').trim().toLowerCase()
    const senhaLimpa = String(senha || '')

    if (!nomeLimpo || !emailLimpo || senhaLimpa.length < 8) {
      return json({ error: 'Informe nome, e-mail e senha com pelo menos 8 caracteres.' }, 400)
    }

    const { data: criado, error: criarError } = await adminClient.auth.admin.createUser({
      email: emailLimpo,
      password: senhaLimpa,
      email_confirm: true,
      user_metadata: { nome: nomeLimpo },
    })

    let novoUserId = criado?.user?.id || null

    if (criarError || !novoUserId) {
      const jaExiste = (criarError?.message || '').toLowerCase().includes('already')
      if (!jaExiste) {
        return json({ error: criarError?.message || 'Não foi possível criar o usuário.' }, 400)
      }

      // Conta já existe no Auth: localiza e garante o perfil em usuarios_sistema
      const { data: lista, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (listError) return json({ error: 'Já existe um usuário com este e-mail, mas não foi possível recuperar o cadastro.' }, 400)
      const existente = (lista?.users || []).find(u => (u.email || '').toLowerCase() === emailLimpo)
      if (!existente) return json({ error: 'Já existe um usuário com este e-mail.' }, 400)
      novoUserId = existente.id
    }

    const { data: perfilExistente } = await adminClient
      .from('usuarios_sistema')
      .select('user_id, perfil')
      .eq('user_id', novoUserId)
      .maybeSingle()

    if (perfilExistente) {
      return json({ error: 'Já existe um usuário com este e-mail.' }, 400)
    }

    const { error: perfilNovoError } = await adminClient.from('usuarios_sistema').insert({
      user_id: novoUserId,
      nome: nomeLimpo,
      email: emailLimpo,
      perfil: 'usuario',
      ativo: true,
      created_by: user.id,
    })

    if (perfilNovoError) {
      // Só remove do Auth se acabamos de criar nesta requisição
      if (criado?.user?.id && !criarError) {
        await adminClient.auth.admin.deleteUser(criado.user.id)
      }
      return json({
        error: 'Não foi possível registrar o perfil do usuário: ' + (perfilNovoError.message || 'erro desconhecido'),
      }, 500)
    }

    await adminClient.from('sistema_logs').insert({
      tipo_acao: 'CADASTRO DE USUÁRIO',
      funcionario_id: null,
      funcionario_nome: nomeLimpo,
      detalhes: { email: emailLimpo, perfil: 'usuario', user_id: novoUserId },
      usuario: perfil.email || user.email || 'Coordenadora',
    })

    return json({
      ok: true,
      usuario: { id: novoUserId, nome: nomeLimpo, email: emailLimpo },
    }, 201)
  } catch (error) {
    console.error(error)
    return json({ error: 'Erro interno ao cadastrar usuário.' }, 500)
  }
})
