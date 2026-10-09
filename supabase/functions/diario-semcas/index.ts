// Busca no Diário Oficial de São Luís as NOMEAÇÕES e EXONERAÇÕES que citam a
// SEMCAS numa data. O site do DO não libera CORS, então o navegador não pode
// consultar direto — por isso esta função faz a ponte.
//
// GET/POST  { data?: 'YYYY-MM-DD' }   (default: hoje em São Luís)
// Resposta: { data, edicoes: [...], atos: [{ id, acao, nome, cargo, simbologia,
//             data_ato, data_publicacao, edicao, titulo, link }] }
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
}

const DO_BASE = 'https://diariooficial.saoluis.ma.gov.br'
// Sem User-Agent o Cloudflare do DO devolve 403.
const UA = 'Mozilla/5.0 (compatible; SEMCAS-DiarioBot/1.0; sistema RH da SEMCAS)'

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7,
  agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

// "SEMCAS" sem \b na frente: o HTML às vezes cola ("Assistência SocialSEMCAS").
const RE_SEMCAS = /SEMCAS\b|CRIANCA\s+E\s+(?:DA\s+)?ASSIS?T?ENCIA\s+SOCIAL|SECRETARIA\s+MUNICIPAL\s+DA\s+ASSIS?T?ENCIA\s+SOCIAL/i
const citaSemcas = (t: string) => RE_SEMCAS.test(semAcento(t))

const NOME = String.raw`([A-ZÀ-Ý][A-ZÀ-Ý\s\-'’]+?)`
// Uma matéria pode trazer vários atos ("Nomear FULANO ... Exonerar BELTRANO ..."),
// então varre todas as ocorrências. Preâmbulo em qualquer caixa, nome em MAIÚSCULAS.
const RE_ATO = new RegExp(
  String.raw`\b(Nomear|NOMEAR|Exonerar|EXONERAR)\b,?\s+` +
  String.raw`(?:[Aa]\s+pedido,?\s+)?` +
  String.raw`(?:[oa]s?\s+[Ss]ervidor(?:a|es|\(a\))?\s+(?:[Pp][úu]blic[oa]\s+[Mm]unicipal,?\s+)?)?` +
  NOME + String.raw`,`,
  'g',
)

function htmlParaTexto(html: string): string {
  return (html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/﻿/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

/** "06 DE OUTUBRO DE 2026" (título ou fecho "EM SÃO LUÍS, ...") -> 2026-10-06 */
function dataPorExtenso(texto: string): string | null {
  const m = semAcento(texto).match(/(\d{1,2})\s+DE\s+([A-Za-z]+)\s+DE\s+(\d{4})/i)
  if (!m) return null
  const mes = MESES[m[2].toLowerCase()]
  if (!mes) return null
  return `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function extrairAtos(materia: any, edicao: any) {
  const titulo = String(materia.title || '').trim()
  const texto = htmlParaTexto(materia.content).replace(/\n/g, ' ')
  if (!citaSemcas(`${titulo} ${texto} ${materia.secretaria_name || ''}`)) return []

  const dataPublicacao = String(edicao.edition_date).slice(0, 10)
  // Data do ato: a do título ("PORTARIA ..., DE 05 DE outubro DE 2026") ou a do fecho
  const fecho = texto.match(/S[ÃA]O\s+LU[ÍI]S,?\s+(?:EM\s+)?\d{1,2}\s+DE\s+\S+\s+DE\s+\d{4}/i)?.[0] || ''
  const dataAto = dataPorExtenso(titulo) || dataPorExtenso(fecho) || dataPublicacao
  const base = {
    data_ato: dataAto,
    data_publicacao: dataPublicacao,
    edicao: edicao.edition_number,
    titulo,
    link: `${DO_BASE}/api/matters/${materia.id}/view`,
  }

  const atos: any[] = []
  for (const m of texto.matchAll(RE_ATO)) {
    // Recorta só este ato (até o próximo verbo ou ~700 caracteres)
    const resto = texto.slice(m.index! + m[0].length, m.index! + m[0].length + 700)
    const prox = resto.search(/\b(Nomear|NOMEAR|Exonerar|EXONERAR)\b/)
    const trecho = prox > 0 ? resto.slice(0, prox) : resto
    // Ato em lote: a SEMCAS tem que aparecer no trecho do próprio ato
    if (!citaSemcas(trecho) && !citaSemcas(titulo)) continue

    const cargo =
      trecho.match(/(?:para\s+(?:exercer\s+)?o\s+cargo|d[oa]\s+cargo|cargo)\s+(?:efetivo\s+|em\s+comiss[ãa]o\s+)?de\s+([^,.;]+)/i)?.[1] ||
      trecho.match(/do\s+mandato\s+de\s+([^,.;]+)/i)?.[1] ||
      null
    const simb = trecho.match(/simbologia\s+(DA[IES]-\d+)/i)?.[1]?.toUpperCase() || null
    atos.push({
      id: `${materia.id}-${atos.length}`,
      acao: /^nomear/i.test(m[1]) ? 'nomeacao' : 'exoneracao',
      nome: m[2].replace(/\s+/g, ' ').trim(),
      cargo: cargo ? cargo.replace(/\s+/g, ' ').trim() : null,
      simbologia: simb,
      ...base,
    })
  }

  // Ato da SEMCAS com nome fora do padrão (ex.: lista em tabela): avisa mesmo assim
  if (!atos.length && /\b(nomear|exonerar)\b/i.test(texto) && /nomea|exonera/i.test(semAcento(titulo + ' ' + (materia.matter_type_name || '')))) {
    atos.push({
      id: `${materia.id}-0`,
      acao: /nomea/i.test(semAcento(titulo + ' ' + materia.matter_type_name)) ? 'nomeacao' : 'exoneracao',
      nome: null,
      cargo: null,
      simbologia: null,
      ...base,
    })
  }
  return atos
}

async function getDO(path: string) {
  const r = await fetch(`${DO_BASE}${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!r.ok) throw new Error(`Diário Oficial respondeu HTTP ${r.status} em ${path}`)
  return r.json()
}

function hojeSaoLuis(): string {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Sessão não informada.' }, 401)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '',
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    )
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Sessão inválida ou expirada.' }, 401)

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const url = new URL(req.url)
    const data = String(body.data || url.searchParams.get('data') || hojeSaoLuis())
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return json({ error: 'data deve ser YYYY-MM-DD' }, 400)

    const { editions = [] } = await getDO('/api/portal/editions?limit=20')
    // Edição normal + EXTRA do dia
    const doDia = editions
      .filter((e: any) => e.source === 'digital' && String(e.edition_date).slice(0, 10) === data)
      .sort((a: any, b: any) => String(a.edition_date).localeCompare(String(b.edition_date)) || a.id - b.id)

    const atos: any[] = []
    for (const e of doDia) {
      const { matters = [] } = await getDO(`/api/portal/editions/${e.id}/matters`)
      for (const m of matters) atos.push(...extrairAtos(m, e))
    }

    return json({
      data,
      edicoes: doDia.map((e: any) => ({
        id: e.id, numero: e.edition_number, data: String(e.edition_date).slice(0, 10),
        publicada_em: e.published_at, materias: e.matter_count,
      })),
      atos,
    })
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 502)
  }
})
