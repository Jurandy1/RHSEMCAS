import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
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
    const anonKey = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || ''
    const giapUrl = (Deno.env.get('GIAP_API_URL') || '').replace(/\/$/, '')
    const giapKey = Deno.env.get('GIAP_API_KEY') || ''

    if (!giapUrl || !giapKey) {
      return json({ error: 'GIAP_API_URL / GIAP_API_KEY não configurados na Edge Function.' }, 500)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Sessão inválida ou expirada.' }, 401)

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const acao = body.acao || 'start_job'

    if (acao === 'start_job') {
      const payload = {
        tipo: body.tipo || 'ciclo_completo',
        competencia: body.competencia || undefined,
        dryRun: !!body.dryRun,
        modo: 'manual',
        createdBy: user.id,
        filtros: body.filtros || undefined,
      }
      const r = await fetch(`${giapUrl}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': giapKey,
        },
        body: JSON.stringify(payload),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        const raw = data.error || data.message || `GIAP HTTP ${r.status}`
        // Erro clássico do @supabase/supabase-js quando a service role não está no Render
        if (String(raw).toLowerCase().includes('supabasekey')) {
          return json({
            error:
              'O serviço no Render está sem SUPABASE_SERVICE_ROLE_KEY. ' +
              'Em Render → Environment, cadastre SUPABASE_SERVICE_ROLE_KEY (nome exato) com a service_role do Supabase e reinicie o serviço.',
          }, 500)
        }
        return json({ error: raw }, r.status)
      }
      return json(data, 202)
    }

    if (acao === 'job_status') {
      const id = body.jobId
      if (!id) return json({ error: 'jobId obrigatório' }, 400)
      const r = await fetch(`${giapUrl}/jobs/${id}`, {
        headers: { 'X-API-Key': giapKey },
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) return json({ error: data.error || `GIAP HTTP ${r.status}` }, r.status)
      return json(data)
    }

    // Busca imediata de um nome no portal (grava em folha_pmsl)
    if (acao === 'sync_nome') {
      const nomeServidor = String(body.nomeServidor || '').trim()
      if (!nomeServidor) return json({ error: 'Informe o nome do servidor.' }, 400)
      const competencia = body.competencia || undefined
      const r = await fetch(`${giapUrl}/sync/nome`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': giapKey,
        },
        body: JSON.stringify({
          nomeServidor,
          codigoInstituicao: 1,
          competencia,
          filtrarNomeAlvo: nomeServidor,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) return json({ error: data.error || `GIAP HTTP ${r.status}` }, r.status)
      return json(data)
    }

    return json({ error: `Ação desconhecida: ${acao}` }, 400)
  } catch (e) {
    return json({ error: e.message || String(e) }, 500)
  }
})
