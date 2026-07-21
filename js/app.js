
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ╔══════════════════════════════════════════════════════════════╗
// ║                    CONFIGURAÇÃO SUPABASE                      ║
// ║         👉 Edite as duas linhas abaixo                       ║
// ╚══════════════════════════════════════════════════════════════╝
const SUPABASE_URL  = 'https://isqslnnixdudhpunwnpx.supabase.co';
const SUPABASE_ANON = 'sb_publishable_SwgnEdoGqmDetD2DX5aRfA_mhANTIPe';

// Verifica configuração
const configurado = !SUPABASE_URL.includes('SEU-PROJETO') && !SUPABASE_ANON.includes('SUA-ANON-KEY');
if (!configurado) {
  document.getElementById('conn-banner').classList.remove('hidden');
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
window.sb = sb;

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => root.querySelectorAll(sel);

const SIMBOLOGIAS = [
  'DAS',
  'DAS 1', 'DAS 2', 'DAS 3', 'DAS 4', 'DAS 5', 'DAS 6', 'DAS 7',
  'DAI 1', 'DAI 2', 'DAI 3', 'DAI 4', 'DAI 5'
];

function popularSelectSimbologia(selectId, valor = '') {
  const el = $(selectId);
  if (!el) return;
  el.innerHTML = '<option value="">— Sem simbologia —</option>' +
    SIMBOLOGIAS.map(s => `<option value="${s}">${s}</option>`).join('');
  el.value = valor && SIMBOLOGIAS.includes(valor) ? valor : '';
}

const state = {
  vinculos: [], turnos: [], lotacoes: [], funcoes: [],
  filtros: { busca: '', vinculo_id: null, lotacao_id: null, funcoes: [], turno_id: null },
  sort: { col: 'nome', dir: 'asc' },
  page: 1, pageSize: 15, total: 0,
  funcionarioAtual: null,
  locais: { categoria: null, lotacao: null },
  usuario: null,
  authenticated: false,
  perfilUsuario: null,
};

// ╔══════════════════════════════════════════════════════════════╗
// ║                         AUTENTICAÇÃO                          ║
// ╚══════════════════════════════════════════════════════════════╝
let _appBooted = false;

function obterUsuarioLogado() {
  return state.usuario?.email || 'desconhecido';
}

function atualizarUsuarioUI() {
  const u = state.usuario;
  if (!u) return;
  const email = u.email || '';
  const nome = u.user_metadata?.nome || u.user_metadata?.full_name || email.split('@')[0] || 'Usuário';
  const iniciais = nome.trim().slice(0, 2).toUpperCase() || 'RH';
  if ($('user-av')) $('user-av').textContent = iniciais;
  if ($('user-name')) $('user-name').textContent = nome;
  if ($('user-email')) $('user-email').textContent = email;
}

function showLogin() {
  state.usuario = null;
  state.authenticated = false;
  $('auth-gate')?.classList.remove('hidden');
  $('app-shell')?.classList.add('hidden');
  $('login-error')?.setAttribute('hidden', '');
  if ($('login-password')) $('login-password').value = '';
}

function showApp(session) {
  state.usuario = session?.user ?? null;
  state.authenticated = !!session?.user;
  $('auth-gate')?.classList.add('hidden');
  $('app-shell')?.classList.remove('hidden');
  atualizarUsuarioUI();
  initModoConforto();
  bootApp();
}

/** Modo leitura confortável — texto/botões maiores (servidores mais velhos) */
function initModoConforto() {
  const KEY = 'rhsemcas_modo_conforto';
  const btn = $('btn-modo-conforto');
  const aplicar = (on) => {
    document.body.classList.toggle('modo-conforto', !!on);
    if (btn) {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.title = on
        ? 'Desligar leitura confortável (texto maior)'
        : 'Aumentar texto e botões (leitura confortável)';
    }
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) { /* ok */ }
  };
  let on = false;
  try { on = localStorage.getItem(KEY) === '1'; } catch (_) { /* ok */ }
  aplicar(on);
  if (btn && !btn._confortoBound) {
    btn._confortoBound = true;
    btn.addEventListener('click', () => aplicar(!document.body.classList.contains('modo-conforto')));
  }
}

async function bootApp() {
  if (_appBooted) return;
  _appBooted = true;
  try {
    window.removeEventListener('hashchange', navigate);
    await carregarPerfilUsuario();
    await carregarDominios();
    window.addEventListener('hashchange', navigate);
    if (!location.hash || location.hash === '#') location.hash = '#painel';
    navigate();
    const { data } = await sb.from('v_pendentes_kpis').select('pendentes').single();
    if (data && $('badge-pendentes')) {
      $('badge-pendentes').textContent = data.pendentes;
      $('badge-pendentes').style.display = data.pendentes > 0 ? '' : 'none';
    }
    atualizarBadgesSemLotacaoExonerados();
    atualizarAlertasLicenca();
  } catch (e) {
    _appBooted = false;
    console.error('Boot failed:', e);
    showToast('Erro ao inicializar: ' + e.message, 'error');
  }
}

async function carregarPerfilUsuario() {
  const { data, error } = await sb.from('usuarios_sistema')
    .select('user_id, nome, email, perfil, ativo')
    .eq('user_id', state.usuario?.id)
    .maybeSingle();

  if (error) {
    console.warn('Perfil de usuário indisponível:', error.message);
    state.perfilUsuario = null;
  } else {
    state.perfilUsuario = data || null;
  }

  const coordenadora = state.perfilUsuario?.perfil === 'coordenador' && state.perfilUsuario?.ativo !== false;
  $('nav-usuarios')?.classList.toggle('hidden', !coordenadora);
  $('nav-relatorio-api')?.classList.toggle('hidden', !coordenadora);
  $('btn-editar-meu-nome')?.classList.toggle('hidden', !coordenadora);

  if (state.perfilUsuario?.nome) {
    atualizarDisplayUsuario(state.perfilUsuario.nome);
  }
}

function atualizarDisplayUsuario(nome) {
  const nomeLimpo = String(nome || '').trim();
  if (!nomeLimpo) return;
  if ($('user-name')) $('user-name').textContent = nomeLimpo;
  if ($('user-av')) $('user-av').textContent = nomeLimpo.slice(0, 2).toUpperCase();
}

$('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btn-login');
  const errEl = $('login-error');
  const email = $('login-email')?.value?.trim();
  const password = $('login-password')?.value;
  if (!email || !password) return;

  btn.disabled = true;
  errEl?.setAttribute('hidden', '');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false;

  if (error) {
    if (errEl) {
      errEl.textContent = error.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos.'
        : ('Não foi possível entrar: ' + error.message);
      errEl.removeAttribute('hidden');
    }
    return;
  }
  await registrarLog('LOGIN', null, 'Sistema', { email });
  // onAuthStateChange chama showApp
});

$('btn-logout')?.addEventListener('click', async () => {
  if (!confirm('Deseja sair do sistema?')) return;
  await registrarLog('LOGOUT', null, 'Sistema');
  _appBooted = false;
  await sb.auth.signOut();
  location.hash = '';
  showLogin();
});

sb.auth.onAuthStateChange((_event, session) => {
  if (session) showApp(session);
  else if (_appBooted) {
    _appBooted = false;
    showLogin();
  }
});

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) showApp(session);
  else showLogin();
})();

// ╔══════════════════════════════════════════════════════════════╗
// ║                    REGISTRAR LOG SISTEMA                      ║
// ╚══════════════════════════════════════════════════════════════╝
window.registrarLog = async (tipo_acao, funcionario_id, funcionario_nome, detalhes_obj = {}) => {
  const { error } = await sb.from('sistema_logs').insert([{
    tipo_acao, 
    funcionario_id, 
    funcionario_nome, 
    detalhes: detalhes_obj,
    usuario: obterUsuarioLogado()
  }]);
  // Falha de auditoria não deve interromper a ação principal, mas precisa ser visível no console.
  if (error) console.error('Falha ao registrar log de auditoria:', error, { tipo_acao, funcionario_id });
};

// ╔══════════════════════════════════════════════════════════════╗
// ║                       ESTADO GLOBAL                           ║
// ╚══════════════════════════════════════════════════════════════╝

function filtrosBase(extra = {}) {
  return { busca: '', vinculo_id: null, lotacao_id: null, funcoes: [], turno_id: null, ...extra };
}

// Filtra a lista de funcionários por uma lotação e navega até lá.
// Exposto em window pois é chamado por onclick inline (que roda no escopo global).
window.verServidoresPorLotacao = (lotacaoId) => {
  state.filtros = filtrosBase({ lotacao_id: Number(lotacaoId) });
  location.hash = '#funcionarios';
};

// ╔══════════════════════════════════════════════════════════════╗
// ║                          HELPERS                              ║
// ╚══════════════════════════════════════════════════════════════╝

// ── Card de Conselhos Tutelares: não vem em v_locais_resumo, calcula a partir das lotações ──
function cardConselhoTutelar() {
  const raiz = state.lotacoes.find(l => (l.nome || '').toLowerCase().includes('conselhos tutelares'));
  const cts = state.lotacoes.filter(l => raiz ? l.parent_id === raiz.id : /^ct /i.test(l.nome || ''));
  if (!raiz && cts.length === 0) return null;
  const servidores = raiz?.funcionarios_total ?? cts.reduce((s, l) => s + (l.funcionarios_direto || 0), 0);
  return { categoria: 'Conselho Tutelar', qtd_unidades: cts.length, qtd_funcionarios: servidores };
}

// ── Ajusta categorias de locais: funde "Outros" em "Abrigos" (mesma coordenação
//    de Alta Complexidade — o drill-down já mostra as 5 unidades juntas) e injeta os CTs ──
function ajustarLocaisResumo(locais) {
  const outros  = locais.find(l => (l.categoria || '').trim().toUpperCase() === 'OUTROS');
  const abrigos = locais.find(l => (l.categoria || '').toUpperCase().includes('ABRIGO'));
  if (outros && abrigos) {
    abrigos.qtd_unidades    += outros.qtd_unidades    || 0;
    abrigos.qtd_funcionarios += outros.qtd_funcionarios || 0;
    locais.splice(locais.indexOf(outros), 1);
  }
  if (!locais.some(l => (l.categoria || '').toUpperCase().includes('TUTELAR'))) {
    const ct = cardConselhoTutelar();
    if (ct) locais.push(ct);
  }
  return locais;
}

// ── Classificação oficial: Estrutura Organizacional da SEMCAS (níveis I a V) ──
function classificarNiveisSemcas(raizes) {
  const secoes = [
    { titulo: 'I – Nível de Administração Superior', itens: [], raizId: null },
    { titulo: 'II – Nível de Assessoramento',        itens: [], raizId: null },
    { titulo: 'III – Nível de Gerência Superior',    itens: [], raizId: null },
    { titulo: 'IV – Nível de Atuação Programática',  itens: [], raizId: null },
    { titulo: 'V – Órgãos Vinculados',               itens: [], raizId: null },
    { titulo: 'Lotações de Controle Interno',        itens: [], raizId: null },
  ];
  const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const ordemFixa = (nome, chaves) => {
    const i = chaves.findIndex(c => semAcento(nome).includes(c));
    return i === -1 ? 99 : i;
  };
  for (const r of raizes) {
    const nm = semAcento(r.nome);
    // raízes agrupadoras sem servidor direto viram o próprio título do nível
    const lift = (idx) => {
      if (r.funcionarios_direto === 0 && r.filhos.length) { secoes[idx].itens.push(...r.filhos); secoes[idx].raizId = r.id; }
      else secoes[idx].itens.push(r);
    };
    if (r.tipo === 'superintendencia')             secoes[3].itens.push(r);
    else if (nm.includes('SECRETARIA MUNICIPAL'))  secoes[0].itens.push(r);
    else if (nm.includes('ASSESSORAMENTO'))        lift(1);
    else if (nm.includes('GERENCIA SUPERIOR'))     lift(2);
    else if (nm.includes('ORGAOS VINCULADOS'))     lift(4);
    else                                           secoes[5].itens.push(r);
  }
  const romanos = { I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8 };
  secoes[1].itens.sort((a,b) => ordemFixa(a.nome,['GABINETE','JURID','TECNIC','COMUNICA']) - ordemFixa(b.nome,['GABINETE','JURID','TECNIC','COMUNICA']));
  secoes[2].itens.sort((a,b) => ordemFixa(a.nome,['GESTAO','PROTECAO']) - ordemFixa(b.nome,['GESTAO','PROTECAO']));
  secoes[3].itens.sort((a,b) => (romanos[(a.nome.match(/^([IVX]+)\./)||[])[1]]||99) - (romanos[(b.nome.match(/^([IVX]+)\./)||[])[1]]||99));
  secoes[4].itens.sort((a,b) => ordemFixa(a.nome,['CMAS','CMDCA','CMDI','TUTELAR']) - ordemFixa(b.nome,['CMAS','CMDCA','CMDI','TUTELAR']));
  return secoes;
}
const ORG_NIVEL_HEADER_STYLE = 'margin:16px 0 6px;font-weight:700;color:var(--gov-blue-dark);font-size:13px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--gov-blue-primary);padding-bottom:4px;display:flex;align-items:center;justify-content:space-between';

// ── Busca todas as linhas de uma tabela/view (o Supabase limita cada resposta a 1000) ──
async function fetchTudo(tabela, colunas, ordem) {
  const todos = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from(tabela).select(colunas).order(ordem).range(de, de + 999);
    if (error) return { data: todos.length ? todos : null, error };
    todos.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { data: todos, error: null };
}

// ── Ordenação por coluna ──
window.sortTable = function(col) {
  if (state.sort.col === col) {
    state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sort.col = col;
    state.sort.dir = 'asc';
  }
  state.page = 1;
  atualizarIconesSort();
  carregarFuncionarios();
};

function atualizarIconesSort() {
  $$('.sortable').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    if (th.dataset.sort === state.sort.col) {
      icon.className = `ti ${state.sort.dir === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending'} sort-icon active`;
    } else {
      icon.className = 'ti ti-arrows-sort sort-icon';
    }
  });
}

// ── Descendentes de lotação (para filtro inteligente) ──
function getDescendentes(parentId) {
  const result = [];
  const filhos = state.lotacoes.filter(l => l.parent_id === parentId);
  for (const f of filhos) {
    result.push(f);
    result.push(...getDescendentes(f.id));
  }
  return result;
}

async function atualizarDropdownLotacao() {
  await atualizarOpcoesFiltros();
}

/** Cache das linhas usadas para montar os selects conforme o vínculo atual. */
let _cacheFiltroCtx = { key: null, rows: null };

function invalidarCacheFiltros() {
  _cacheFiltroCtx = { key: null, rows: null };
}

async function fetchLinhasFiltroContexto() {
  const vinc = state.filtros.vinculo_id
    ? state.vinculos.find(x => x.id == state.filtros.vinculo_id)
    : null;
  const key = String(state.filtros.vinculo_id || '');
  if (_cacheFiltroCtx.key === key && _cacheFiltroCtx.rows) return _cacheFiltroCtx.rows;

  const todos = [];
  for (let de = 0; ; de += 1000) {
    let q = sb.from('v_funcionarios_atual')
      .select('vinculo, funcao, lotacao_id, lotacao_nome, turno')
      .order('nome')
      .range(de, de + 999);
    if (vinc?.categoria) q = q.eq('vinculo', vinc.categoria);
    const { data, error } = await q;
    if (error) {
      console.warn('Filtros contextuais:', error.message);
      break;
    }
    todos.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  _cacheFiltroCtx = { key, rows: todos };
  return todos;
}

/** Atualiza Função / Lotação / Turno só com valores existentes no conjunto filtrado. */
async function atualizarOpcoesFiltros() {
  const elVinc = $('f-vinculo');
  const elLot  = $('f-lotacao');
  const elTurn = $('f-turno');
  if (!elVinc || !elLot || !elTurn || !$('f-funcao-lista')) return;

  // Vínculos: lista completa do domínio (permite trocar o filtro depois do dashboard)
  const vincSel = state.filtros.vinculo_id != null ? String(state.filtros.vinculo_id) : '';
  elVinc.innerHTML = '<option value="">Todos os vínculos</option>' +
    state.vinculos.map(x =>
      `<option value="${x.id}" ${String(x.id) === vincSel ? 'selected' : ''}>${htmlEscape(x.categoria)}</option>`
    ).join('');

  const rows = await fetchLinhasFiltroContexto();

  const lotId = state.filtros.lotacao_id ? Number(state.filtros.lotacao_id) : null;
  const funcoesSel = Array.isArray(state.filtros.funcoes) ? state.filtros.funcoes : [];
  const funcoesSet = new Set(funcoesSel);
  const turnoSel = state.filtros.turno_id
    ? (state.turnos.find(t => t.id == state.filtros.turno_id)?.nome || '')
    : '';

  const matchLot = (r) => !lotId || Number(r.lotacao_id) === lotId;
  const matchFunc = (r) => !funcoesSel.length || funcoesSet.has((r.funcao || '').trim());
  const matchTurn = (r) => !turnoSel || (r.turno || '') === turnoSel;

  // Funções: com vínculo (+ lotação/turno se houver)
  const funcoes = [...new Set(
    rows.filter(r => matchLot(r) && matchTurn(r)).map(r => (r.funcao || '').trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  state.filtros.funcoes = funcoesSel.filter(f => funcoes.includes(f));
  renderMultiSelectFuncoes(funcoes);

  // Lotações: com vínculo (+ função/turno se houver)
  const contagemLot = {};
  rows.filter(r => matchFunc(r) && matchTurn(r)).forEach(r => {
    if (r.lotacao_id == null) return;
    const id = Number(r.lotacao_id);
    if (!contagemLot[id]) contagemLot[id] = { id, nome: r.lotacao_nome || '—', n: 0 };
    contagemLot[id].n++;
  });
  let lotacoes = Object.values(contagemLot).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  // Se a lotação selecionada é um nó pai (drill-down), mantém ela e os filhos na lista
  if (lotId) {
    const parent = state.lotacoes.find(l => l.id === lotId);
    const desc = getDescendentes(lotId);
    const idsCtx = new Set(lotacoes.map(l => l.id));
    const extras = [parent, ...desc].filter(Boolean).filter(l => !idsCtx.has(l.id));
    if (extras.length) {
      lotacoes = [
        ...extras.map(l => ({ id: l.id, nome: l.nome, n: l.funcionarios_direto || 0 })),
        ...lotacoes
      ];
    }
  }

  if (lotId && !lotacoes.some(l => l.id === lotId)) {
    state.filtros.lotacao_id = null;
  }
  const lotAtual = state.filtros.lotacao_id != null ? String(state.filtros.lotacao_id) : '';
  elLot.innerHTML = '<option value="">Todas as lotações</option>' +
    lotacoes.map(l =>
      `<option value="${l.id}" ${String(l.id) === lotAtual ? 'selected' : ''}>${htmlEscape(l.nome)} (${l.n})</option>`
    ).join('');

  // Turnos: com vínculo (+ função/lotação se houver)
  const nomesTurno = [...new Set(
    rows.filter(r => matchLot(r) && matchFunc(r)).map(r => (r.turno || '').trim()).filter(Boolean)
  )];
  const turnos = state.turnos.filter(t => nomesTurno.includes(t.nome));
  if (state.filtros.turno_id && !turnos.some(t => t.id == state.filtros.turno_id)) {
    state.filtros.turno_id = null;
  }
  const turnAtual = state.filtros.turno_id != null ? String(state.filtros.turno_id) : '';
  elTurn.innerHTML = '<option value="">Todos os turnos</option>' +
    turnos.map(t =>
      `<option value="${t.id}" ${String(t.id) === turnAtual ? 'selected' : ''}>${htmlEscape(t.nome)}</option>`
    ).join('');
}

function rotuloBtnFuncoes() {
  const n = (state.filtros.funcoes || []).length;
  if (n === 0) return 'Funções';
  if (n === 1) return state.filtros.funcoes[0];
  return `${n} funções`;
}

function atualizarRotuloFuncoes() {
  const btn = $('f-funcao-btn');
  if (btn) btn.textContent = rotuloBtnFuncoes();
}

function renderMultiSelectFuncoes(lista) {
  const panelList = $('f-funcao-lista');
  if (!panelList) return;
  const sel = new Set(state.filtros.funcoes || []);
  const q = (($('f-funcao-busca')?.value) || '').trim().toLowerCase();
  const filtradas = q
    ? lista.filter(f => f.toLowerCase().includes(q))
    : lista;

  if (!filtradas.length) {
    panelList.innerHTML = `<div class="ms-vazio">${lista.length ? 'Nenhuma função encontrada' : 'Nenhuma função neste filtro'}</div>`;
  } else {
    panelList.innerHTML = filtradas.map(f => `
      <label class="ms-item">
        <input type="checkbox" value="${htmlEscape(f)}" ${sel.has(f) ? 'checked' : ''}>
        <span>${htmlEscape(f)}</span>
      </label>`).join('');
  }
  panelList._listaCompleta = lista;
  atualizarRotuloFuncoes();
}

function funcoesMarcadasNoPainel() {
  return [...$$('#f-funcao-lista input[type=checkbox]:checked')].map(c => c.value);
}

function abrirPainelFuncoes(abrir) {
  const panel = $('f-funcao-panel');
  const btn = $('f-funcao-btn');
  if (!panel || !btn) return;
  panel.hidden = !abrir;
  btn.classList.toggle('open', !!abrir);
  btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  if (abrir) {
    // sincroniza checks com estado atual
    const lista = $('f-funcao-lista')?._listaCompleta || [];
    if ($('f-funcao-busca')) $('f-funcao-busca').value = '';
    renderMultiSelectFuncoes(lista);
    setTimeout(() => $('f-funcao-busca')?.focus(), 30);
  }
}

function initMultiSelectFuncoes() {
  const btn = $('f-funcao-btn');
  const panel = $('f-funcao-panel');
  const wrap = $('f-funcao-wrap');
  if (!btn || !panel || !wrap || btn._msInit) return;
  btn._msInit = true;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirPainelFuncoes(panel.hidden);
  });
  panel.addEventListener('click', (e) => e.stopPropagation());

  $('f-funcao-busca')?.addEventListener('input', debounce(() => {
    const lista = $('f-funcao-lista')?._listaCompleta || [];
    renderMultiSelectFuncoes(lista);
  }, 120));

  $('f-funcao-limpar')?.addEventListener('click', async () => {
    state.filtros.funcoes = [];
    const lista = $('f-funcao-lista')?._listaCompleta || [];
    renderMultiSelectFuncoes(lista);
    state.page = 1;
    await atualizarOpcoesFiltros();
    await carregarFuncionarios();
    renderFilterTags();
  });

  $('f-funcao-aplicar')?.addEventListener('click', async () => {
    state.filtros.funcoes = funcoesMarcadasNoPainel();
    atualizarRotuloFuncoes();
    abrirPainelFuncoes(false);
    state.page = 1;
    await atualizarOpcoesFiltros();
    await carregarFuncionarios();
    renderFilterTags();
  });

  // aplica ao marcar/desmarcar (sem fechar o painel)
  const aplicarFuncoesMarcadas = debounce(async () => {
    state.page = 1;
    await carregarFuncionarios();
    renderFilterTags();
  }, 280);
  $('f-funcao-lista')?.addEventListener('change', (e) => {
    if (e.target?.type !== 'checkbox') return;
    state.filtros.funcoes = funcoesMarcadasNoPainel();
    atualizarRotuloFuncoes();
    aplicarFuncoesMarcadas();
  });

  document.addEventListener('click', () => {
    if (!panel.hidden) abrirPainelFuncoes(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) abrirPainelFuncoes(false);
  });
}

function showToast(msg, tipo = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show ${tipo}`;
  clearTimeout(t._t);
  t._t = setTimeout(() => t.className = 'toast', 4000);
}
window.showToast = showToast;

let _modalPrevFocus = null;
function openModal(id) {
  const el = $(id);
  _modalPrevFocus = document.activeElement;
  el.style.display = 'flex';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  document.body.style.overflow = 'hidden';
  // Foca o primeiro campo/botão relevante do modal
  setTimeout(() => {
    const alvo = el.querySelector('input:not([type=hidden]):not([disabled]), select, textarea, button.btn-primary');
    if (alvo) alvo.focus();
  }, 60);
}
window.closeModal = (id) => {
  const el = $(id);
  el.style.display = 'none';
  el.removeAttribute('aria-modal');
  if (id === 'modal-transfer') {
    state._trfFromLicencas = false;
    state._trfFromSemLotacao = false;
  }
  // Restaura scroll só se nenhum outro modal continuar aberto
  if (!document.querySelector('.modal-overlay[style*="flex"]')) {
    document.body.style.overflow = '';
  }
  if (_modalPrevFocus && typeof _modalPrevFocus.focus === 'function') {
    _modalPrevFocus.focus();
    _modalPrevFocus = null;
  }
};

// Fecha o modal mais acima ao pressionar Esc
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const abertos = [...document.querySelectorAll('.modal-overlay')].filter(m => m.style.display === 'flex');
  if (abertos.length) window.closeModal(abertos[abertos.length - 1].id);
});

// Fecha ao clicar no fundo escuro (fora do conteúdo) de qualquer modal
document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('mousedown', (e) => {
    if (e.target === ov) window.closeModal(ov.id);
  });
});

// Acessibilidade: botões só-ícone possuem `title` mas nem sempre `aria-label`.
// Espelha title -> aria-label (inclusive em conteúdo renderizado dinamicamente).
function espelharTitlesParaAria(raiz = document) {
  raiz.querySelectorAll('button[title]:not([aria-label])').forEach(b => b.setAttribute('aria-label', b.getAttribute('title')));
}
const _ariaObserver = new MutationObserver(muts => {
  for (const m of muts) {
    m.addedNodes.forEach(n => { if (n.nodeType === 1) espelharTitlesParaAria(n); });
  }
});
_ariaObserver.observe(document.body, { childList: true, subtree: true });
espelharTitlesParaAria();

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ╔══════════════════════════════════════════════════════════════╗
// ║                     BUSCA GLOBAL (TOPO)                       ║
// ╚══════════════════════════════════════════════════════════════╝
const _gs = { cache: null, carregando: false, ativo: -1, resultados: [] };

async function gsGarantirCache() {
  if (_gs.cache || _gs.carregando) return;
  _gs.carregando = true;
  try {
    const { data } = await fetchTudo('v_funcionarios_atual', 'funcionario_id, nome, matricula, cpf, funcao, lotacao_nome, vinculo', 'nome');
    const porId = new Map();
    for (const f of data || []) {
      porId.set(f.funcionario_id, { ...f, _fonte: 'ativos' });
    }
    // Cedidos/Recebidos também entram na busca global (muitas vezes não estão em v_funcionarios_atual)
    try {
      const { data: ceds } = await sb.from('v_cedencias_atuais')
        .select('funcionario_id, nome, matricula, tipo, orgao_destino_origem')
        .limit(2000);
      for (const c of ceds || []) {
        const id = c.funcionario_id;
        if (!id) continue;
        if (porId.has(id)) {
          const cur = porId.get(id);
          cur.vinculo = cur.vinculo || c.tipo;
          cur.lotacao_nome = cur.lotacao_nome || c.orgao_destino_origem || cur.lotacao_nome;
        } else {
          porId.set(id, {
            funcionario_id: id,
            nome: c.nome,
            matricula: c.matricula,
            cpf: null,
            funcao: null,
            lotacao_nome: c.orgao_destino_origem || 'Cedência',
            vinculo: c.tipo || 'CEDIDO/RECEBIDO',
            _fonte: 'cedencia'
          });
        }
      }
    } catch (_) { /* view pode faltar */ }
    _gs.cache = [...porId.values()];
  } finally {
    _gs.carregando = false;
  }
}

function gsBuscar(termo) {
  if (!_gs.cache) return [];
  const t = termo.trim().toLowerCase();
  if (t.length < 2) return [];
  const digitos = soDigitos(t);
  const palavras = t.split(/\s+/).filter(Boolean);
  return _gs.cache.filter(f => {
    const nome = (f.nome || '').toLowerCase();
    const mat = String(f.matricula || '').toLowerCase();
    const cpf = soDigitos(f.cpf);
    const porNome = palavras.every(p => nome.includes(p));
    const porMat = mat && mat.includes(t);
    const porCpf = digitos.length >= 3 && cpf && cpf.includes(digitos);
    return porNome || porMat || porCpf;
  }).slice(0, 12);
}

function gsRender(lista) {
  const box = $('gs-results');
  _gs.resultados = lista;
  _gs.ativo = -1;
  if (!lista.length) {
    box.innerHTML = '<div class="gs-empty">Nenhum servidor encontrado</div>';
  } else {
    box.innerHTML = lista.map((f, i) => `
      <div class="gs-item" role="option" data-idx="${i}" data-id="${f.funcionario_id}">
        <div class="gs-item-nome">${htmlEscape(f.nome)}</div>
        <div class="gs-item-meta">Mat: ${htmlEscape(f.matricula || 'S/M')} · ${htmlEscape(f.vinculo || '—')} · ${htmlEscape(f.lotacao_nome || 'Sem lotação')}</div>
      </div>`).join('');
    box.querySelectorAll('.gs-item').forEach(el => {
      el.addEventListener('mousedown', (e) => { e.preventDefault(); gsSelecionar(Number(el.dataset.id)); });
    });
  }
  box.style.display = 'block';
  $('gs-input').setAttribute('aria-expanded', 'true');
}

function gsFechar() {
  const box = $('gs-results');
  box.style.display = 'none';
  box.innerHTML = '';
  _gs.ativo = -1;
  _gs.resultados = [];
  $('gs-input').setAttribute('aria-expanded', 'false');
}

function gsSelecionar(id) {
  gsFechar();
  $('gs-input').value = '';
  abrirEdicao(id);
}

function gsDestacarAtivo() {
  const itens = $('gs-results').querySelectorAll('.gs-item');
  itens.forEach((el, i) => el.classList.toggle('active', i === _gs.ativo));
  if (_gs.ativo >= 0 && itens[_gs.ativo]) itens[_gs.ativo].scrollIntoView({ block: 'nearest' });
}

if ($('gs-input')) {
  const input = $('gs-input');
  input.addEventListener('focus', gsGarantirCache);
  input.addEventListener('input', debounce(async () => {
    await gsGarantirCache();
    const termo = input.value;
    if (termo.trim().length < 2) { gsFechar(); return; }
    gsRender(gsBuscar(termo));
  }, 200));
  input.addEventListener('keydown', (e) => {
    if ($('gs-results').style.display !== 'block') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); _gs.ativo = Math.min(_gs.ativo + 1, _gs.resultados.length - 1); gsDestacarAtivo(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _gs.ativo = Math.max(_gs.ativo - 1, 0); gsDestacarAtivo(); }
    else if (e.key === 'Enter') {
      if (_gs.ativo >= 0 && _gs.resultados[_gs.ativo]) { e.preventDefault(); gsSelecionar(_gs.resultados[_gs.ativo].funcionario_id); }
    } else if (e.key === 'Escape') { gsFechar(); input.blur(); }
  });
  document.addEventListener('click', (e) => {
    if (!$('global-search').contains(e.target)) gsFechar();
  });
}

// Invalida o cache da busca global após operações que alteram servidores.
function gsInvalidarCache() {
  _gs.cache = null;
  if (typeof giapInvalidarMapaRh === 'function') giapInvalidarMapaRh();
}

function htmlEscape(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Remove caracteres que têm significado especial na sintaxe de filtros do PostgREST
// (vírgula, parênteses, aspas) evitando que o valor digitado quebre/altere a query .or()/.eq().
function sanitizarTermoFiltro(s) {
  return String(s ?? '').replace(/["(),]/g, ' ').trim();
}
// Para filtros ILIKE: além do acima, escapa os curingas do LIKE e monta o termo com %.
function sanitizarTermoLike(s) {
  return sanitizarTermoFiltro(s).replace(/[%_*]/g, ' ').split(/\s+/).filter(Boolean).join('%');
}

// ╔══════════════════════════════════════════════════════════════╗
// ║               MÁSCARAS E VALIDAÇÃO DE DADOS                   ║
// ╚══════════════════════════════════════════════════════════════╝
const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');

function mascaraCPF(valor) {
  return soDigitos(valor).slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function mascaraTelefone(valor) {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

// Validação de CPF pelos dígitos verificadores (aceita vazio = opcional).
function cpfValido(valor) {
  const cpf = soDigitos(valor);
  if (cpf.length === 0) return true;             // campo opcional
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;    // todos iguais (000... , 111...)
  const calcDig = (fatorInicial) => {
    let soma = 0;
    for (let i = 0; i < fatorInicial - 1; i++) soma += Number(cpf[i]) * (fatorInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calcDig(10) === Number(cpf[9]) && calcDig(11) === Number(cpf[10]);
}

function emailValido(valor) {
  const v = String(valor ?? '').trim();
  if (v.length === 0) return true;               // campo opcional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// Marca/desmarca o campo como inválido (borda vermelha).
function marcarInvalido(el, invalido) {
  if (!el) return;
  el.style.borderColor = invalido ? 'var(--gov-red)' : '';
  el.setAttribute('aria-invalid', invalido ? 'true' : 'false');
}

// Liga máscaras e validação em tempo real a um par de campos (prefixo add- ou edit-).
function ligarMascarasFormulario(prefixo) {
  const cpf = $(`${prefixo}-cpf`);
  const tel = $(`${prefixo}-telefone`);
  const email = $(`${prefixo}-email`);
  if (cpf) {
    cpf.setAttribute('inputmode', 'numeric');
    cpf.addEventListener('input', () => { cpf.value = mascaraCPF(cpf.value); marcarInvalido(cpf, !cpfValido(cpf.value)); });
    cpf.addEventListener('blur',  () => marcarInvalido(cpf, !cpfValido(cpf.value)));
  }
  if (tel) {
    tel.setAttribute('inputmode', 'tel');
    tel.addEventListener('input', () => { tel.value = mascaraTelefone(tel.value); });
  }
  if (email) {
    email.addEventListener('blur', () => marcarInvalido(email, !emailValido(email.value)));
    email.addEventListener('input', () => marcarInvalido(email, false));
  }
}

// Ativa máscaras/validação nos formulários de cadastro e edição (campos estáticos já existem no DOM).
ligarMascarasFormulario('add');
ligarMascarasFormulario('edit');

async function handleErr(resp, contexto = '') {
  if (resp.error) {
    console.error(contexto, resp.error);
    showToast(`Erro ${contexto}: ${resp.error.message}`, 'error');
    return null;
  }
  return resp.data;
}

// ╔══════════════════════════════════════════════════════════════╗
// ║                      ROUTER POR HASH                          ║
// ╚══════════════════════════════════════════════════════════════╝
const rotas = {
  'painel':       { titulo: 'Painel de Gestão',     bread: 'Painel',         render: renderPainel },
  'funcionarios': { titulo: 'Funcionários',          bread: 'Funcionários',   render: renderFuncionarios },
  'locais':       { titulo: 'Locais Operacionais',   bread: 'Locais',         render: renderLocais },
  'organograma':  { titulo: 'Organograma',           bread: 'Organograma',    render: renderOrganograma },
  'folha-ponto':  { titulo: 'Folha de Ponto',        bread: 'Folha de Ponto', render: renderFolhaPonto },
  'logs':         { titulo: 'Histórico',     bread: 'Histórico',           render: renderLogs },
  'usuarios':     { titulo: 'Usuários do Sistema',    bread: 'Usuários',       render: renderUsuarios }
};

function navigate() {
  if (!state.authenticated) return;
  const hash = (location.hash || '#painel').slice(1);
  const [rota, ...resto] = hash.split('/');
  if (rota === 'usuarios' && !usuarioEhCoordenador()) {
    location.hash = '#painel';
    showToast('Apenas a coordenadora pode gerenciar usuários.', 'warning');
    return;
  }
  if (rota === 'relatorio-api' && !usuarioEhCoordenador()) {
    location.hash = '#painel';
    showToast('Apenas a coordenadora pode acessar a Conferência GIAP.', 'warning');
    return;
  }
  const def = rotas[rota] || rotas['painel'];
  state.rotaAtual = rotas[rota] ? rota : 'painel';

  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.route === rota));
  $$('.bottom-nav-item').forEach(el => el.classList.toggle('active', el.dataset.route === rota));
  $$('.view-section').forEach(el => el.classList.remove('active'));
  $(`view-${rota}`)?.classList.add('active');

  $('header-title').textContent = def.titulo;
  $('header-bread').innerHTML = `Início <span>›</span> <strong>${def.bread}</strong>`;

  // Fecha sidebar automaticamente no mobile ao navegar
  closeSidebarMobile();

  def.render(resto);
}
window.addEventListener('hashchange', navigate);

// ── Sidebar mobile ──
function openSidebarMobile() {
  $('sidebar').classList.add('open');
  $('sidebar-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeSidebarMobile() {
  $('sidebar').classList.remove('open');
  $('sidebar-overlay').classList.remove('active');
  // Não mexe no overflow se modal estiver aberto
  if (!document.querySelector('.modal-overlay[style*="flex"]')) {
    document.body.style.overflow = '';
  }
}
$('btn-close-sidebar').addEventListener('click', closeSidebarMobile);
$('btn-topbar-hamburger').addEventListener('click', openSidebarMobile);
$('sidebar-overlay').addEventListener('click', closeSidebarMobile);


// ╔══════════════════════════════════════════════════════════════╗
// ║                  CARGA INICIAL DE DOMÍNIOS                    ║
// ╚══════════════════════════════════════════════════════════════╝
async function carregarDominios() {
  const [vRes, tRes, lRes, fRes] = await Promise.all([
    sb.from('vinculos').select('id, categoria').order('categoria'),
    sb.from('turnos').select('id, nome').order('nome'),
    sb.from('v_lotacoes_com_count').select('*').range(0, 9999).order('nome'),
    sb.from('v_funcoes').select('funcao')
  ]);

  if (vRes.error) console.warn('Nenhum vínculo carregado — verifique a tabela vinculos e as permissões RLS');
  
  state.vinculos = vRes.data  || [];
  state.turnos   = tRes.data  || [];
  state.lotacoes = (lRes.data || []).filter(l => l.ativo !== false);
  state.funcoes  = fRes?.data || [];

  const listaFuncoes = $('funcoes-cadastradas');
  if (listaFuncoes) {
    listaFuncoes.innerHTML = [...new Set(state.funcoes.map(x => (x.funcao || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map(funcao => `<option value="${htmlEscape(funcao)}"></option>`)
      .join('');
  }

  $('f-vinculo').innerHTML = '<option value="">Todos os vínculos</option>' +
    state.vinculos.map(x => `<option value="${x.id}">${htmlEscape(x.categoria)}</option>`).join('');

  initMultiSelectFuncoes();
  renderMultiSelectFuncoes((state.funcoes || []).map(x => x.funcao).filter(Boolean));

  $('f-lotacao').innerHTML = '<option value="">Todas as lotações</option>' +
    state.lotacoes
      .filter(x => (x.funcionarios_direto ?? 0) > 0)
      .map(x => `<option value="${x.id}">${htmlEscape(x.nome)} (${x.funcionarios_direto})</option>`).join('');

  $('f-turno').innerHTML = '<option value="">Todos os turnos</option>' +
    state.turnos.map(x => `<option value="${x.id}">${htmlEscape(x.nome)}</option>`).join('');

  $('edit-vinculo').innerHTML = '<option value="">— Selecione o vínculo —</option>' +
    state.vinculos.map(x => `<option value="${x.id}">${htmlEscape(x.categoria)}</option>`).join('');
  $('edit-turno').innerHTML = '<option value="">—</option>' +
    state.turnos.map(x => `<option value="${x.id}">${htmlEscape(x.nome)}</option>`).join('');
  $('trf-vinculo').innerHTML = '<option value="">Manter atual</option>' +
    state.vinculos.map(x => `<option value="${x.id}">${htmlEscape(x.categoria)}</option>`).join('');
  $('trf-turno').innerHTML = '<option value="">Manter atual</option>' +
    state.turnos.map(x => `<option value="${x.id}">${htmlEscape(x.nome)}</option>`).join('');
}

// ╔══════════════════════════════════════════════════════════════╗
// ║                          PAINEL                               ║
// ╚══════════════════════════════════════════════════════════════╝
let _chartVinculos = null;
let _chartLocais = null;

async function renderPainel() {
  atualizarAlertasLicenca(); // fire-and-forget no topo do painel
  const [kpiRes, vincsRes, locaisRes, cedKpiRes, totalRes] = await Promise.all([
    sb.from('v_dashboard_kpis').select('*').single(),
    sb.from('v_dashboard_vinculos').select('*'),
    sb.from('v_locais_resumo').select('*'),
    sb.from('v_cedencias_kpis').select('*').single().then(r=>r).catch(()=>({data:null, error:true})),
    // total real de ativos: a view de KPIs só conta quem tem lotação ativa
    sb.from('v_funcionarios_atual').select('funcionario_id', { count: 'exact', head: true })
  ]);

  const kpi    = kpiRes.data    || null;
  // Vínculo "Contrato" não deve aparecer nos cards nem no gráfico do dashboard
  const vincs  = (vincsRes.data || []).filter(v => (v.vinculo || '').trim() !== 'Contrato');
  const locais = locaisRes.data || [];
  const cedKpi = cedKpiRes.data || null;
  const totalAtivos = totalRes.count ?? null;

  ajustarLocaisResumo(locais);
  const ctCard = locais.find(l => (l.categoria || '').toUpperCase().includes('TUTELAR'));

  const corVinc = {
    'Efetivo':'#1351b4','Comissionado':'#b28900',
    'Terceirizado':'#3B6D11','Serviço Prestado':'#534AB7',
    'Contrato Temporário':'#993C1D','PROCAD':'#0F6E56',
    'Contrato/SEMUS':'#e52207','Contrato':'#888','Outro':'#999'
  };

  const irParaFuncionarios = (filtros) => {
    state.filtros = filtros;
    state.page = 1;
    if (location.hash === '#funcionarios') {
      renderFuncionarios();
    } else {
      location.hash = '#funcionarios';
    }
  };

  if (kpi || vincs.length > 0) {
    const totalServ = totalAtivos ?? kpi?.total_servidores ?? vincs.reduce((s,v)=>s+(v.total||0),0);
    const cards = [
      {
        lbl:'Total de Servidores', val: totalServ,
        sub:'Todos os vínculos · ativos', cor:'#071d41',
        click: () => irParaFuncionarios(filtrosBase())
      },
      ...vincs.map(v => {
        const vinculoId = v.vinculo_id ?? state.vinculos.find(x => x.categoria === v.vinculo)?.id ?? null;
        return {
          lbl: v.vinculo, val: v.total, sub: `${Math.round((v.total/totalServ)*100)||0}% do total`,
          cor: corVinc[v.vinculo] || '#888',
          click: () => irParaFuncionarios(filtrosBase({ vinculo_id: vinculoId }))
        };
      })
    ];
    
    if (cedKpi) {
      cards.push({
        lbl:'Servidores Cedidos', val: cedKpi.total_cedidos || 0,
        sub:'Afastados / Emprestados', cor:'var(--gov-yellow)',
        click: () => { location.hash = '#cedidos'; }
      });
      cards.push({
        lbl:'Servidores Recebidos', val: cedKpi.total_recebidos || 0,
        sub:'Origem Externa', cor:'var(--gov-green)',
        click: () => { location.hash = '#cedidos'; }
      });
    }
    $('stats-grid').innerHTML = cards.map(c => `
      <div class="kpi-card" style="border-top-color:${c.cor}">
        <div class="kpi-card-label">${htmlEscape(c.lbl)}</div>
        <div class="kpi-card-value">${(c.val||0).toLocaleString('pt-BR')}</div>
        <div class="kpi-card-sub">${htmlEscape(c.sub)}</div>
        <i class="ti ti-users kpi-card-bg-icon"></i>
      </div>`).join('');
    $$('#stats-grid .kpi-card').forEach((el, i) => { el.onclick = cards[i].click; });

    if (vincs.length > 0) {
      $('graficos-row').style.display = 'grid';
      const chartInstance = Chart.getChart('chart-vinculos');
      if (chartInstance) { chartInstance.destroy(); }
      await new Promise(r => setTimeout(r, 50));
      const ctxV = $('chart-vinculos').getContext('2d');
      _chartVinculos = new Chart(ctxV, {
        type: 'doughnut',
        data: {
          labels: vincs.map(v => v.vinculo),
          datasets: [{ data: vincs.map(v => v.total), backgroundColor: vincs.map(v => corVinc[v.vinculo] || '#ccc'), borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { font: { size: 11 }, padding: 10, boxWidth: 12 } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed/totalServ*100)}%)` } }
          },
          onClick: (e, els) => {
            if (els.length > 0) {
              const v = vincs[els[0].index];
              const vid = v.vinculo_id ?? state.vinculos.find(x => x.categoria === v.vinculo)?.id ?? null;
              irParaFuncionarios(filtrosBase({ vinculo_id: vid }));
            }
          }
        }
      });
    }
  }

  if (locais.length > 0) {
    $('graficos-row').style.display = 'grid';
    if (_chartLocais) { _chartLocais.destroy(); _chartLocais = null; }
    await new Promise(r => setTimeout(r, 50));
    const ctxL = $('chart-locais').getContext('2d');
    const coresLocais = ['#1351b4','#168821','#e52207','#534AB7','#3B6D11','#0F6E56','#993C1D'];
    _chartLocais = new Chart(ctxL, {
      type: 'bar',
      data: {
        labels: locais.map(l => l.categoria),
        datasets: [{
          label: 'Servidores', data: locais.map(l => l.qtd_funcionarios),
          backgroundColor: locais.map((_,i) => coresLocais[i % coresLocais.length]),
          borderRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} servidores` } } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0, stepSize: 1 } },
                  x: { ticks: { font: { size: 11 } } } },
        onClick: (e, els) => {
          if (els.length > 0) {
            const l = locais[els[0].index];
            location.hash = `#locais/${encodeURIComponent(l.categoria)}`;
          }
        }
      }
    });
  }

  if (kpi) {
    $('stats-estrutura').innerHTML = [
      { lbl:'Total de Lotações',    val: kpi.total_lotacoes,          sub:'Cadastradas',          cor:'#071d41' },
      { lbl:'Superintendências',    val: kpi.total_superintendencias, sub:'Topo da estrutura',    cor:'#1351b4' },
      { lbl:'Coordenações',         val: kpi.total_coordenacoes,      sub:'Nível tático',         cor:'#b28900' },
      { lbl:'Diretorias Técnicas',  val: kpi.total_diretorias,        sub:'Nível técnico',        cor:'#3B6D11' },
      { lbl:'Unidades Operacionais',val: (kpi.total_unidades || 0) + (ctCard?.qtd_unidades || 0), sub:'CRAS/CREAS/Abrigos/CT',cor:'#534AB7' },
    ].map(c => `
      <div class="estrutura-item" style="border-bottom:3px solid ${c.cor}">
        <div class="estrutura-item-val">${(c.val||0).toLocaleString('pt-BR')}</div>
        <div class="estrutura-item-lbl">${c.lbl}</div>
        <div class="estrutura-item-sub">${c.sub}</div>
      </div>`).join('');
  }

  const supers = state.lotacoes.filter(l => l.tipo && l.tipo.toUpperCase().includes('SUPERIN') && !l.parent_id);
  if (supers.length > 0) {
    $('cards-superintendencias').innerHTML = supers.map(s => `
      <div class="super-card" data-id="${s.id}">
        <div class="super-card-name">${htmlEscape(s.nome)}</div>
        <div class="super-card-count">${(s.funcionarios_total ?? s.funcionarios_direto ?? 0).toLocaleString('pt-BR')}</div>
        <div class="super-card-label">servidores</div>
      </div>`).join('');
    $$('#cards-superintendencias .super-card').forEach(el => {
      el.onclick = () => {
        state.filtros = filtrosBase({ lotacao_id: Number(el.dataset.id) });
        location.hash = '#funcionarios';
      };
    });
  }

  const iconeLocal = { 'CRAS':'ti-home-heart','CREAS':'ti-alert-circle','Conselho Tutelar':'ti-shield-check','Conselho':'ti-shield-check','Abrigo':'ti-home-2','Centro POP':'ti-building-community','Outros':'ti-building' };
  $('cards-locais-resumo').innerHTML = locais.map(l => {
    const ico = Object.entries(iconeLocal).find(([k]) => l.categoria.toUpperCase().includes(k.toUpperCase()))?.[1] || 'ti-building';
    return `
    <div class="loc-card" data-cat="${htmlEscape(l.categoria)}">
      <i class="ti ${ico}"></i>
      <div class="loc-card-name">${htmlEscape(l.categoria)}</div>
      <div class="loc-card-units"><strong>${l.qtd_unidades}</strong> unidades &nbsp;·&nbsp; <strong>${l.qtd_funcionarios}</strong> servidores</div>
    </div>`;
  }).join('');
  $$('#cards-locais-resumo .loc-card').forEach(el => {
    el.onclick = () => { location.hash = `#locais/${encodeURIComponent(el.dataset.cat)}`; };
  });
}

// ╔══════════════════════════════════════════════════════════════╗
// ║            LOGS SISTEMA                                       ║
// ╚══════════════════════════════════════════════════════════════╝
async function renderLogs() {
  const { data, error } = await sb.from('sistema_logs').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) { console.error('logs', error); return; }
  $('tbody-logs').innerHTML = (data || []).map(l => {
    let det = '';
    if (l.detalhes) {
      try {
        const d = typeof l.detalhes === 'string' ? JSON.parse(l.detalhes) : l.detalhes;
        det = Object.entries(d).map(([k,v]) => `<b>${htmlEscape(k)}</b>: ${htmlEscape(String(v))}`).join(' | ');
      } catch(e) { det = htmlEscape(String(l.detalhes)); }
    }
    return `
    <tr>
      <td style="font-size:12px;color:var(--color-text-sec)">${new Date(l.created_at).toLocaleString('pt-BR')}</td>
      <td style="font-size:12px"><i class="ti ti-user"></i> ${htmlEscape(l.usuario || 'Não identificado')}</td>
      <td><span style="background:var(--gov-blue-light);color:var(--gov-blue-dark);padding:2px 6px;border-radius:4px;font-size:11px;font-weight:bold">${htmlEscape(l.tipo_acao)}</span></td>
      <td><strong>${htmlEscape(l.funcionario_nome || '')}</strong></td>
      <td style="font-size:12px;color:var(--color-text-sec)">${det}</td>
    </tr>
  `;}).join('');
}
window.renderLogs = renderLogs;

// ╔══════════════════════════════════════════════════════════════╗
// ║                 USUÁRIOS DO SISTEMA                          ║
// ╚══════════════════════════════════════════════════════════════╝
function usuarioEhCoordenador() {
  return state.perfilUsuario?.perfil === 'coordenador' && state.perfilUsuario?.ativo !== false;
}

async function renderUsuarios() {
  if (!usuarioEhCoordenador()) return;
  const tbody = $('tbody-usuarios');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><span class="spinner"></span> Carregando…</td></tr>';

  let data = null;
  let error = null;
  const rpc = await sb.rpc('fn_listar_usuarios_sistema');
  if (rpc.error) {
    // Fallback se a RPC ainda não foi publicada no banco
    const fallback = await sb.from('usuarios_sistema')
      .select('user_id, nome, email, perfil, ativo, created_at')
      .order('nome');
    data = fallback.data;
    error = fallback.error;
  } else {
    data = rpc.data;
  }

  if (error) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Erro ao carregar usuários: ${htmlEscape(error.message)}</td></tr>`;
    return;
  }

  if (!data?.length) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum usuário cadastrado.</td></tr>';
    return;
  }

  window._usuariosCache = data;
  tbody.innerHTML = data.map(u => `
    <tr>
      <td><strong>${htmlEscape(u.nome || '—')}</strong></td>
      <td>${htmlEscape(u.email || '—')}</td>
      <td><span class="badge">${u.perfil === 'coordenador' ? 'Coordenadora' : 'Usuário'}</span></td>
      <td><span style="color:${u.ativo === false ? 'var(--gov-red)' : 'var(--gov-green)'};font-weight:700;font-size:12px">${u.ativo === false ? 'Inativo' : 'Ativo'}</span></td>
      <td style="font-size:12px">${u.created_at ? new Date(u.created_at).toLocaleString('pt-BR') : '—'}</td>
      <td style="text-align:center">
        <button class="btn-icon" title="Editar nome" onclick="abrirEditarUsuario('${u.user_id}')">
          <i class="ti ti-pencil"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

window.abrirEditarUsuario = (userId) => {
  if (!usuarioEhCoordenador()) {
    showToast('Apenas a coordenadora pode editar usuários.', 'warning');
    return;
  }
  const usuario = (window._usuariosCache || []).find(u => u.user_id === userId)
    || (state.perfilUsuario?.user_id === userId ? state.perfilUsuario : null);
  if (!usuario) return showToast('Usuário não encontrado.', 'error');

  $('usr-edit-id').value = userId;
  $('usr-edit-nome').value = usuario.nome || '';
  $('usr-edit-email').value = usuario.email || state.usuario?.email || '';
  openModal('modal-editar-usuario');
  setTimeout(() => $('usr-edit-nome')?.focus(), 50);
};

window.abrirEditarMeuNome = () => {
  if (!usuarioEhCoordenador() || !state.perfilUsuario?.user_id) return;
  abrirEditarUsuario(state.perfilUsuario.user_id);
};

$('btn-editar-meu-nome')?.addEventListener('click', () => abrirEditarMeuNome());

$('form-editar-usuario')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!usuarioEhCoordenador()) return;

  const userId = $('usr-edit-id').value;
  const nome = $('usr-edit-nome').value.trim();
  const usuarioAlvo = (window._usuariosCache || []).find(u => u.user_id === userId)
    || (state.perfilUsuario?.user_id === userId ? state.perfilUsuario : null);
  const nomeAnterior = usuarioAlvo?.nome || null;

  if (!userId || !nome) return showToast('Informe o nome do usuário.', 'warning');
  if (nome.length < 2) return showToast('O nome deve ter pelo menos 2 caracteres.', 'warning');

  const btn = $('btn-salvar-editar-usuario');
  btn.disabled = true;
  const { error } = await sb.rpc('fn_atualizar_nome_usuario', {
    p_user_id: userId,
    p_nome: nome
  });
  btn.disabled = false;

  if (error) return showToast(error.message || 'Erro ao salvar nome.', 'error');

  const email = $('usr-edit-email').value || '';
  await registrarLog('EDIÇÃO DE NOME DE USUÁRIO', null, nome, {
    user_id: userId,
    email,
    nome_anterior: nomeAnterior
  });

  if (state.perfilUsuario?.user_id === userId) {
    state.perfilUsuario = { ...state.perfilUsuario, nome };
    atualizarDisplayUsuario(nome);
  }
  if (window._usuariosCache) {
    window._usuariosCache = window._usuariosCache.map(u =>
      u.user_id === userId ? { ...u, nome } : u
    );
  }

  closeModal('modal-editar-usuario');
  showToast('Nome atualizado com sucesso!', 'success');
  renderUsuarios();
});

window.abrirCadastroUsuario = () => {
  if (!usuarioEhCoordenador()) {
    showToast('Apenas a coordenadora pode cadastrar usuários.', 'warning');
    return;
  }
  $('form-usuario')?.reset();
  openModal('modal-usuario');
};

$('form-usuario')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!usuarioEhCoordenador()) return;

  const nome = $('usr-nome').value.trim();
  const email = $('usr-email').value.trim().toLowerCase();
  const senha = $('usr-senha').value;
  const confirmar = $('usr-confirmar').value;
  if (!nome || !email || !senha) return showToast('Preencha todos os campos.', 'warning');
  if (senha.length < 8) return showToast('A senha deve ter pelo menos 8 caracteres.', 'warning');
  if (senha !== confirmar) return showToast('As senhas não conferem.', 'warning');

  const btn = $('btn-salvar-usuario');
  btn.disabled = true;
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) {
    btn.disabled = false;
    return showToast('Sessão expirada. Faça login novamente.', 'warning');
  }

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/criar-usuario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON
      },
      body: JSON.stringify({ nome, email, senha })
    });
  } catch (err) {
    btn.disabled = false;
    console.error('Cadastro de usuário — falha de rede/CORS:', err);
    return showToast(
      'Serviço de cadastro indisponível. A Edge Function criar-usuario ainda não está publicada no Supabase.',
      'error'
    );
  }

  const result = await response.json().catch(() => ({}));
  btn.disabled = false;
  if (response.status === 404) {
    return showToast(
      'Função criar-usuario não encontrada. Publique-a no Supabase (veja supabase/DEPLOY.md).',
      'error'
    );
  }
  if (!response.ok) {
    return showToast(result.error || 'Erro ao cadastrar usuário.', 'error');
  }
  if (!result.ok || !result.usuario) {
    console.error('Resposta inesperada do cadastro:', response.status, result);
    return showToast(
      'O serviço respondeu, mas não confirmou o cadastro. Confira se a Edge Function criar-usuario está com o código atualizado.',
      'error'
    );
  }

  closeModal('modal-usuario');
  showToast(`Usuário ${result.usuario.nome || nome} cadastrado com sucesso!`, 'success');
  renderUsuarios();
});

// ╔══════════════════════════════════════════════════════════════╗
// ║                       FUNCIONÁRIOS                            ║
// ╚══════════════════════════════════════════════════════════════╝
async function renderFuncionarios(resto = []) {
  // Link vindo da Conferência GIAP: abre Funcionários já filtrado.
  if (resto[0] === 'busca' && resto[1]) {
    let nomeBusca = '';
    try {
      nomeBusca = decodeURIComponent(resto.slice(1).join('/'));
    } catch (_) {
      nomeBusca = resto.slice(1).join(' ');
    }
    state.filtros = {
      busca: nomeBusca,
      vinculo_id: null,
      lotacao_id: null,
      funcoes: [],
      turno_id: null
    };
  }
  state.page = 1;
  $('f-busca').value = state.filtros.busca || '';
  await atualizarOpcoesFiltros();
  atualizarIconesSort();
  renderFilterTags();
  await carregarFuncionarios();
}

function renderFilterTags() {
  const tags = [];
  if (state.filtros.vinculo_id) {
    const v = state.vinculos.find(x => x.id == state.filtros.vinculo_id);
    if (v) tags.push(`<span class="filter-tag">Vínculo: ${htmlEscape(v.categoria)} <button data-clear="vinculo_id">×</button></span>`);
  }
  (state.filtros.funcoes || []).forEach((f, idx) => {
    tags.push(`<span class="filter-tag">Função: ${htmlEscape(f)} <button data-clear-funcao="${idx}">×</button></span>`);
  });
  if (state.filtros.lotacao_id) {
    const l = state.lotacoes.find(x => x.id == state.filtros.lotacao_id);
    if (l) tags.push(`<span class="filter-tag">Lotação: ${htmlEscape(l.nome)} <button data-clear="lotacao_id">×</button></span>`);
  }
  if (state.filtros.turno_id) {
    const t = state.turnos.find(x => x.id == state.filtros.turno_id);
    if (t) tags.push(`<span class="filter-tag">Turno: ${htmlEscape(t.nome)} <button data-clear="turno_id">×</button></span>`);
  }
  $('filter-tags').innerHTML = tags.join(' ');
  $$('#filter-tags button[data-clear]').forEach(b => b.onclick = async () => {
    const key = b.dataset.clear;
    state.filtros[key] = null;
    if (key === 'vinculo_id') {
      invalidarCacheFiltros();
      state.filtros.funcoes = [];
    }
    state.page = 1;
    await atualizarOpcoesFiltros();
    await carregarFuncionarios();
    renderFilterTags();
  });
  $$('#filter-tags button[data-clear-funcao]').forEach(b => b.onclick = async () => {
    const idx = Number(b.dataset.clearFuncao);
    state.filtros.funcoes = (state.filtros.funcoes || []).filter((_, i) => i !== idx);
    atualizarRotuloFuncoes();
    state.page = 1;
    await atualizarOpcoesFiltros();
    await carregarFuncionarios();
    renderFilterTags();
  });
}

/** Busca na RPC; com várias funções aplica filtro no cliente.
 *  Cedidos/Recebidos (fora de v_funcionarios_atual) entram quando há termo de busca. */
async function buscarFuncionariosRpc({ paginar = true } = {}) {
  const funcoesSel = Array.isArray(state.filtros.funcoes) ? state.filtros.funcoes : [];
  const multiFunc = funcoesSel.length > 1;
  const pFuncao = funcoesSel.length === 1 ? funcoesSel[0] : null;
  const termo = state.filtros.busca ? state.filtros.busca.trim() : '';

  async function mesclarCedidos(rows, totalBase) {
    if (!termo || termo.length < 2) return { rows, total: totalBase };
    try {
      const t = termo.replace(/%/g, '').trim();
      const safe = t.replace(/[,.()]/g, ' ').replace(/\s+/g, ' ').trim();
      if (safe.length < 2) return { rows, total: totalBase };
      const { data: ceds } = await sb.from('v_cedencias_atuais')
        .select('funcionario_id, nome, matricula, tipo, orgao_destino_origem')
        .or(`nome.ilike.%${safe}%,matricula.ilike.%${safe}%`)
        .limit(100);
      if (!ceds?.length) return { rows, total: totalBase };
      const ids = new Set(rows.map((r) => r.funcionario_id));
      const extras = [];
      for (const c of ceds) {
        if (!c.funcionario_id || ids.has(c.funcionario_id)) continue;
        ids.add(c.funcionario_id);
        extras.push({
          funcionario_id: c.funcionario_id,
          nome: c.nome,
          vinculo: c.tipo || 'CEDIDO/RECEBIDO',
          funcao: null,
          lotacao_nome: c.orgao_destino_origem || 'Cedência',
          caminho_lotacao: null,
          turno: null,
          total: null
        });
      }
      if (!extras.length) return { rows, total: totalBase };
      const merged = [...extras, ...rows];
      return { rows: merged, total: totalBase + extras.length };
    } catch (_) {
      return { rows, total: totalBase };
    }
  }

  if (!multiFunc && paginar) {
    const params = {
      p_termo:      termo ? termo.split(/\s+/).join('%') : null,
      p_vinculo_id: state.filtros.vinculo_id ? Number(state.filtros.vinculo_id) : null,
      p_lotacao_id: state.filtros.lotacao_id ? Number(state.filtros.lotacao_id) : null,
      p_funcao:     pFuncao,
      p_turno_id:   state.filtros.turno_id ? Number(state.filtros.turno_id) : null,
      p_limite:     state.pageSize,
      p_offset:     (state.page - 1) * state.pageSize,
      p_order_by:   state.sort.col,
      p_order_dir:  state.sort.dir,
    };
    const data = await handleErr(await sb.rpc('fn_buscar_funcionarios', params), 'busca funcionários');
    if (!data) return null;
    const baseTotal = data[0]?.total || 0;
    if (state.page === 1 && termo) {
      const m = await mesclarCedidos(data, baseTotal);
      return { rows: m.rows.slice(0, state.pageSize), total: m.total };
    }
    return { rows: data, total: baseTotal };
  }

  const pageSize = 1000;
  let offset = 0;
  let totalRpc = Infinity;
  const todos = [];
  if (multiFunc && paginar && $('table-body')) {
    $('table-body').innerHTML = `<tr><td colspan="8" class="empty-state"><span class="spinner"></span> Carregando várias funções…</td></tr>`;
  }
  while (offset < totalRpc) {
    const params = {
      p_termo:      termo ? termo.split(/\s+/).join('%') : null,
      p_vinculo_id: state.filtros.vinculo_id ? Number(state.filtros.vinculo_id) : null,
      p_lotacao_id: state.filtros.lotacao_id ? Number(state.filtros.lotacao_id) : null,
      p_funcao:     multiFunc ? null : pFuncao,
      p_turno_id:   state.filtros.turno_id ? Number(state.filtros.turno_id) : null,
      p_limite:     pageSize,
      p_offset:     offset,
      p_order_by:   state.sort.col,
      p_order_dir:  state.sort.dir,
    };
    const data = await handleErr(await sb.rpc('fn_buscar_funcionarios', params), 'busca funcionários');
    if (!data || data.length === 0) break;
    totalRpc = data[0].total || data.length;
    todos.push(...data);
    offset += pageSize;
    if (data.length < pageSize) break;
  }

  let filtrados = todos;
  if (funcoesSel.length) {
    const set = new Set(funcoesSel);
    filtrados = todos.filter(f => set.has((f.funcao || '').trim()));
  }
  const mesclado = await mesclarCedidos(filtrados, filtrados.length);
  filtrados = mesclado.rows;
  const total = filtrados.length;
  if (!paginar) return { rows: filtrados, total };
  const ini = (state.page - 1) * state.pageSize;
  return { rows: filtrados.slice(ini, ini + state.pageSize), total };
}

async function carregarFuncionarios() {
  $('table-body').innerHTML = `<tr><td colspan="8" class="empty-state"><span class="spinner"></span> Carregando…</td></tr>`;
  const resultado = await buscarFuncionariosRpc({ paginar: true });
  if (!resultado) return;
  const { rows: data, total } = resultado;
  state.total = total;

  if (data.length === 0) {
    $('table-body').innerHTML = `<tr><td colspan="8"><div class="empty-state">Nenhum funcionário encontrado</div></td></tr>`;
  } else {
    // Busca matrícula + admissão em paralelo (não vem da RPC)
    const ids = data.map(d => d.funcionario_id);
    const { data: extras } = await sb.from('funcionarios').select('id, matricula, data_admissao').in('id', ids);
    const mapEx = Object.fromEntries((extras || []).map(x => [x.id, x]));
    const fmtDt = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

    $('table-body').innerHTML = data.map(f => {
      const ex = mapEx[f.funcionario_id] || {};
      return `
      <tr>
        <td style="font-family:monospace;font-size:12px;color:var(--color-text-sec)">${htmlEscape(ex.matricula || '—')}</td>
        <td style="font-weight:500;color:var(--gov-blue-dark)">${htmlEscape(f.nome)}</td>
        <td>${htmlEscape(f.vinculo || '-')}</td>
        <td>${htmlEscape(f.funcao || '—')}</td>
        <td title="${htmlEscape(f.caminho_lotacao || '')}">${htmlEscape(f.lotacao_nome || '—')}</td>
        <td style="font-size:12px;color:var(--color-text-sec)">${fmtDt(ex.data_admissao)}</td>
        <td>${htmlEscape(f.turno || '—')}</td>
        <td style="text-align:center">
          <div class="table-actions">
            <button class="btn-icon" title="Editar" onclick="abrirEdicao(${f.funcionario_id})">Editar</button>
            <button class="btn-icon" title="Transferir" onclick="abrirTransferencia(${f.funcionario_id})">Transferir</button>
            <button class="btn-icon" title="Histórico" onclick="verHistorico(${f.funcionario_id})">Histórico</button>
            <button class="btn-icon" style="color:var(--gov-red)" title="Remover" onclick="abrirRemoverServidor(${f.funcionario_id})">Remover</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }
  renderPaginacao();
}

function renderPaginacao() {
  const total = state.total;
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  const ini = (state.page - 1) * state.pageSize + 1;
  const fim = Math.min(state.page * state.pageSize, total);
  $('page-info').textContent = total === 0 ? 'Nenhum registro' : `Mostrando ${ini}-${fim} de ${total.toLocaleString('pt-BR')}`;

  const btn = (label, p, dis, active=false) => `<button class="page-btn ${active?'active':''}" ${dis?'disabled':''} data-page="${p}">${label}</button>`;
  let html = btn('«', state.page-1, state.page===1);
  const start = Math.max(1, state.page-2), end = Math.min(totalPages, start+4);
  for (let i = start; i <= end; i++) html += btn(i, i, false, i === state.page);
  html += btn('»', state.page+1, state.page === totalPages);
  $('page-controls').innerHTML = html;
  $$('#page-controls .page-btn').forEach(b => b.onclick = () => {
    if (b.disabled) return;
    state.page = Number(b.dataset.page);
    carregarFuncionarios();
  });
}

// Filtros (event listeners)
$('f-busca').addEventListener('input', debounce(e => {
  state.filtros.busca = e.target.value; state.page = 1; carregarFuncionarios(); renderFilterTags();
}, 300));
$('f-vinculo').addEventListener('change', async e => {
  state.filtros.vinculo_id = e.target.value ? Number(e.target.value) : null;
  state.filtros.funcoes = [];
  invalidarCacheFiltros();
  state.page = 1;
  await atualizarOpcoesFiltros();
  await carregarFuncionarios();
  renderFilterTags();
});
$('f-lotacao').addEventListener('change', async e => {
  state.filtros.lotacao_id = e.target.value ? Number(e.target.value) : null;
  state.page = 1;
  await atualizarOpcoesFiltros();
  await carregarFuncionarios();
  renderFilterTags();
});
$('f-turno').addEventListener('change', async e => {
  state.filtros.turno_id = e.target.value ? Number(e.target.value) : null;
  state.page = 1;
  await atualizarOpcoesFiltros();
  await carregarFuncionarios();
  renderFilterTags();
});
$('btn-limpar').onclick = async () => {
  state.filtros = filtrosBase();
  state.sort = { col: 'nome', dir: 'asc' };
  state.page = 1;
  $('f-busca').value = '';
  invalidarCacheFiltros();
  await atualizarOpcoesFiltros();
  atualizarIconesSort();
  await carregarFuncionarios();
  renderFilterTags();
};

function csvEscapar(val) {
  const s = val == null ? '' : String(val);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function baixarPlanilhaCSV(nomeArquivo, cabecalhos, linhas) {
  const sep = ';';
  const corpo = [
    cabecalhos.map(csvEscapar).join(sep),
    ...linhas.map(row => row.map(csvEscapar).join(sep))
  ].join('\r\n');
  const blob = new Blob(['\uFEFF' + corpo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportarRelatorioFuncionarios() {
  const btn = $('btn-exportar-func');
  const rotulo = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Gerando…';
  }
  try {
    const resultado = await buscarFuncionariosRpc({ paginar: false });
    const todos = resultado?.rows || [];

    if (todos.length === 0) {
      showToast('Nenhum registro para exportar.', 'info');
      return;
    }

    const mapEx = {};
    for (let i = 0; i < todos.length; i += 200) {
      const ids = todos.slice(i, i + 200).map(d => d.funcionario_id);
      const { data: extras } = await sb.from('funcionarios').select('id, matricula, data_admissao').in('id', ids);
      (extras || []).forEach(x => { mapEx[x.id] = x; });
    }

    const fmtDt = (s) => {
      if (!s) return '';
      const d = new Date(s + 'T00:00:00');
      return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('pt-BR');
    };

    const cabecalhos = ['Matrícula', 'Nome', 'Vínculo', 'Função', 'Lotação', 'Admissão', 'Turno'];
    const linhas = todos.map(f => {
      const ex = mapEx[f.funcionario_id] || {};
      return [
        ex.matricula || '',
        f.nome || '',
        f.vinculo || '',
        f.funcao || '',
        f.lotacao_nome || '',
        fmtDt(ex.data_admissao),
        f.turno || ''
      ];
    });

    const vinc = state.filtros.vinculo_id
      ? state.vinculos.find(x => x.id == state.filtros.vinculo_id)
      : null;
    const sufixo = vinc
      ? '_' + vinc.categoria.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').toLowerCase()
      : '';
    const dataHoje = new Date().toISOString().slice(0, 10);
    baixarPlanilhaCSV(`servidores${sufixo}_${dataHoje}.csv`, cabecalhos, linhas);
    showToast(`${todos.length.toLocaleString('pt-BR')} registro(s) exportado(s).`, 'success');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = rotulo || 'Baixar planilha';
    }
  }
}
window.exportarRelatorioFuncionarios = exportarRelatorioFuncionarios;

const _btnExportarFunc = $('btn-exportar-func');
if (_btnExportarFunc) _btnExportarFunc.onclick = () => exportarRelatorioFuncionarios();

// ╔══════════════════════════════════════════════════════════════╗
// ║            LOCAIS (drill-down 3 níveis)                       ║
// ╚══════════════════════════════════════════════════════════════╝
async function renderLocais(resto) {
  const [categoria, lotacaoId] = resto || [];
  renderCrumbsLocais(categoria, lotacaoId);

  if (!categoria) {
    const locais = ajustarLocaisResumo(await handleErr(await sb.from('v_locais_resumo').select('*'), 'locais') || []);
    $('locais-content').innerHTML = `
      <div class="cards-grid">
        ${locais.map(l => `
          <div class="big-card" data-cat="${htmlEscape(l.categoria)}">
            <div class="big-card-title">${htmlEscape(l.categoria)}</div>
            <div class="big-card-meta">
              <span><strong>${l.qtd_unidades}</strong> unidades</span>
              <span><strong>${l.qtd_funcionarios}</strong> servidores</span>
            </div>
          </div>`).join('')}
      </div>`;
    $$('#locais-content .big-card').forEach(el => {
      el.onclick = () => { location.hash = `#locais/${encodeURIComponent(el.dataset.cat)}`; };
    });
  } else if (!lotacaoId) {
    const catDecoded = decodeURIComponent(categoria);
    const { data: catData } = await sb.from('v_locais_resumo').select('*').eq('categoria', catDecoded);
    
    let unidades = [];
    if (catData && catData.length > 0 && catData[0].parent_id_ref != null) {
      unidades = state.lotacoes.filter(l => l.parent_id == catData[0].parent_id_ref);
    }
    // Fallback agressivo usando a mesma regra da View do banco
    if (unidades.length === 0) {
      unidades = state.lotacoes.filter(l => {
        const nome = (l.nome || '').toLowerCase();
        let catCalculada = 'outros';
        
        if (nome.includes('cras')) catCalculada = 'cras';
        else if (nome.includes('creas')) catCalculada = 'creas';
        else if (nome.includes('abrigo')) catCalculada = 'abrigos';
        else if (nome.includes('centro pop')) catCalculada = 'centros pop';
        else if (nome.startsWith('ct ') || nome.includes('conselho tutelar')) catCalculada = 'conselhos tutelares';
        else if (nome.includes('cmas') || nome.includes('cmdca') || nome.includes('cmdi') || nome.includes('conselho')) catCalculada = 'conselhos';

        const catLower = catDecoded.toLowerCase();
        
        // Se ambos referem-se a conselho tutelar
        if (catCalculada === 'conselhos tutelares' && catLower.includes('tutelar')) return true;
        // Se ambos referem-se a conselhos normais (e não tutelar)
        if (catCalculada === 'conselhos' && catLower.includes('conselho') && !catLower.includes('tutelar')) return true;

        const catSingular = catLower.endsWith('s') ? catLower.slice(0, -1) : catLower;
        return catCalculada === catLower || catCalculada === catSingular || catCalculada === catLower + 's';
      });
    }

    unidades = unidades.sort((a,b) => a.nome.localeCompare(b.nome));

    if (unidades.length === 0) {
      $('locais-content').innerHTML = `<div class="empty-state">Nenhuma unidade encontrada para "${htmlEscape(catDecoded)}"</div>`;
      return;
    }

    $('locais-content').innerHTML = `
      <div class="cards-grid">
        ${unidades.map(u => `
          <div class="big-card" data-id="${u.id}">
            <div class="big-card-title">${htmlEscape(u.nome)}</div>
            <div class="big-card-meta">
              <span><strong>${u.funcionarios_direto ?? 0}</strong> servidores</span>
            </div>
          </div>`).join('')}
      </div>`;
    $$('#locais-content .big-card').forEach(el => {
      el.onclick = () => { location.hash = `#locais/${categoria}/${el.dataset.id}`; };
    });
  } else {
    const lot = state.lotacoes.find(x => x.id == lotacaoId);
    if (!lot) { $('locais-content').innerHTML = '<div class="empty-state">Unidade não encontrada</div>'; return; }

    $('locais-content').innerHTML = `
      <div class="card">
        <h3 style="color:var(--gov-blue-dark);margin-bottom:6px">${htmlEscape(lot.nome)}</h3>
        <div style="color:var(--color-text-muted);font-size:13px;margin-bottom:16px">
          ${lot.funcionarios_direto} servidor(es)
          <button class="btn-link" onclick="verServidoresPorLotacao(${lot.id})">Ver na lista completa</button>
        </div>
        <div class="table-container">
          <table class="gov-table">
            <thead><tr><th>Nome</th><th>Vínculo</th><th>Função</th><th>Turno</th><th style="width:140px">Ações</th></tr></thead>
            <tbody id="unidade-tbody"><tr><td colspan="5" class="empty-state"><span class="spinner"></span></td></tr></tbody>
          </table>
        </div>
      </div>`;

    const data = await handleErr(await sb.rpc('fn_buscar_funcionarios', {
      p_termo: null, p_vinculo_id: null, p_lotacao_id: Number(lotacaoId),
      p_limite: 500, p_offset: 0,
    }), 'unidade');

    if (!data || data.length === 0) {
      $('unidade-tbody').innerHTML = `<tr><td colspan="5" class="empty-state">Sem servidores nessa unidade</td></tr>`;
    } else {
      $('unidade-tbody').innerHTML = data.map(f => `
        <tr>
          <td style="font-weight:500;color:var(--gov-blue-dark)">${htmlEscape(f.nome)}</td>
          <td>${htmlEscape(f.vinculo || '-')}</td>
          <td>${htmlEscape(f.funcao || '—')}</td>
          <td>${htmlEscape(f.turno || '—')}</td>
          <td style="text-align:center">
            <div class="table-actions">
              <button class="btn-icon" title="Editar" onclick="abrirEdicao(${f.funcionario_id})">Editar</button>
              <button class="btn-icon" title="Transferir" onclick="abrirTransferencia(${f.funcionario_id})">Transferir</button>
              <button class="btn-icon" title="Histórico" onclick="verHistorico(${f.funcionario_id})">Histórico</button>
              <button class="btn-icon" style="color:var(--gov-red)" title="Remover" onclick="abrirRemoverServidor(${f.funcionario_id})">Remover</button>
            </div>
          </td>
        </tr>`).join('');
    }
  }
}

function renderCrumbsLocais(categoria, lotacaoId) {
  let html = `<button onclick="location.hash='#locais'">Locais</button>`;
  if (categoria) {
    html += `<span class="sep">›</span>`;
    if (lotacaoId) {
      html += `<button onclick="location.hash='#locais/${categoria}'">${decodeURIComponent(categoria)}</button>`;
      const lot = state.lotacoes.find(x => x.id == lotacaoId);
      html += `<span class="sep">›</span><span class="current">${htmlEscape(lot?.nome || '?')}</span>`;
    } else {
      html += `<span class="current">${decodeURIComponent(categoria)}</span>`;
    }
  }
  $('locais-crumbs').innerHTML = html;
}

// ╔══════════════════════════════════════════════════════════════╗
// ║                       ORGANOGRAMA                             ║
// ╚══════════════════════════════════════════════════════════════╝
async function renderOrganograma() {
  if ($('org-tree').dataset.loaded === '1') return;
  const dados = await handleErr(await sb.rpc('fn_organograma_completo'), 'organograma') || [];

  const byId = Object.fromEntries(dados.map(x => [x.id, { ...x, filhos: [] }]));
  const raizes = [];
  for (const n of Object.values(byId)) {
    if (n.parent_id && byId[n.parent_id]) byId[n.parent_id].filhos.push(n);
    else raizes.push(n);
  }
  Object.values(byId).forEach(n => n.filhos.sort((a,b) => a.nome.localeCompare(b.nome)));

  const secoes = classificarNiveisSemcas(raizes);

  function render(n, depth) {
    const temFilhos = n.filhos.length > 0;
    const total = n.funcionarios_total;
    const direto = n.funcionarios_direto;
    const badge = `<span class="badge-count ${total === 0 ? 'zero' : ''}">${total}</span>`;
    const tipoLabel = {
      'superintendencia': 'SUP',
      'coordenacao': 'COORD',
      'diretoria': 'DIR',
      'unidade': 'UNID'
    }[n.tipo] || n.tipo.slice(0,4).toUpperCase();
    let html = `
      <div class="org-node" data-id="${n.id}" data-filhos="${temFilhos}">
        <span class="toggle ${temFilhos ? '' : 'empty'}">›</span>
        <span class="tipo-tag" data-tipo="${n.tipo}">${tipoLabel}</span>
        <span class="nome">${htmlEscape(n.nome)}</span>
        ${badge}
        <button class="btn-eye" title="Ver funcionários desta lotação" data-lotid="${n.id}">Ver</button>
      </div>`;
    if (temFilhos) {
      html += `<div class="org-children" data-parent="${n.id}">${n.filhos.map(c => render(c, depth+1)).join('')}</div>`;
    }
    return html;
  }
  $('org-tree').innerHTML = secoes
    .filter(s => s.itens.length > 0)
    .map(s => `
      <div class="org-nivel-header" style="${ORG_NIVEL_HEADER_STYLE}"><span>${htmlEscape(s.titulo)}</span></div>
      ${s.itens.map(r => render(r, 0)).join('')}`)
    .join('');
  $('org-tree').dataset.loaded = '1';

  $$('#org-tree .btn-eye').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      state.filtros = { busca:'', vinculo_id:null, lotacao_id: Number(btn.dataset.lotid) };
      state.page = 1;
      location.hash = '#funcionarios';
    };
  });
}
window.orgExpandirTudo = () => {
  $$('#org-tree .org-children').forEach(el => el.classList.add('open'));
};
window.orgRecolherTudo = () => {
  $$('#org-tree .org-children').forEach(el => el.classList.remove('open'));
};

// ╔══════════════════════════════════════════════════════════════╗
// ║                     MODAL EDIÇÃO                              ║
// ╚══════════════════════════════════════════════════════════════╝
window.excluirFuncionario = async (id) => {
  abrirRemoverServidor(id);
};

window.abrirRemoverServidor = async (id) => {
  const fid = Number(id);
  if (!fid) return;
  let nome = 'este servidor';
  const { data } = await sb.from('funcionarios').select('nome').eq('id', fid).maybeSingle();
  if (data?.nome) nome = data.nome;

  $('rem-func-id').value = String(fid);
  $('rem-func-nome').textContent = nome;
  $('rem-tipo-exo').checked = true;
  $('rem-tipo-errado').checked = false;
  $('rem-exo-campos').style.display = '';
  $('rem-data-exo').value = new Date().toISOString().slice(0, 10);
  atualizarCamposRemover();
  openModal('modal-remover-servidor');
};

function atualizarCamposRemover() {
  const exo = $('rem-tipo-exo')?.checked;
  if ($('rem-exo-campos')) $('rem-exo-campos').style.display = exo ? '' : 'none';
  const btn = $('btn-confirmar-remover');
  if (btn) btn.textContent = exo ? 'Confirmar exoneração' : 'Excluir cadastro errado';
}

$('rem-tipo-exo')?.addEventListener('change', atualizarCamposRemover);
$('rem-tipo-errado')?.addEventListener('change', atualizarCamposRemover);

$('btn-confirmar-remover')?.addEventListener('click', async () => {
  const id = Number($('rem-func-id').value);
  const nome = $('rem-func-nome')?.textContent || 'Servidor(a)';
  if (!id) return;

  const tipo = document.querySelector('input[name="rem-tipo"]:checked')?.value;
  const btn = $('btn-confirmar-remover');
  btn.disabled = true;

  try {
    if (tipo === 'exonerado') {
      const dataExo = $('rem-data-exo').value;
      if (!dataExo) {
        showToast('Informe a data da exoneração.', 'warning');
        btn.disabled = false;
        return;
      }
      const { error } = await sb.rpc('fn_exonerar_funcionario', {
        p_funcionario_id: id,
        p_data_exoneracao: dataExo,
        p_motivo: null
      });
      if (error) throw error;
      await registrarLog('EXONERAÇÃO DE SERVIDOR', id, nome, { data_exoneracao: dataExo });
      showToast('Servidor marcado como exonerado.', 'success');
    } else {
      if (!confirm('Confirma exclusão definitiva por cadastro errado? Esta ação não pode ser desfeita.')) {
        btn.disabled = false;
        return;
      }
      const res = await sb.rpc('fn_excluir_funcionario', { p_id: id });
      if (res.error) throw res.error;
      await registrarLog('EXCLUSÃO DE SERVIDOR (CADASTRO ERRADO)', id, nome, {});
      showToast('Cadastro errado excluído.', 'success');
    }
    closeModal('modal-remover-servidor');
    carregarFuncionarios();
    atualizarBadgesSemLotacaoExonerados();
    if (state.rotaAtual === 'sem-lotacao') renderSemLotacao();
    if (state.rotaAtual === 'exonerados') renderExonerados();
  } catch (e) {
    showToast('Erro: ' + (e.message || e), 'error');
  } finally {
    btn.disabled = false;
  }
});

window.abrirModalAddFuncionario = () => {
  window._addFuncionarioOrigemGiap = false;
  $('add-nome').value = '';
  $('add-cpf').value = '';
  $('add-matricula').value = '';
  $('add-admissao').value = '';
  $('add-email').value = '';
  $('add-telefone').value = '';
  $('add-funcao').value = '';
  $('add-ano').value = '';
  if ($('add-outra-secretaria')) $('add-outra-secretaria').checked = false;
  if ($('add-orgao-origem')) $('add-orgao-origem').value = '';
  if ($('add-orgao-origem-wrap')) $('add-orgao-origem-wrap').style.display = 'none';
  popularSelectSimbologia('add-simbologia');
  
  $('add-vinculo').innerHTML = '<option value="">Selecione...</option>' + state.vinculos.map(v => `<option value="${v.id}">${htmlEscape(v.categoria)}</option>`).join('');
  $('add-turno').innerHTML = '<option value="">Selecione...</option>' + state.turnos.map(t => `<option value="${t.id}">${htmlEscape(t.nome)}</option>`).join('');
  
  const lotacoesOrdenadas = [...state.lotacoes].sort((a,b) => a.nome.localeCompare(b.nome));
  $('add-lotacao').innerHTML = '<option value="">Selecione a lotação inicial...</option>' + lotacoesOrdenadas.map(l => `<option value="${l.id}">${htmlEscape(l.nome)}</option>`).join('');
  
  openModal('modal-add-funcionario');
  setTimeout(() => $('add-nome').focus(), 100);
};

async function buscarFuncionarioDuplicado({ nome, cpf, matricula }) {
  const nomeBusca = String(nome || '').trim();
  const cpfBusca = String(cpf || '').trim();
  const matBusca = String(matricula || '').trim();
  const consultas = [];

  if (matBusca) {
    consultas.push(sb.from('funcionarios')
      .select('id, nome, cpf, matricula, ativo')
      .eq('matricula', matBusca)
      .limit(5));
  }
  if (cpfBusca) {
    consultas.push(sb.from('funcionarios')
      .select('id, nome, cpf, matricula, ativo')
      .eq('cpf', cpfBusca)
      .limit(5));
  }
  if (nomeBusca) {
    consultas.push(sb.from('funcionarios')
      .select('id, nome, cpf, matricula, ativo')
      .ilike('nome', sanitizarTermoFiltro(nomeBusca))
      .limit(5));
  }

  const resultados = await Promise.all(consultas);
  const encontrados = new Map();
  for (const resultado of resultados) {
    if (resultado.error) throw resultado.error;
    for (const f of resultado.data || []) encontrados.set(f.id, f);
  }

  return [...encontrados.values()].find((f) =>
    (matBusca && giapMatKey(f.matricula) === giapMatKey(matBusca))
    || (cpfBusca && soDigitos(f.cpf) === soDigitos(cpfBusca))
    || (nomeBusca && giapNormNome(f.nome) === giapNormNome(nomeBusca))
  ) || null;
}

window.addToggleOutraSecretaria = function addToggleOutraSecretaria() {
  const on = !!$('add-outra-secretaria')?.checked;
  const wrap = $('add-orgao-origem-wrap');
  if (wrap) wrap.style.display = on ? '' : 'none';
  if (!on && $('add-orgao-origem')) $('add-orgao-origem').value = '';
};

$('btn-salvar-add').onclick = async () => {
  const nome = $('add-nome').value.trim();
  const lotacaoId = $('add-lotacao').value;
  const vinculoId = $('add-vinculo').value;
  
  if (!nome || !lotacaoId || !vinculoId) {
    return showToast('Nome, Lotação e Vínculo são obrigatórios.', 'warning');
  }

  const outraSec = !!$('add-outra-secretaria')?.checked;
  const orgaoOrigem = ($('add-orgao-origem')?.value || '').trim();
  if (outraSec && !orgaoOrigem) {
    return showToast('Informe o órgão de origem (outra secretaria).', 'warning');
  }

  const cpfVal = $('add-cpf').value.trim();
  const matVal = $('add-matricula').value.trim();
  
  try {
    const d = await buscarFuncionarioDuplicado({
      nome,
      cpf: cpfVal,
      matricula: matVal
    });
    if (d) {
      const identificador = matVal && giapMatKey(d.matricula) === giapMatKey(matVal)
        ? 'matrícula'
        : (giapNormNome(d.nome) === giapNormNome(nome) ? 'nome' : 'CPF');
      return showToast(
        d.ativo === false
          ? `${d.nome} já está cadastrado com o mesmo ${identificador}, mas está INATIVO.`
          : `${d.nome} já está cadastrado com o mesmo ${identificador}.`,
        'error'
      );
    }
  } catch (e) {
    return showToast('Não foi possível verificar duplicidade: ' + (e.message || e), 'error');
  }

  const btn = $('btn-salvar-add');
  btn.disabled = true;

  const funcPayload = {
    nome: nome,
    cpf: $('add-cpf').value.trim() || null,
    matricula: $('add-matricula').value.trim() || null,
    data_admissao: $('add-admissao').value || null,
    email: $('add-email').value.trim() || null,
    telefone: $('add-telefone').value.trim() || null,
    simbologia: $('add-simbologia').value || null,
    ativo: true
  };

  const { data: funcData, error: funcError } = await sb.from('funcionarios').insert([funcPayload]).select('id').single();

  if (funcError) {
    btn.disabled = false;
    return showToast('Erro ao criar servidor: ' + funcError.message, 'error');
  }

  const histPayload = {
    funcionario_id: funcData.id,
    lotacao_id: Number(lotacaoId),
    vinculo_id: Number(vinculoId),
    turno_id: $('add-turno').value ? Number($('add-turno').value) : null,
    funcao: $('add-funcao').value.trim() || null,
    ano_concurso: $('add-ano').value ? Number($('add-ano').value) : null,
    data_inicio: new Date().toISOString().split('T')[0],
    ativo: true,
    observacao: 'Cadastro Inicial'
  };

  const { error: histError } = await sb.from('funcionario_lotacao').insert([histPayload]);

  btn.disabled = false;

  if (histError) {
    return showToast('Servidor criado, mas erro na lotação: ' + histError.message, 'error');
  }

  // Recebido de outra secretaria → menu Cedidos/Recebidos
  if (outraSec) {
    const { error: cedErr } = await sb.from('funcionario_cedencias').insert([{
      funcionario_id: funcData.id,
      tipo: 'RECEBIDO',
      orgao_destino_origem: orgaoOrigem,
      observacao: `CEDIDO DA ${orgaoOrigem.toUpperCase()}`,
      data_inicio: $('add-admissao').value || new Date().toISOString().slice(0, 10),
      ativo: true
    }]);
    if (cedErr) {
      showToast('Servidor criado, mas falhou ao registrar em Cedidos/Recebidos: ' + cedErr.message, 'warning');
    } else {
      await registrarLog('CADASTRO DE CEDÊNCIA', funcData.id, nome, {
        tipo: 'RECEBIDO',
        orgao: orgaoOrigem,
        via: 'adicionar_funcionario'
      });
    }
  }

  await registrarLog('CADASTRO DE SERVIDOR', funcData.id, nome, {
    matricula: funcPayload.matricula,
    lotacao_id: Number(lotacaoId),
    recebido_outra_secretaria: outraSec || false,
    orgao_origem: orgaoOrigem || null
  });
  showToast(
    outraSec
      ? 'Servidor cadastrado e incluído em Cedidos/Recebidos (RECEBIDO).'
      : 'Servidor cadastrado com sucesso!',
    'success'
  );
  closeModal('modal-add-funcionario');
  carregarFuncionarios();
  if (window._addFuncionarioOrigemGiap) {
    giapInvalidarMapaRh();
    await giapCarregarFolhaTabela();
    window._addFuncionarioOrigemGiap = false;
  }
};

window.abrirEdicao = async (id) => {
  const data = await handleErr(await sb.from('v_funcionarios_atual').select('*').eq('funcionario_id', id).limit(1).single(), 'editar');
  if (!data) return;
  // Busca matrícula + admissão + observação + simbologia (não vêm na view)
  const ext = await handleErr(await sb.from('funcionarios').select('matricula, data_admissao, observacao, simbologia').eq('id', id).single(), 'edit extras');
  state.funcionarioAtual = data;
  
  $('edit-id').value = id;
  $('edit-nome').value      = data.nome || '';
  $('edit-cpf').value       = data.cpf ? mascaraCPF(data.cpf) : '';
  $('edit-matricula').value = ext?.matricula || data.matricula || '';
  $('edit-admissao').value  = ext?.data_admissao || '';
  $('edit-email').value     = data.email || '';
  $('edit-telefone').value  = data.telefone ? mascaraTelefone(data.telefone) : '';
  popularSelectSimbologia('edit-simbologia', ext?.simbologia || '');
  $('edit-funcao').value    = data.funcao || '';
  $('edit-ano').value       = data.ano_concurso || '';
  $('edit-obs').value       = ext?.observacao || '';
  carregarRemuneracoesNoEdit(id);

  // Reset da seção "Registrar Afastamento / Licença"
  $('edit-afast-details').open = false;
  $('edit-afast-tipo').value = '';
  $('edit-afast-outro').value = '';
  $('edit-afast-outro-group').style.display = 'none';
  $('edit-afast-inicio').value = '';
  $('edit-afast-fim').value = '';
  $('edit-afast-portaria').value = '';
  $('edit-afast-sei').value = '';
  
  const v = state.vinculos.find(x => x.categoria === data.vinculo);
  $('edit-vinculo').value = v ? v.id : '';
  const t = state.turnos.find(x => x.nome === data.turno);
  $('edit-turno').value = t ? t.id : '';

  // Servidor sem lotação ativa: mostra seletor pra regularizar o cadastro
  const semLotacao = data.lotacao_atual_id == null;
  $('edit-lotacao-group').style.display = semLotacao ? '' : 'none';
  if (semLotacao) {
    const ords = [...state.lotacoes].sort((a,b) => a.nome.localeCompare(b.nome));
    $('edit-lotacao').innerHTML = '<option value="">Selecione a lotação...</option>' +
      ords.map(l => `<option value="${l.id}">${htmlEscape(l.nome)}</option>`).join('');
  }

  openModal('modal-edit');
  setTimeout(() => $('edit-nome').focus(), 100);
};

$('btn-salvar-edit').onclick = async () => {
  const btn = $('btn-salvar-edit');
  const id = Number($('edit-id').value);
  const semLotacao = state.funcionarioAtual?.lotacao_atual_id == null;
  if (semLotacao && !$('edit-lotacao').value) {
    showToast('Selecione a lotação para regularizar o cadastro.', 'warning');
    return;
  }
  btn.disabled = true;

  const r1 = await sb.rpc('fn_editar_funcionario', {
    p_funcionario_id: id,
    p_nome:      $('edit-nome').value.trim() || null,
    p_cpf:       $('edit-cpf').value.trim() || null,
    p_matricula: $('edit-matricula').value.trim() || null,
    p_email:     $('edit-email').value.trim() || null,
    p_telefone:  $('edit-telefone').value.trim() || null,
  });
  // data_admissao / observacao / simbologia não estão na RPC — atualiza direto.
  // Campos deixados em branco também: a RPC ignora nulos, então não apaga valores — limpa direto na tabela
  const diretos = {
    data_admissao: $('edit-admissao').value || null,
    observacao: $('edit-obs').value.trim() || null,
    simbologia: $('edit-simbologia').value || null
  };
  if (!$('edit-cpf').value.trim())       diretos.cpf = null;
  if (!$('edit-matricula').value.trim()) diretos.matricula = null;
  if (!$('edit-email').value.trim())     diretos.email = null;
  if (!$('edit-telefone').value.trim())  diretos.telefone = null;
  const r1b = await sb.from('funcionarios').update(diretos).eq('id', id);
  let r2b = { error: null };
  if (!semLotacao) {
    const limposLot = {};
    if (!$('edit-funcao').value.trim()) limposLot.funcao = null;
    if (!$('edit-vinculo').value)       limposLot.vinculo_id = null;
    if (!$('edit-turno').value)         limposLot.turno_id = null;
    if (!$('edit-ano').value)           limposLot.ano_concurso = null;
    if (Object.keys(limposLot).length) {
      r2b = await sb.from('funcionario_lotacao').update(limposLot).eq('funcionario_id', id).eq('ativo', true);
    }
  }
  let r2;
  if (semLotacao) {
    // Sem registro ativo em funcionario_lotacao: cria um pra regularizar
    r2 = await sb.from('funcionario_lotacao').insert([{
      funcionario_id: id,
      lotacao_id:   Number($('edit-lotacao').value),
      vinculo_id:   $('edit-vinculo').value ? Number($('edit-vinculo').value) : null,
      turno_id:     $('edit-turno').value   ? Number($('edit-turno').value)   : null,
      funcao:       $('edit-funcao').value.trim() || null,
      ano_concurso: $('edit-ano').value     ? Number($('edit-ano').value)     : null,
      data_inicio:  new Date().toISOString().slice(0, 10),
      ativo: true,
      observacao: 'Regularização de lotação via edição de cadastro'
    }]);
  } else {
    r2 = await sb.rpc('fn_editar_lotacao_atual', {
      p_funcionario_id: id,
      p_funcao:        $('edit-funcao').value.trim() || null,
      p_vinculo_id:    $('edit-vinculo').value ? Number($('edit-vinculo').value) : null,
      p_turno_id:      $('edit-turno').value   ? Number($('edit-turno').value)   : null,
      p_ano_concurso:  $('edit-ano').value     ? Number($('edit-ano').value)     : null,
    });
  }
  btn.disabled = false;
  
  if (r1.error || r1b.error || r2.error || r2b.error) {
    showToast('Erro ao salvar: ' + (r1.error?.message || r1b.error?.message || r2.error?.message || r2b.error?.message), 'error');
    return;
  }
  await registrarLog('EDIÇÃO DE SERVIDOR', id, $('edit-nome').value.trim() || 'Servidor(a)', {
    matricula: $('edit-matricula').value.trim() || null,
    regularizou_lotacao: semLotacao
  });
  showToast('Alterações salvas com sucesso', 'success');
  closeModal('modal-edit');
  carregarFuncionarios();
};

// ── Helper compartilhado: registra afastamento (status) mantendo a lotação original ──
async function salvarAfastamento({ funcId, nome, tipo, inicio, fim, portaria, sei, obs }) {
  const payload = {
    funcionario_id: Number(funcId),
    tipo_afastamento: tipo,
    data_inicial: inicio || null,
    data_final: fim || null,
    portaria: portaria || null,
    num_sei: sei || null,
    observacao: obs || null,
    ativo: true
  };
  const { error } = await sb.from('funcionario_licencas').insert([payload]);
  if (error) return { ok: false, msg: 'Erro ao salvar licença: ' + error.message };

  // Licença é apenas status: o servidor permanece na lotação original e passa a aparecer em Licenças
  await registrarLog('AFASTAMENTO / LICENÇA', Number(funcId), nome || 'Servidor(a)', { tipo });
  return { ok: true, aviso: '' };
}

// Toggle do campo "Especificar (Outros)"
$('edit-afast-tipo').addEventListener('change', () => {
  $('edit-afast-outro-group').style.display = $('edit-afast-tipo').value === 'Outros' ? '' : 'none';
});

$('btn-edit-afastar').onclick = async () => {
  const id = Number($('edit-id').value);
  if (!id) return;
  let tipo = $('edit-afast-tipo').value;
  if (!tipo) return showToast('Selecione o tipo de afastamento.', 'warning');
  if (tipo === 'Outros') {
    const esp = $('edit-afast-outro').value.trim();
    if (!esp) return showToast('Especifique o tipo de afastamento (opção Outros).', 'warning');
    tipo = esp;
  }
  if (!$('edit-afast-inicio').value) return showToast('Informe a data inicial do afastamento.', 'warning');
  if (!confirm(`Registrar afastamento de ${state.funcionarioAtual?.nome || 'servidor'}? Ele permanece na lotação atual e passa a constar em Licenças.`)) return;

  const btn = $('btn-edit-afastar');
  btn.disabled = true;
  const res = await salvarAfastamento({
    funcId: id,
    nome: state.funcionarioAtual?.nome,
    tipo,
    inicio: $('edit-afast-inicio').value,
    fim: $('edit-afast-fim').value,
    portaria: $('edit-afast-portaria').value,
    sei: $('edit-afast-sei').value,
    obs: null
  });
  btn.disabled = false;
  if (!res.ok) return showToast(res.msg, 'error');
  showToast('Afastamento registrado! O servidor permanece na lotação original e consta em Licenças.', 'success');
  closeModal('modal-edit');
  carregarFuncionarios();
  location.hash = '#licencas';
};

// ╔══════════════════════════════════════════════════════════════╗
// ║                    MODAL TRANSFERÊNCIA                        ║
// ╚══════════════════════════════════════════════════════════════╝

/** Carrega a mesma árvore usada em Gestão de Lotações (fn_organograma_completo). */
async function carregarLotacoesParaArvore() {
  const org = await handleErr(await sb.rpc('fn_organograma_completo'), 'organograma lotacoes');
  if (org?.length) {
    state.lotacoes = org.map(l => ({
      id: l.id,
      nome: l.nome,
      parent_id: l.parent_id,
      tipo: l.tipo,
      ativo: true,
      marcador: l.marcador || null,
      funcionarios_direto: l.funcionarios_direto ?? 0,
      funcionarios_total: l.funcionarios_total ?? 0,
    }));
    return state.lotacoes;
  }
  const { data } = await sb.from('v_lotacoes_com_count').select('*').range(0, 9999).order('nome');
  state.lotacoes = (data || []).filter(l => l.ativo !== false);
  return state.lotacoes;
}

window.abrirTransferencia = async (id, { fromLicencas = false, fromSemLotacao = false } = {}) => {
  state._trfFromLicencas = !!fromLicencas;
  state._trfFromSemLotacao = !!fromSemLotacao;
  const permiteSemLot = fromLicencas || fromSemLotacao;

  let data = await handleErr(
    await sb.from('v_funcionarios_atual').select('*').eq('funcionario_id', id).limit(1).maybeSingle(),
    'transfer'
  );
  // Sem lotação: pode não aparecer em v_funcionarios_atual — monta a partir do cadastro
  if (!data && permiteSemLot) {
    const { data: f } = await sb.from('funcionarios')
      .select('id, nome, matricula, data_admissao')
      .eq('id', id)
      .maybeSingle();
    if (!f) {
      state._trfFromLicencas = false;
      state._trfFromSemLotacao = false;
      return showToast('Servidor não encontrado.', 'error');
    }
    data = {
      funcionario_id: f.id,
      nome: f.nome,
      matricula: f.matricula,
      lotacao_atual_id: null,
      lotacao_id: null,
      lotacao_nome: null,
      caminho_lotacao: null,
      vinculo: null,
      funcao: null,
      turno: null
    };
  }
  if (!data) {
    state._trfFromLicencas = false;
    state._trfFromSemLotacao = false;
    return;
  }
  if (data.lotacao_atual_id == null && !permiteSemLot) {
    showToast('Este servidor não possui lotação ativa registrada. Use o botão "Editar" para regularizar a lotação antes de transferir.', 'warning');
    return;
  }
  state.funcionarioAtual = data;

  if (!state.lotacoes?.length || permiteSemLot) {
    await carregarLotacoesParaArvore();
  }

  $('trf-id').value = id;
  const lotAtualLbl = data.caminho_lotacao || data.lotacao_nome
    || (fromSemLotacao ? 'Sem lotação' : (fromLicencas ? 'Pendente de definição' : '—'));
  $('trf-servidor-info').innerHTML = `
    <strong>${htmlEscape(data.nome)}</strong><br>
    <small>Vínculo: <strong>${htmlEscape(data.vinculo || '—')}</strong> · Função: <strong>${htmlEscape(data.funcao || '—')}</strong></small><br>
    <small>Lotação atual: ${htmlEscape(lotAtualLbl)}</small>`;
  $('trf-data').value = new Date().toISOString().slice(0, 10);
  $('trf-motivo').value = fromSemLotacao
    ? 'Alocação inicial (servidor sem lotação)'
    : (fromLicencas ? 'Definição de lotação original (servidor em licença)' : '');
  $('trf-lotacao-id').value = '';
  $('trf-funcao').value = '';
  $('trf-alterar').checked = false;
  $('trf-extras').style.display = 'none';
  $('trf-search').value = '';
  const title = document.querySelector('#modal-transfer .modal-title');
  if (title) {
    title.textContent = fromSemLotacao
      ? 'Alocar em Lotação'
      : (fromLicencas ? 'Definir Lotação Original' : 'Transferir Servidor');
  }
  const lotAtualId = data.lotacao_atual_id ?? data.lotacao_id ?? null;
  renderArvoreTransfer(lotAtualId);

  openModal('modal-transfer');
};

function renderArvoreTransfer(lotacaoAtualId) {
  const q = $('trf-search').value.toLowerCase().trim();
  const byId = Object.fromEntries(state.lotacoes.map(l => [l.id, { ...l, filhos: [] }]));
  const raizes = [];
  for (const l of Object.values(byId)) {
    if (l.parent_id && byId[l.parent_id]) byId[l.parent_id].filhos.push(l);
    else raizes.push(l);
  }
  Object.values(byId).forEach(l => l.filhos.sort((a,b) => a.nome.localeCompare(b.nome)));
  const secoes = classificarNiveisSemcas(raizes);

  function matches(l) {
    if (!q) return true;
    if (l.nome.toLowerCase().includes(q)) return true;
    return l.filhos.some(matches);
  }
  function render(l, depth) {
    if (!matches(l)) return '';
    const isCurrent = l.id == lotacaoAtualId;
    const isLicEsp = state._trfFromLicencas && isLotacaoLicencasEsp(l.nome);
    const blocked = isCurrent || isLicEsp;
    const dis = blocked ? 'opacity:0.4;cursor:not-allowed' : '';
    return `<div class="lotacao-tree-item" data-id="${l.id}" style="padding-left:${8 + depth*16}px;${dis}">
              <span style="font-size:9px">${l.tipo}</span>
              ${htmlEscape(l.nome)}
              ${isCurrent ? '<small>(atual)</small>' : ''}
              ${isLicEsp && !isCurrent ? '<small>(inválida para definição)</small>' : ''}
            </div>` + l.filhos.map(c => render(c, depth+1)).join('');
  }
  $('trf-tree').innerHTML = secoes
    .filter(s => s.itens.some(matches))
    .map(s => `
      <div class="org-nivel-header" style="${ORG_NIVEL_HEADER_STYLE};font-size:11px;margin:10px 4px 4px">${htmlEscape(s.titulo)}</div>
      ${s.itens.map(r => render(r, 0)).join('')}`)
    .join('');
  $$('#trf-tree .lotacao-tree-item').forEach(el => {
    const lot = state.lotacoes.find(x => String(x.id) === String(el.dataset.id));
    if (el.dataset.id == lotacaoAtualId) return;
    if (state._trfFromLicencas && isLotacaoLicencasEsp(lot?.nome)) return;
    el.onclick = () => {
      $('trf-lotacao-id').value = el.dataset.id;
      $$('#trf-tree .lotacao-tree-item').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    };
  });
}
$('trf-alterar').addEventListener('change', e => {
  $('trf-extras').style.display = e.target.checked ? 'grid' : 'none';
});
$('trf-search').addEventListener('input', debounce(() => {
  const fid = state.funcionarioAtual?.lotacao_atual_id ?? state.funcionarioAtual?.lotacao_id ?? null;
  renderArvoreTransfer(fid);
}, 200));

$('btn-confirmar-trf').onclick = async () => {
  const btn = $('btn-confirmar-trf');
  const id = Number($('trf-id').value);
  const novaLot = Number($('trf-lotacao-id').value);
  if (!novaLot) { showToast('Selecione a nova lotação', 'warning'); return; }

  const veioDeLicencas = !!state._trfFromLicencas;
  const veioDeSemLotacao = !!state._trfFromSemLotacao;
  const semLotacao = state.funcionarioAtual?.lotacao_atual_id == null;
  const motivo = $('trf-motivo').value.trim() || null;

  btn.disabled = true;
  let error = null;

  if ((veioDeLicencas || veioDeSemLotacao) && semLotacao) {
    // Sem registro ativo: cria lotação (Sem Lotação ou Licenças)
    const vinc = state.vinculos.find(x => x.categoria === state.funcionarioAtual?.vinculo);
    const turn = state.turnos.find(x => x.nome === state.funcionarioAtual?.turno);
    const r = await sb.from('funcionario_lotacao').insert([{
      funcionario_id: id,
      lotacao_id: novaLot,
      vinculo_id: vinc?.id ?? null,
      turno_id: turn?.id ?? null,
      funcao: state.funcionarioAtual?.funcao || null,
      data_inicio: $('trf-data').value || new Date().toISOString().slice(0, 10),
      ativo: true,
      observacao: motivo || (veioDeSemLotacao
        ? `Alocado em ${( $('trf-data').value || new Date().toISOString().slice(0, 10) ).split('-').reverse().join('/')} a partir de Sem Lotação`
        : 'Definição de lotação original (servidor em licença)')
    }]);
    error = r.error;
  } else {
    const params = {
      p_funcionario_id:  id,
      p_nova_lotacao_id: novaLot,
      p_data:    $('trf-data').value || null,
      p_motivo:  motivo,
    };
    if ($('trf-alterar').checked) {
      params.p_nova_funcao       = $('trf-funcao').value.trim() || null;
      params.p_novo_turno_id     = $('trf-turno').value   ? Number($('trf-turno').value)   : null;
      params.p_novo_vinculo_id   = $('trf-vinculo').value ? Number($('trf-vinculo').value) : null;
    }
    const r = await sb.rpc('fn_transferir_funcionario', params);
    error = r.error;
  }
  btn.disabled = false;
  if (error) { showToast('Erro: ' + error.message, 'error'); return; }

  await registrarLog(
    veioDeSemLotacao
      ? 'ALOCAÇÃO (SEM LOTAÇÃO)'
      : (veioDeLicencas ? 'DEFINIÇÃO DE LOTAÇÃO (LICENÇA)' : 'TRANSFERÊNCIA'),
    id,
    state.funcionarioAtual?.nome || 'Servidor(a)',
    { nova_lot_id: novaLot, motivo }
  );
  state._trfFromLicencas = false;
  state._trfFromSemLotacao = false;
  showToast(
    veioDeSemLotacao
      ? 'Lotação definida com sucesso!'
      : (veioDeLicencas
        ? 'Lotação definida! O servidor permanece em Licenças (status).'
        : 'Transferência registrada com sucesso'),
    'success'
  );
  closeModal('modal-transfer');
  carregarFuncionarios();
  if (veioDeLicencas || state.rotaAtual === 'licencas') carregarTabelaLicencas();
  if (veioDeSemLotacao || semLotacao || state.rotaAtual === 'sem-lotacao') {
    atualizarBadgesSemLotacaoExonerados();
    if (state.rotaAtual === 'sem-lotacao') renderSemLotacao();
  }
};

window.abrirHistoricoDoTransfer = () => {
  if (state.funcionarioAtual) verHistorico(state.funcionarioAtual.funcionario_id);
};

// ╔══════════════════════════════════════════════════════════════╗
// ║                     MODAL HISTÓRICO                           ║
// ╚══════════════════════════════════════════════════════════════╝
window.verHistorico = async (id) => {
  openModal('modal-historico');
  $('hist-content').innerHTML = '<span class="spinner"></span> Carregando…';
  const data = await handleErr(await sb.from('v_funcionario_historico')
    .select('*').eq('funcionario_id', id).order('data_inicio', { ascending: false }), 'histórico');
  if (!data || data.length === 0) {
    $('hist-content').innerHTML = '<div class="empty-state">Sem histórico</div>';
    return;
  }
  const nome = data[0].funcionario_nome;
  $('hist-content').innerHTML = `
    <h4 style="color:var(--gov-blue-dark);margin-bottom:14px">${htmlEscape(nome)}</h4>
    <ul class="timeline">
      ${(() => {
        const temAtiva = data.some((h) => h.lotacao_ativa);
        const ultima = data[0];
        let extra = '';
        if (!temAtiva && ultima?.data_fim) {
          const desde = new Date(ultima.data_fim + 'T00:00:00').toLocaleDateString('pt-BR');
          extra = `<li class="inactive" style="border-left-color:var(--gov-orange)">
            <div class="periodo"><strong>ATUAL</strong> · desde ${desde}</div>
            <div class="lot-nome" style="color:var(--gov-orange)"><i class="ti ti-map-off"></i> Sem Lotação</div>
            <div class="meta">Aguardando alocação · última lotação: ${htmlEscape(ultima.lotacao_nome || '—')}</div>
          </li>`;
        }
        return extra + data.map(h => `
        <li class="${h.lotacao_ativa ? '' : 'inactive'}">
          <div class="periodo">
            ${new Date(h.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR')} —
            ${h.data_fim ? new Date(h.data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : '<strong>ATUAL</strong>'}
            · ${Math.max(0, h.dias_na_lotacao)} dias
            ${h.data_fim && !h.lotacao_ativa ? ` · <span style="color:var(--gov-orange)">saiu em ${new Date(h.data_fim + 'T00:00:00').toLocaleDateString('pt-BR')}</span>` : ''}
          </div>
          <div class="lot-nome">
            ${htmlEscape(h.lotacao_nome)}
            <span style="margin-left:6px; color:var(--color-text-muted); font-size:12px;">(${htmlEscape(h.vinculo || '-')})</span>
          </div>
          <div class="meta">${htmlEscape(h.funcao || '—')} · ${htmlEscape(h.turno || '—')}</div>
          ${h.observacao ? `<div class="meta" style="font-style:italic">${htmlEscape(h.observacao)}</div>` : ''}
        </li>`).join('');
      })()}
    </ul>`;
};

// Boot do app é disparado após login (bootApp em AUTENTICAÇÃO)

// ╔══════════════════════════════════════════════════════════════╗
// ║                     FOLHA DE PONTO                           ║
// ╚══════════════════════════════════════════════════════════════╝
let _fpServidores = [];
let _fpInited = false;
const _fpHolCfg = { nac: true, est: true, mun: true, custom: [] };

async function renderFolhaPonto() {
  const now = new Date();

  // Inicializa selects de Mês/Ano (apenas uma vez)
  const selMes = $('fp-mes');
  const selAno = $('fp-ano');
  if (selMes && selMes.options.length === 0) {
    ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
      .forEach((m, i) => {
        selMes.innerHTML += `<option value="${String(i+1).padStart(2,'0')}" ${i===now.getMonth()?'selected':''}>${m}</option>`;
      });
  }
  if (selAno && selAno.options.length === 0) {
    for (let y = now.getFullYear()-1; y <= now.getFullYear()+2; y++)
      selAno.innerHTML += `<option value="${y}" ${y===now.getFullYear()?'selected':''}>${y}</option>`;
  }
  const ferAno = $('fp-fer-ano');
  if (ferAno && ferAno.options.length === 0) {
    for (let y = now.getFullYear()-1; y <= now.getFullYear()+2; y++)
      ferAno.innerHTML += `<option value="${y}" ${y===now.getFullYear()?'selected':''}>${y}</option>`;
  }

  // Registra checkboxes de feriado (uma vez)
  if (!_fpInited) {
    _fpInited = true;
    const chkN = $('fp-chk-nac'), chkE = $('fp-chk-est'), chkM = $('fp-chk-mun');
    if (chkN) chkN.onchange = () => { _fpHolCfg.nac = chkN.checked; fpRenderFeriados(); fpPopularDias(); };
    if (chkE) chkE.onchange = () => { _fpHolCfg.est = chkE.checked; fpRenderFeriados(); fpPopularDias(); };
    if (chkM) chkM.onchange = () => { _fpHolCfg.mun = chkM.checked; fpRenderFeriados(); fpPopularDias(); };
    sb.from('feriados').select('*').eq('ativo', true).then(res => {
      if (res.data) {
        _fpHolCfg.custom = res.data.map(d => ({ id: d.id, date: d.data, nome: d.nome }));
        fpRenderFeriados();
        fpPopularDias();
      }
    });
  }

  // Carrega servidores do Supabase (uma vez)
  if (_fpServidores.length === 0) {
    const sel = $('fp-servidor-select');
    if (sel) sel.innerHTML = '<option value="">Carregando&#8230;</option>';
    const { data, error } = await fetchTudo('v_funcionarios_atual', 'funcionario_id, nome, funcao, matricula, vinculo, lotacao_nome', 'nome');
    if (!error && data && data.length > 0) {
      _fpServidores = data;
    } else {
      // fallback via RPC
      const r = await sb.rpc('fn_buscar_funcionarios', {
        p_termo: null, p_vinculo_id: null, p_lotacao_id: null,
        p_funcao: null, p_turno_id: null,
        p_limite: 9999, p_offset: 0, p_order_by: 'nome', p_order_dir: 'asc'
      });
      _fpServidores = r.data || [];
    }
  // Filtra apenas vínculos permitidos (Efetivo, Comissionado, Serviço Prestado)
    const vincPermitidos = d => {
      const v = (d.vinculo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      return v.includes('efetivo') || v.includes('comission') ||
             v.includes('servico prestado') || v.includes('servico pres') ||
             v.includes('prestado') || v.includes('ps ');
    };
    _fpServidores = _fpServidores.filter(vincPermitidos);

    const sel2 = $('fp-servidor-select');
    if (sel2) {
      sel2.innerHTML = '<option value="">— Selecione o servidor —</option>' +
        _fpServidores.map(s =>
          `<option value="${s.funcionario_id}">${htmlEscape(s.nome)} <small>(${s.vinculo || ''})</small></option>`
        ).join('');
    }
  }

  fpRenderFeriados();

  // Adiciona listener no select de servidor (gera folha ao trocar)
  const selSrv = $('fp-servidor-select');
  if (selSrv && !selSrv._fpListenerOk) {
    selSrv._fpListenerOk = true;
    selSrv.addEventListener('change', fpPreencherServidor);
  }

  // Listeners de mês/ano (individual)
  const selM = $('fp-mes'), selA = $('fp-ano');
  if (selM && !selM._fpListenerOk) { selM._fpListenerOk = true; selM.addEventListener('change', fpPopularDias); }
  if (selA && !selA._fpListenerOk) { selA._fpListenerOk = true; selA.addEventListener('change', fpPopularDias); }

  // Listener feriados ano
  const ferA = $('fp-fer-ano');
  if (ferA && !ferA._fpListenerOk) { ferA._fpListenerOk = true; ferA.addEventListener('change', fpRenderFeriados); }

  // Pré-seleciona Jurandy se disponível
  const jurandy = _fpServidores.find(s =>
    (s.nome || '').toUpperCase().includes('JURANDY')
  );
  if (jurandy) {
    $('fp-servidor-select').value = jurandy.funcionario_id;
  }
  fpPreencherServidor();
}

function fpPreencherServidor() {
  const sel = $('fp-servidor-select');
  const id  = sel ? Number(sel.value) : null;
  const srv = _fpServidores.find(s =>
    s.funcionario_id === id || s.funcionario_id == id
  );

  if (srv) {
    $('fp-inp-nome').value    = srv.nome      || '';
    $('fp-inp-mat').value     = srv.matricula || '';
    $('fp-inp-vinculo').value = srv.vinculo   || '';

    // Regra de negócio: Jurandy → Cargo e Unidade específicos
    const nomeUp = (srv.nome || '').toUpperCase();
    if (nomeUp.includes('JURANDY')) {
      $('fp-inp-cargo').value   = 'Chefe de Serviço - Patrimônio';
      $('fp-inp-unidade').value = 'Coordenação de Administração e Patrimônio';
    } else {
      $('fp-inp-cargo').value   = srv.funcao      || '';
      $('fp-inp-unidade').value = srv.lotacao_nome || '';
    }
  } else {
    // Limpa campos se nada selecionado
    ['fp-inp-nome','fp-inp-mat','fp-inp-cargo','fp-inp-vinculo','fp-inp-unidade']
      .forEach(id => { const el = $(id); if (el) el.value = ''; });
  }
  fpPopularDias();
}

function fpPopularDias() {
  const tbody = $('fp-days-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  const mm = $('fp-mes')?.value  || String(new Date().getMonth()+1).padStart(2,'0');
  const aa = $('fp-ano')?.value  || String(new Date().getFullYear());
  const diasNoMes = new Date(Number(aa), Number(mm), 0).getDate();
  const labelMes  = $('fp-label-mesano');
  if (labelMes) labelMes.textContent = `${mm}/${aa}`;

  const ferList = fpGetHolidays(parseInt(aa));
  const ferMap  = new Map(ferList.map(h => [h.date, h.nome]));

  for (let i = 1; i <= 31; i++) {
    const tr = document.createElement('tr');
    tr.className = 'fp-dia';

    if (i <= diasNoMes) {
      const dt  = new Date(Number(aa), Number(mm)-1, i);
      const dow = dt.getDay();
      const iso = `${aa}-${String(mm).padStart(2,'0')}-${String(i).padStart(2,'0')}`;

      if (ferMap.has(iso)) {
        tr.innerHTML =
          `<td style="text-align:center;font-weight:bold">${i}</td>` +
          `<td colspan="9" style="text-align:center;background:#ffe4e6;color:#991b1b;font-weight:bold;font-size:9px">` +
          `FERIADO &#8226; ${htmlEscape(ferMap.get(iso))}</td>`;
      } else if (dow === 0 || dow === 6) {
        const txt = dow === 6 ? 'SÁBADO' : 'DOMINGO';
        tr.innerHTML =
          `<td style="text-align:center;font-weight:bold">${i}</td>` +
          `<td colspan="9" style="text-align:center;background:#e5e7eb;color:#374151;font-weight:bold;font-size:9px;letter-spacing:1px">${txt}</td>`;
      } else {
        tr.innerHTML =
          `<td style="text-align:center;font-weight:bold">${i}</td>` +
          `<td contenteditable="true"></td><td contenteditable="true"></td>` +
          `<td contenteditable="true"></td><td contenteditable="true"></td>` +
          `<td contenteditable="true"></td><td contenteditable="true"></td>` +
          `<td contenteditable="true"></td><td contenteditable="true"></td>` +
          `<td contenteditable="true" style="font-size:9px"></td>`;
      }
    } else {
      tr.innerHTML =
        `<td style="text-align:center;color:#bbb">—</td>` +
        `<td colspan="9" style="background:#d1d5db"></td>`;
    }
    tbody.appendChild(tr);
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => fpAjustarAlturaDias());
  });
}

/** Ajusta as 31 linhas para caber só na área da grade (assinaturas ficam intactas). */
function fpAjustarAlturaDias(root = document) {
  const pages = root.querySelectorAll ? root.querySelectorAll('.page-fp') : [];
  const list = pages.length ? [...pages] : ($('fp-paper') ? [$('fp-paper')] : []);
  list.forEach(page => {
    const wrap = page.querySelector('.fp-grade-wrap');
    const grade = page.querySelector('.fp-grade');
    const tbody = grade?.querySelector('tbody');
    const rows = tbody?.querySelectorAll('tr.fp-dia');
    const thead = grade?.querySelector('thead');
    if (!wrap || !grade || !tbody || !rows?.length) return;

    // Limpa alturas anteriores para medir o espaço real do wrap
    rows.forEach(tr => {
      tr.style.height = '';
      tr.querySelectorAll('td').forEach(td => { td.style.height = ''; });
    });

    const wrapH = wrap.clientHeight;
    const theadH = thead?.offsetHeight || 0;
    const disponivel = Math.max(0, wrapH - theadH - 1);
    const h = Math.max(12, Math.floor(disponivel / rows.length));

    rows.forEach(tr => {
      tr.style.height = h + 'px';
      tr.querySelectorAll('td').forEach(td => { td.style.height = h + 'px'; });
    });
  });
}

function fpSwitchTab(tab, btn) {
  $$('.fp-tab-pane').forEach(el => el.classList.remove('active'));
  $$('.fp-tab-btn').forEach(el  => el.classList.remove('active'));
  $(`fp-tab-${tab}`)?.classList.add('active');
  btn.classList.add('active');
  if (tab === 'feriados') fpRenderFeriados();
  if (tab === 'unidade')  fpIniciarAbaUnidade();
}

function fpImprimir() {
  fpPopularDias();
  fpAjustarAlturaDias();
  setTimeout(() => {
    fpAjustarAlturaDias();
    window.print();
  }, 150);
}

// --- Feriados ---
function fpGetHolidays(year) {
  const out = [];
  if (_fpHolCfg.nac) out.push(...fpFerNacionais(year));
  if (_fpHolCfg.est) out.push(...fpFerEstaduais(year));
  if (_fpHolCfg.mun) out.push(...fpFerMunicipais(year));
  (_fpHolCfg.custom || []).forEach(c => out.push({ id: c.id, date: c.date, nome: c.nome, tipo: 'Personalizado' }));
  return out;
}

function fpFerNacionais(year) {
  const fixed = [
    ['01-01','Confraternização Universal'],['04-21','Tiradentes'],
    ['05-01','Dia do Trabalhador'],['09-07','Independência do Brasil'],
    ['10-12','N. Sra. Aparecida'],['11-02','Finados'],
    ['11-15','Proclamação da República'],['12-25','Natal']
  ].map(([md,n]) => ({ date: `${year}-${md}`, nome: n, tipo: 'Nacional' }));
  const E = fpEaster(year);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const add = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
  return [...fixed,
    { date: iso(add(E,-47)), nome: 'Carnaval',          tipo: 'Nacional' },
    { date: iso(add(E,-2)),  nome: 'Sexta-feira Santa', tipo: 'Nacional' },
    { date: iso(E),          nome: 'Páscoa',             tipo: 'Nacional' },
    { date: iso(add(E,60)),  nome: 'Corpus Christi',     tipo: 'Nacional' },
  ];
}
function fpFerEstaduais(year) {
  return [{ date:`${year}-07-28`, nome:'Adesão do MA à Independência', tipo:'Estadual (MA)' }];
}
function fpFerMunicipais(year) {
  return [{ date:`${year}-09-08`, nome:'Aniversário de São Luís', tipo:'Municipal' }];
}
function fpEaster(Y) {
  const a=Y%19,b=Math.floor(Y/100),c=Y%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4;
  const L=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*L)/451);
  return new Date(Y,Math.floor((h+L-7*m+114)/31)-1,((h+L-7*m+114)%31)+1);
}

function fpRenderFeriados() {
  const ano  = parseInt($('fp-fer-ano')?.value || new Date().getFullYear());
  const list = fpGetHolidays(ano);
  const cont = $('fp-feriados-lista');
  if (!cont) return;
  if (!list.length) {
    cont.innerHTML = '<div style="color:var(--color-text-muted);font-size:13px;padding:8px">Nenhum feriado ativo.</div>';
    return;
  }
  cont.innerHTML = list
    .sort((a,b) => a.date.localeCompare(b.date))
    .map(h => `
      <div style="display:flex;gap:8px;padding:5px 4px;border-bottom:1px solid var(--gov-border);font-size:12px;align-items:center">
        <span style="min-width:72px;color:var(--color-text-muted)">${new Date(h.date+'T00:00:00').toLocaleDateString('pt-BR')}</span>
        <span style="flex:1;font-weight:600">${htmlEscape(h.nome)}</span>
        <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:#f1f3f5;color:#555">${h.tipo}</span>
        ${h.id ? `<button onclick="fpDelFeriado(${h.id})" style="color:var(--gov-red);background:none;border:none;cursor:pointer"><i class="ti ti-trash"></i></button>` : ''}
      </div>`
    ).join('');
}

async function fpAddFeriado() {
  const dt   = $('fp-fer-data')?.value;
  const nome = $('fp-fer-nome')?.value?.trim();
  if (!dt || !nome) { showToast('Informe data e nome do feriado', 'warning'); return; }
  const { data, error } = await sb.from('feriados').insert([{ data: dt, nome, tipo: 'Personalizado' }]).select().single();
  if (error) { showToast('Erro ao salvar feriado', 'error'); return; }
  _fpHolCfg.custom = _fpHolCfg.custom || [];
  _fpHolCfg.custom.push({ id: data.id, date: data.data, nome: data.nome });
  $('fp-fer-data').value = '';
  $('fp-fer-nome').value = '';
  fpRenderFeriados();
  fpPopularDias();
  await registrarLog('CADASTRO DE FERIADO', null, nome, { data: dt });
  showToast('Feriado personalizado adicionado!', 'success');
}

window.fpDelFeriado = async (id) => {
  const feriado = (_fpHolCfg.custom || []).find(c => c.id === id);
  const { error } = await sb.from('feriados').delete().eq('id', id);
  if (error) { showToast('Erro ao remover feriado', 'error'); return; }
  _fpHolCfg.custom = _fpHolCfg.custom.filter(c => c.id !== id);
  fpRenderFeriados();
  fpPopularDias();
  await registrarLog('EXCLUSÃO DE FERIADO', null, feriado?.nome || `Feriado ID ${id}`, { feriado_id: id });
  showToast('Feriado removido', 'info');
};

// ── Expor funções ao window (necessário pois o script é um ES module) ──────────
// Inline handlers (onclick/onchange no HTML) não enxergam escopo de módulo.
window.fpSwitchTab         = fpSwitchTab;
window.fpImprimir          = fpImprimir;
window.fpAddFeriado        = fpAddFeriado;
window.fpPreencherServidor = fpPreencherServidor;
window.fpPopularDias       = fpPopularDias;
window.fpRenderFeriados    = fpRenderFeriados;
window.fpImprimirUnidade   = fpImprimirUnidade;

// ── Aba Por Unidade ────────────────────────────────────────────────────────────
function fpIniciarAbaUnidade() {
  // Popula selects de mês/ano para a aba unidade (se ainda não preenchidos)
  const now  = new Date();
  const undM = $('fp-und-mes');
  const undA = $('fp-und-ano');
  if (undM && undM.options.length === 0) {
    ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
      .forEach((m, i) => {
        undM.innerHTML += `<option value="${String(i+1).padStart(2,'0')}" ${i===now.getMonth()?'selected':''}>${m}</option>`;
      });
  }
  if (undA && undA.options.length === 0) {
    for (let y = now.getFullYear()-1; y <= now.getFullYear()+2; y++)
      undA.innerHTML += `<option value="${y}" ${y===now.getFullYear()?'selected':''}>${y}</option>`;
  }

  // Popula select de unidades (lotacao_nome únicas)
  const sel = $('fp-unidade-select');
  if (sel && _fpServidores.length > 0) {
    const unidades = [...new Set(
      _fpServidores
        .map(s => (s.lotacao_nome || '').trim())
        .filter(Boolean)
    )].sort();
    sel.innerHTML = '<option value="">— Selecione a unidade —</option>' +
      unidades.map(u => `<option value="${htmlEscape(u)}">${htmlEscape(u)}</option>`).join('');
    // Listener para atualizar contagem de servidores
    if (!sel._fpUndListenerOk) {
      sel._fpUndListenerOk = true;
      sel.addEventListener('change', () => {
        const unit = sel.value;
        const prev = $('fp-und-preview');
        if (!unit || !prev) return;
        const lista = _fpServidores.filter(s => (s.lotacao_nome||'').trim() === unit);
        prev.innerHTML = lista.length === 0
          ? '<span style="color:#e52207">Nenhum servidor encontrado nesta unidade.</span>'
          : `<i class="ti ti-users"></i> <strong>${lista.length}</strong> servidor(es) encontrado(s):&nbsp;` +
            lista.map(s => htmlEscape(s.nome)).join(' &bull; ');
      });
    }
  }
}

function fpImprimirUnidade() {
  const unidade = $('fp-unidade-select')?.value?.trim();
  const mm      = $('fp-und-mes')?.value || String(new Date().getMonth()+1).padStart(2,'0');
  const aa      = $('fp-und-ano')?.value || String(new Date().getFullYear());

  if (!unidade) { showToast('Selecione a Unidade Administrativa', 'warning'); return; }

  const lista = _fpServidores.filter(s => (s.lotacao_nome||'').trim() === unidade);
  if (lista.length === 0) { showToast('Nenhum servidor na unidade selecionada', 'warning'); return; }

  showToast(`Gerando ${lista.length} folha(s) para impressão…`, 'info');

  // Pega o template A4 atual, clona para cada servidor, imprime
  const container = document.createElement('div');
  container.id = 'fp-print-lote';

  const ferList = fpGetHolidays(parseInt(aa));
  const ferMap  = new Map(ferList.map(h => [h.date, h.nome]));

  lista.forEach(srv => {
    const wrap = document.createElement('div');
    wrap.className = 'page-fp';
    wrap.style.pageBreakAfter = 'always';

    const nomeUp = (srv.nome || '').toUpperCase();
    const cargo  = nomeUp.includes('JURANDY')
      ? 'Chefe de Serviço - Patrimônio'
      : (srv.funcao || '');
    const unidadeTexto = nomeUp.includes('JURANDY')
      ? 'Coordenação de Administração e Patrimônio'
      : unidade;
    const diasNoMes = new Date(Number(aa), Number(mm), 0).getDate();

    // Monta os dias
    let linhasDias = '';
    for (let i = 1; i <= 31; i++) {
      if (i <= diasNoMes) {
        const dt  = new Date(Number(aa), Number(mm)-1, i);
        const dow = dt.getDay();
        const iso = `${aa}-${String(mm).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        if (ferMap.has(iso)) {
          linhasDias += `<tr class="fp-dia"><td style="text-align:center;font-weight:bold">${i}</td><td colspan="9" style="text-align:center;background:#ffe4e6;color:#991b1b;font-weight:bold;font-size:9px">FERIADO &#8226; ${htmlEscape(ferMap.get(iso))}</td></tr>`;
        } else if (dow === 0 || dow === 6) {
          const txt = dow === 6 ? 'SÁBADO' : 'DOMINGO';
          linhasDias += `<tr class="fp-dia"><td style="text-align:center;font-weight:bold">${i}</td><td colspan="9" style="text-align:center;background:#e5e7eb;color:#374151;font-weight:bold;font-size:9px">${txt}</td></tr>`;
        } else {
          linhasDias += `<tr class="fp-dia"><td style="text-align:center;font-weight:bold">${i}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
        }
      } else {
        linhasDias += `<tr class="fp-dia"><td style="text-align:center;color:#bbb">—</td><td colspan="9" style="background:#d1d5db"></td></tr>`;
      }
    }

    wrap.innerHTML = `
      <table class="folha-table fp-cabecalho">
        <tr><td class="fp-bg-gray" style="width:70%">REGISTRO INDIVIDUAL DE FREQUÊNCIA</td><td class="fp-bg-head">${mm}/${aa}</td></tr>
        <tr><td colspan="2" class="fp-bg-head fp-orgao">Secretaria Municipal da Criança e Assistência Social / SEMCAS</td></tr>
        <tr><td style="background:#fff">Nome: <strong>${htmlEscape(srv.nome)}</strong></td><td style="background:#fff">Matrícula: <strong>${htmlEscape(srv.matricula||'')}</strong></td></tr>
        <tr><td style="background:#fff">Cargo/Função: <strong>${htmlEscape(cargo)}</strong></td><td style="background:#fff">Vínculo: <strong>${htmlEscape(srv.vinculo||'')}</strong></td></tr>
        <tr><td colspan="2" style="background:#fff">Unidade Administrativa: <strong>${htmlEscape(unidadeTexto)}</strong></td></tr>
      </table>
      <div class="fp-grade-wrap">
      <table class="folha-table fp-grade">
        <colgroup><col style="width:6%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:10%"><col style="width:14%"></colgroup>
        <thead>
          <tr class="fp-bg-head"><th rowspan="3">Dia</th><th colspan="8">Horário de Trabalho</th><th rowspan="3">Ocorrência</th></tr>
          <tr class="fp-bg-head"><th colspan="4">Manhã</th><th colspan="4">Tarde</th></tr>
          <tr class="fp-bg-head">
            <th colspan="2" class="fp-hora-ref">Entrada: 08:00</th>
            <th colspan="2" class="fp-hora-ref">Saída: 12:00</th>
            <th colspan="2" class="fp-hora-ref">Entrada: 14:00</th>
            <th colspan="2" class="fp-hora-ref">Saída: 18:00</th>
          </tr>
          <tr class="fp-bg-gray"><th></th><th class="fp-col-lbl">Hora</th><th class="fp-col-lbl">Rubrica</th><th class="fp-col-lbl">Hora</th><th class="fp-col-lbl">Rubrica</th><th class="fp-col-lbl">Hora</th><th class="fp-col-lbl">Rubrica</th><th class="fp-col-lbl">Hora</th><th class="fp-col-lbl">Rubrica</th><th class="fp-col-lbl">Obs</th></tr>
        </thead>
        <tbody>${linhasDias}</tbody>
      </table>
      </div>
      <table class="fp-assinaturas">
        <tr>
          <td>
            <div class="fp-ass-titulo">Chefia Imediata:</div>
            <div class="fp-ass-linha"></div>
            <div class="fp-ass-data">São Luís, __/__/____</div>
          </td>
          <td>
            <div class="fp-ass-titulo">Visto (Recursos Humanos):</div>
            <div class="fp-ass-linha"></div>
            <div class="fp-ass-data">São Luís, __/__/____</div>
          </td>
        </tr>
      </table>`;
    container.appendChild(wrap);
  });

  document.body.appendChild(container);
  // Mede altura fora da tela (display:none zera clientHeight)
  container.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1;display:block;';
  fpAjustarAlturaDias(container);
  container.style.cssText = '';

  document.body.classList.add('fp-lote-print');

  setTimeout(() => {
    fpAjustarAlturaDias(container);
    window.print();
    setTimeout(() => {
      document.body.classList.remove('fp-lote-print');
      container.remove();
    }, 800);
  }, 200);
}

// ╔══════════════════════════════════════════════════════════════╗
// ║              ROTEAMENTO — adiciona novas rotas                ║
// ╚══════════════════════════════════════════════════════════════╝
if (typeof rotas !== 'undefined') {
  rotas.ferias       = { titulo: 'Controle de Férias',     bread: 'Férias',       render: renderFerias };
  rotas.pendentes    = { titulo: 'Dados incompletos',   bread: 'Dados incompletos',    render: renderPendentes };
  rotas.lotacoes     = { titulo: 'Gestão de Lotações',     bread: 'Lotações',     render: renderLotacoes };
  rotas['sem-lotacao'] = { titulo: 'Servidores sem Lotação', bread: 'Sem Lotação', render: renderSemLotacao };
  rotas.exonerados   = { titulo: 'Servidores Exonerados',  bread: 'Exonerados',   render: renderExonerados };
  rotas['relatorio-api'] = { titulo: 'Conferência GIAP', bread: 'Conferência GIAP', render: renderRelatorioApi };
  rotas.remuneracoes = { titulo: 'Remunerações', bread: 'Remunerações', render: renderRemuneracoes };
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  REMUNERAÇÕES — últimos 2 salários GIAP por servidor         ║
// ╚══════════════════════════════════════════════════════════════╝
window._remunCache = [];
window._remunCacheAt = 0;
const REMUN_CACHE_TTL_MS = 5 * 60 * 1000;

function fmtRemunMoeda(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtRemunComp(c) {
  const s = String(c || '');
  if (s.length !== 6) return s || '—';
  return `${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

/** Alimenta funcionario_remuneracoes a partir de folha_pmsl e poda para 2 competências. */
window.sincronizarRemuneracoesGiap = async function sincronizarRemuneracoesGiap(opts = {}) {
  const silencioso = !!opts.silencioso;
  const comp = opts.competencia != null
    ? Number(opts.competencia)
    : Number($('giap-cfg-comp')?.value || 0) || null;
  try {
    const { data, error } = await sb.rpc('fn_giap_alimentar_remuneracoes', {
      p_competencia: comp || null
    });
    if (error) throw error;
    const r = data || {};
    window._remunCache = [];
    window._remunCacheAt = 0;
    if (!silencioso) {
      if (r.ok === false) {
        showToast(r.erro || 'Não foi possível alimentar remunerações.', 'warning');
      } else {
        showToast(
          `Remunerações: ${r.gravados || 0} gravado(s) · competência ${r.competencia}` +
            (r.podados ? ` · ${r.podados} antigo(s) removido(s)` : ''),
          'success'
        );
      }
    }
    if (state.rotaAtual === 'remuneracoes') await renderRemuneracoes(true);
    return r;
  } catch (e) {
    const msg = e.message || String(e);
    if (!silencioso) {
      if (/fn_giap_alimentar_remuneracoes|does not exist|404/i.test(msg)) {
        showToast('Rode o SQL funcionario_remuneracoes.sql no Supabase primeiro.', 'warning');
      } else {
        showToast(msg, 'error');
      }
    } else {
      console.warn('[Remunerações]', msg);
    }
    return null;
  }
};

async function carregarRemuneracoesNoEdit(funcionarioId) {
  const box = $('edit-remun-content');
  if (!box) return;
  box.innerHTML = 'Carregando…';
  try {
    const { data, error } = await sb.from('funcionario_remuneracoes')
      .select('competencia, vencimento_base, proventos, descontos, liquido, cargo_origem')
      .eq('funcionario_id', funcionarioId)
      .order('competencia', { ascending: false })
      .limit(2);
    if (error) throw error;
    if (!data?.length) {
      box.innerHTML = 'Sem remuneração GIAP gravada. Puxe a folha ou use <strong>Atualizar da folha</strong> em Remunerações.';
      return;
    }
    box.innerHTML = `
      <div style="display:grid;gap:8px">
        ${data.map((r) => `
          <div style="display:grid;grid-template-columns:90px 1fr;gap:4px 12px;padding:8px;background:#fff;border-radius:6px;border:1px solid var(--gov-border)">
            <span style="font-weight:700;color:var(--gov-blue-dark)">${htmlEscape(fmtRemunComp(r.competencia))}</span>
            <span style="color:var(--color-text-muted)">${htmlEscape(r.cargo_origem || '—')}</span>
            <span style="color:var(--color-text-muted)">Venc. base</span>
            <strong>${fmtRemunMoeda(r.vencimento_base)}</strong>
            <span style="color:var(--color-text-muted)">Proventos</span>
            <strong>${fmtRemunMoeda(r.proventos)}</strong>
            <span style="color:var(--color-text-muted)">Descontos</span>
            <strong>${fmtRemunMoeda(r.descontos)}</strong>
            <span style="color:var(--color-text-muted)">Líquido</span>
            <strong style="color:#276749">${fmtRemunMoeda(r.liquido)}</strong>
          </div>
        `).join('')}
      </div>`;
  } catch (e) {
    box.innerHTML = /does not exist|404/i.test(e.message || '')
      ? 'Tabela ainda não criada — rode <code>sql/funcionario_remuneracoes.sql</code>.'
      : htmlEscape(e.message || String(e));
  }
}

async function renderRemuneracoes(forceReload = false) {
  const tbody = $('tbody-remuneracoes');
  const kpis = $('remun-kpis');
  if (!tbody) return;

  const cacheOk = !forceReload
    && Array.isArray(window._remunCache)
    && window._remunCache.length > 0
    && (Date.now() - (window._remunCacheAt || 0)) < REMUN_CACHE_TTL_MS;

  if (cacheOk) {
    remunPopularFiltrosEKpis(window._remunCache);
    renderTabelaRemuneracoes();
    return;
  }

  tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><span class="spinner"></span> Carregando…</td></tr>';
  try {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('v_remuneracoes_atuais')
        .select('*')
        .order('nome')
        .order('competencia', { ascending: false })
        .range(from, from + 999);
      if (error) throw error;
      if (data?.length) all.push(...data);
      if (!data || data.length < 1000) break;
    }

    // Lotação SEMPRE do nosso sistema (RH), nunca a do GIAP
    if (all.length) {
      const ids = [...new Set(all.map((r) => r.funcionario_id).filter(Boolean))];
      const mapLot = new Map();
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data: lots } = await sb.from('v_funcionarios_atual')
          .select('funcionario_id, lotacao_nome, caminho_lotacao')
          .in('funcionario_id', chunk);
        for (const l of lots || []) mapLot.set(l.funcionario_id, l);
      }
      for (const r of all) {
        const l = mapLot.get(r.funcionario_id);
        r.lotacao_nome = l?.lotacao_nome || null;
        r.caminho_lotacao = l?.caminho_lotacao || null;
      }
    }

    window._remunCache = all;
    window._remunCacheAt = Date.now();
    if (!window._remunSort) window._remunSort = { col: 'nome', dir: 'asc' };
    window._remunPage = 1;

    remunPopularFiltrosEKpis(all);
    renderTabelaRemuneracoes();
  } catch (e) {
    const msg = e.message || String(e);
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${
      /does not exist|404/i.test(msg)
        ? 'Rode o SQL <strong>funcionario_remuneracoes.sql</strong> no Supabase e depois clique em Atualizar da folha.'
        : htmlEscape(msg)
    }</td></tr>`;
    if (kpis) kpis.innerHTML = '';
  }
}

function remunPopularFiltrosEKpis(all) {
  const kpis = $('remun-kpis');
  const comps = [...new Set(all.map((r) => r.competencia).filter(Boolean))].sort((a, b) => b - a);
  const sel = $('remun-comp');
  if (sel) {
    const atual = sel.value;
    sel.innerHTML = '<option value="">Todas competências</option>' +
      comps.map((c) => `<option value="${c}">${htmlEscape(fmtRemunComp(c))}</option>`).join('');
    if (atual && comps.includes(Number(atual))) sel.value = atual;
  }

  const lots = [...new Set(all.map((r) => (r.lotacao_nome || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const selLot = $('remun-lotacao');
  if (selLot) {
    const atualLot = selLot.value;
    selLot.innerHTML = '<option value="">Todas as lotações</option>' +
      lots.map((l) => `<option value="${htmlEscape(l)}">${htmlEscape(l)}</option>`).join('');
    if (atualLot && lots.includes(atualLot)) selLot.value = atualLot;
  }

  const pessoas = new Set(all.map((r) => r.funcionario_id));
  const ultima = comps[0];
  const nUltima = ultima ? all.filter((r) => r.competencia === ultima).length : 0;
  if (kpis) {
    kpis.innerHTML = `
      <div class="kpi-card"><div class="kpi-card-label">Registros</div><div class="kpi-card-value">${all.length}</div><div class="kpi-card-sub">máx. 2 por servidor</div></div>
      <div class="kpi-card"><div class="kpi-card-label">Servidores</div><div class="kpi-card-value">${pessoas.size}</div><div class="kpi-card-sub">com salário GIAP</div></div>
      <div class="kpi-card"><div class="kpi-card-label">Última competência</div><div class="kpi-card-value" style="font-size:22px">${htmlEscape(fmtRemunComp(ultima))}</div><div class="kpi-card-sub">${nUltima} linha(s)</div></div>`;
  }
}

window._remunPage = 1;
window._remunPageSize = 15;

window.sortRemuneracoes = function sortRemuneracoes(col) {
  const s = window._remunSort || { col: 'nome', dir: 'asc' };
  if (s.col === col) s.dir = s.dir === 'asc' ? 'desc' : 'asc';
  else {
    s.col = col;
    s.dir = 'asc';
  }
  window._remunSort = s;
  window._remunPage = 1;
  renderTabelaRemuneracoes();
};

function atualizarIconesSortRemun() {
  const s = window._remunSort || { col: 'nome', dir: 'asc' };
  $$('#tabela-remuneracoes .sortable').forEach((th) => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    if (th.dataset.remunSort === s.col) {
      icon.className = `ti ${s.dir === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending'} sort-icon active`;
    } else {
      icon.className = 'ti ti-arrows-sort sort-icon';
    }
  });
}

window.filtrarRemuneracoes = function filtrarRemuneracoes() {
  window._remunPage = 1;
  renderTabelaRemuneracoes();
};

window.limparFiltrosRemuneracoes = function limparFiltrosRemuneracoes() {
  if ($('remun-busca')) $('remun-busca').value = '';
  if ($('remun-lotacao')) $('remun-lotacao').value = '';
  if ($('remun-comp')) $('remun-comp').value = '';
  window._remunPage = 1;
  renderTabelaRemuneracoes();
};

window.irPaginaRemuneracoes = function irPaginaRemuneracoes(p) {
  window._remunPage = Math.max(1, Number(p) || 1);
  renderTabelaRemuneracoes();
};

function renderPaginacaoRemuneracoes(filtradoTotal) {
  const info = $('remun-page-info');
  const controls = $('remun-page-controls');
  if (!info || !controls) return;
  const pageSize = window._remunPageSize || 15;
  const totalPages = Math.max(1, Math.ceil(filtradoTotal / pageSize) || 1);
  if (window._remunPage > totalPages) window._remunPage = totalPages;
  const page = window._remunPage || 1;
  const ini = filtradoTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const fim = Math.min(page * pageSize, filtradoTotal);
  info.textContent = filtradoTotal === 0
    ? 'Nenhum registro'
    : `Mostrando ${ini}-${fim} de ${filtradoTotal.toLocaleString('pt-BR')}`;

  const btn = (label, p, dis, active = false) =>
    `<button class="page-btn ${active ? 'active' : ''}" ${dis ? 'disabled' : ''} data-page="${p}">${label}</button>`;
  let html = btn('«', page - 1, page === 1);
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) html += btn(i, i, false, i === page);
  html += btn('»', page + 1, page === totalPages);
  controls.innerHTML = html;
  $$('#remun-page-controls .page-btn').forEach((b) => {
    b.onclick = () => {
      if (b.disabled) return;
      irPaginaRemuneracoes(b.dataset.page);
    };
  });
}

window.renderTabelaRemuneracoes = function renderTabelaRemuneracoes() {
  const tbody = $('tbody-remuneracoes');
  if (!tbody) return;
  const qNome = String($('remun-busca')?.value || '').toLowerCase().trim();
  const lotToolbar = ($('remun-lotacao')?.value || '').trim();
  const compFiltro = Number($('remun-comp')?.value || 0);
  const s = window._remunSort || { col: 'nome', dir: 'asc' };
  const pageSize = window._remunPageSize || 15;

  let lista = [...(window._remunCache || [])];
  if (compFiltro) lista = lista.filter((r) => Number(r.competencia) === compFiltro);
  if (lotToolbar) lista = lista.filter((r) => (r.lotacao_nome || '').trim() === lotToolbar);
  if (qNome) {
    const parts = qNome.split(/\s+/).filter(Boolean);
    lista = lista.filter((r) => {
      const alvo = `${r.nome || ''} ${r.matricula_rh || ''}`.toLowerCase();
      return parts.every((p) => alvo.includes(p));
    });
  }

  const numCols = new Set(['competencia', 'vencimento_base', 'proventos', 'descontos', 'liquido']);
  lista.sort((a, b) => {
    let va;
    let vb;
    if (s.col === 'matricula') {
      va = String(a.matricula_rh || a.matricula_giap || '');
      vb = String(b.matricula_rh || b.matricula_giap || '');
    } else {
      va = a[s.col];
      vb = b[s.col];
    }
    let cmp;
    if (numCols.has(s.col)) {
      cmp = (Number(va) || 0) - (Number(vb) || 0);
    } else {
      cmp = String(va || '').localeCompare(String(vb || ''), 'pt-BR', { sensitivity: 'base' });
    }
    return s.dir === 'asc' ? cmp : -cmp;
  });

  const filtradoTotal = lista.length;
  const totalGeral = (window._remunCache || []).length;
  const count = $('remun-count');
  if (count) count.innerHTML = `<strong>${filtradoTotal}</strong> de ${totalGeral}`;

  atualizarIconesSortRemun();
  renderPaginacaoRemuneracoes(filtradoTotal);

  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Nenhuma remuneração encontrada</td></tr>';
    return;
  }

  const page = window._remunPage || 1;
  const start = (page - 1) * pageSize;
  const pagina = lista.slice(start, start + pageSize);

  tbody.innerHTML = pagina.map((r) => `
    <tr>
      <td>${htmlEscape(r.matricula_rh || r.matricula_giap || '—')}</td>
      <td><strong>${htmlEscape(r.nome || '—')}</strong></td>
      <td title="${htmlEscape(r.caminho_lotacao || r.lotacao_nome || '')}">${htmlEscape(r.lotacao_nome || '—')}</td>
      <td>${htmlEscape(r.competencia_fmt || fmtRemunComp(r.competencia))}</td>
      <td style="text-align:right;white-space:nowrap">${fmtRemunMoeda(r.vencimento_base)}</td>
      <td style="text-align:right;white-space:nowrap">${fmtRemunMoeda(r.proventos)}</td>
      <td style="text-align:right;white-space:nowrap">${fmtRemunMoeda(r.descontos)}</td>
      <td style="text-align:right;white-space:nowrap;font-weight:700;color:#276749">${fmtRemunMoeda(r.liquido)}</td>
      <td style="font-size:12px">${htmlEscape(r.cargo_origem || '—')}</td>
    </tr>
  `).join('');
};

// ╔══════════════════════════════════════════════════════════════╗
// ║              SEM LOTAÇÃO  /  EXONERADOS                       ║
// ╚══════════════════════════════════════════════════════════════╝
async function atualizarBadgesSemLotacaoExonerados() {
  try {
    const [s, e] = await Promise.all([
      sb.from('v_servidores_sem_lotacao').select('funcionario_id', { count: 'exact', head: true }),
      sb.from('v_exonerados').select('funcionario_id', { count: 'exact', head: true })
    ]);
    const ns = s.count || 0;
    const ne = e.count || 0;
    const bs = $('badge-sem-lotacao');
    const be = $('badge-exonerados');
    if (bs) {
      bs.textContent = ns;
      bs.style.display = ns > 0 ? '' : 'none';
    }
    if (be) {
      be.textContent = ne;
      be.style.display = ne > 0 ? '' : 'none';
    }
    if (typeof giapAtualizarBadges === 'function') giapAtualizarBadges();
  } catch (_) { /* views podem ainda não existir */ }
}

async function renderSemLotacao() {
  const tbody = $('tbody-sem-lotacao');
  if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><span class="spinner"></span> Carregando…</td></tr>';

  let lista = [];
  const { data, error } = await sb.from('v_servidores_sem_lotacao')
    .select('funcionario_id, nome, matricula, cpf, simbologia, data_admissao, email, telefone, ultima_funcao, ultimo_cargo, ultima_lotacao, sem_lotacao_desde')
    .order('nome');

  if (error) {
    const fallback = await sb.from('v_servidores_sem_lotacao')
      .select('funcionario_id, nome, matricula, cpf, simbologia, data_admissao, email, telefone')
      .order('nome');
    if (fallback.error) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Erro: ${htmlEscape(fallback.error.message)}. Rode sql/atualizar_v_servidores_sem_lotacao.sql no Supabase.</td></tr>`;
      return;
    }
    lista = fallback.data || [];
    await enriquecerSemLotacaoComHistorico(lista);
  } else {
    lista = data || [];
  }

  await enriquecerSemLotacaoComGiap(lista);
  pintarTabelaSemLotacao(lista);
}

async function enriquecerSemLotacaoComHistorico(lista) {
  const ids = lista.map((f) => f.funcionario_id).filter(Boolean);
  if (!ids.length) return;
  const { data: lots } = await sb.from('funcionario_lotacao')
    .select('funcionario_id, funcao, lotacao_id, data_fim, data_inicio, ativo')
    .in('funcionario_id', ids)
    .order('data_inicio', { ascending: false });
  const lotNomes = Object.fromEntries((state.lotacoes || []).map((l) => [l.id, l.nome]));
  const porFunc = new Map();
  for (const fl of lots || []) {
    if (porFunc.has(fl.funcionario_id)) continue;
    if (fl.ativo) continue;
    porFunc.set(fl.funcionario_id, fl);
  }
  for (const f of lista) {
    const fl = porFunc.get(f.funcionario_id);
    if (!fl) continue;
    f.ultima_funcao = f.ultima_funcao || fl.funcao || null;
    f.ultimo_cargo = f.ultimo_cargo || fl.funcao || null;
    f.ultima_lotacao = f.ultima_lotacao || lotNomes[fl.lotacao_id] || null;
    f.sem_lotacao_desde = f.sem_lotacao_desde || fl.data_fim || null;
  }
}

/** Quando o RH não tem função/lotação, usa cargo e lotação da folha GIAP (mesma fonte do relatório). */
async function enriquecerSemLotacaoComGiap(lista) {
  const precisa = (lista || []).filter(
    (f) => !(f.ultima_funcao || f.ultimo_cargo) || !f.ultima_lotacao
  );
  if (!precisa.length) return;

  // 1) Remunerações já gravadas no RH (por funcionario_id)
  const ids = [...new Set(precisa.map((f) => f.funcionario_id).filter(Boolean))];
  try {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data: rem } = await sb.from('funcionario_remuneracoes')
        .select('funcionario_id, cargo_origem, lotacao_giap, competencia')
        .in('funcionario_id', chunk)
        .order('competencia', { ascending: false });
      const visto = new Set();
      for (const r of rem || []) {
        if (visto.has(r.funcionario_id)) continue;
        visto.add(r.funcionario_id);
        const f = lista.find((x) => x.funcionario_id === r.funcionario_id);
        if (!f) continue;
        if (!(f.ultima_funcao || f.ultimo_cargo) && r.cargo_origem) {
          f.ultimo_cargo = r.cargo_origem;
          f.ultima_funcao = r.cargo_origem;
          f._cargoFonte = 'giap';
        }
        if (!f.ultima_lotacao && r.lotacao_giap) {
          f.ultima_lotacao = r.lotacao_giap;
          f._lotFonte = 'giap';
        }
      }
    }
  } catch (_) { /* tabela pode não existir */ }

  // 2) Folha GIAP por matrícula (quem ainda falta)
  const ainda = lista.filter((f) => !(f.ultima_funcao || f.ultimo_cargo) || !f.ultima_lotacao);
  if (!ainda.length) return;

  const mats = [...new Set(
    ainda.map((f) => String(f.matricula || '').trim()).filter(Boolean)
  )];
  if (!mats.length) return;

  let comp = Number($('giap-cfg-comp')?.value || 0);
  if (!comp && typeof giapCompetenciaPadrao === 'function') {
    comp = giapCompetenciaPadrao();
  }
  if (!comp) {
    try {
      const { data: maxRow } = await sb.from('folha_pmsl')
        .select('competencia')
        .order('competencia', { ascending: false })
        .limit(1)
        .maybeSingle();
      comp = Number(maxRow?.competencia || 0);
    } catch (_) { return; }
  }
  if (!comp) return;

  try {
    const allFolha = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('folha_pmsl')
        .select('matricula, cargo_origem, lotacao, competencia')
        .eq('competencia', comp)
        .range(from, from + 999);
      if (error) throw error;
      if (data?.length) allFolha.push(...data);
      if (!data || data.length < 1000) break;
    }

    const matKey = (m) => {
      if (typeof giapMatKey === 'function') return giapMatKey(m);
      return String(m || '').replace(/\D/g, '').replace(/^0+/, '') || null;
    };
    const porMat = new Map();
    for (const r of allFolha) {
      const k = matKey(r.matricula);
      if (k && !porMat.has(k)) porMat.set(k, r);
    }

    for (const f of ainda) {
      const k = matKey(f.matricula);
      const r = k ? porMat.get(k) : null;
      if (!r) continue;
      if (!(f.ultima_funcao || f.ultimo_cargo) && r.cargo_origem) {
        f.ultimo_cargo = r.cargo_origem;
        f.ultima_funcao = r.cargo_origem;
        f._cargoFonte = 'giap';
      }
      if (!f.ultima_lotacao && r.lotacao) {
        f.ultima_lotacao = r.lotacao;
        f._lotFonte = 'giap';
      }
    }
  } catch (_) { /* ok */ }
}

function pintarTabelaSemLotacao(data) {
  const tbody = $('tbody-sem-lotacao');
  if (!tbody) return;
  let lista = data || [];
  window._semLotacaoCache = lista;
  const termo = ($('semlot-busca')?.value || '').trim().toLowerCase();
  if (termo) {
    lista = lista.filter(f =>
      (f.nome || '').toLowerCase().includes(termo) ||
      String(f.matricula || '').toLowerCase().includes(termo) ||
      String(f.cpf || '').includes(termo) ||
      (f.ultima_funcao || '').toLowerCase().includes(termo) ||
      (f.ultimo_cargo || '').toLowerCase().includes(termo) ||
      (f.ultima_lotacao || '').toLowerCase().includes(termo)
    );
  }

  if ($('semlot-count')) $('semlot-count').textContent = `${lista.length} servidor(es)`;
  atualizarBadgesSemLotacaoExonerados();

  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state" style="color:var(--gov-green);font-weight:600">Nenhum servidor sem lotação.</td></tr>';
    return;
  }

  const fmtDt = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  const cargoLbl = (f) => {
    const c = f.ultima_funcao || f.ultimo_cargo || '';
    if (!c) return '—';
    const tip = f._cargoFonte === 'giap' ? ' title="Cargo da folha GIAP (sem função no RH)"' : '';
    const tag = f._cargoFonte === 'giap'
      ? ` <span style="font-size:10px;color:var(--color-text-muted)">(GIAP)</span>`
      : '';
    return `<span${tip}>${htmlEscape(c)}${tag}</span>`;
  };
  const lotLbl = (f) => {
    const l = f.ultima_lotacao || '';
    if (!l) return '—';
    const tip = f._lotFonte === 'giap' ? ' title="Lotação da folha GIAP"' : ' title="Lotação de onde o servidor saiu"';
    const tag = f._lotFonte === 'giap'
      ? ` <span style="font-size:10px;color:var(--color-text-muted)">(GIAP)</span>`
      : '';
    return `<span${tip}>${htmlEscape(l)}${tag}</span>`;
  };

  tbody.innerHTML = lista.map(f => `
    <tr>
      <td style="font-family:monospace;font-size:12px">${htmlEscape(f.matricula || '—')}</td>
      <td style="font-weight:600;color:var(--gov-blue-dark)">${htmlEscape(f.nome || '—')}</td>
      <td style="font-size:12px">${cargoLbl(f)}</td>
      <td style="font-size:12px">${lotLbl(f)}</td>
      <td style="font-size:12px;font-weight:600;color:var(--gov-orange)">${fmtDt(f.sem_lotacao_desde)}</td>
      <td style="font-size:12px">${htmlEscape(f.cpf || '—')}</td>
      <td>${htmlEscape(f.simbologia || '—')}</td>
      <td style="font-size:12px">${fmtDt(f.data_admissao)}</td>
      <td style="text-align:center">
        <button class="btn-primary" style="padding:6px 10px;font-size:12px" onclick="alocarServidorSemLotacao(${f.funcionario_id})">
          <i class="ti ti-map-pin"></i> Alocar
        </button>
        <button class="btn-icon" style="margin-left:4px" title="Ver histórico" onclick="verHistorico(${f.funcionario_id})">
          <i class="ti ti-history"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

window.alocarServidorSemLotacao = async (funcionarioId) => {
  await abrirTransferencia(funcionarioId, { fromSemLotacao: true });
};

async function renderExonerados() {
  const tbody = $('tbody-exonerados');
  if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><span class="spinner"></span> Carregando…</td></tr>';

  const { data, error } = await sb.from('v_exonerados')
    .select('funcionario_id, nome, matricula, data_exoneracao, funcao, lotacao_nome, vinculo, simbologia, data_admissao')
    .order('data_exoneracao', { ascending: false });

  if (error) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Erro: ${htmlEscape(error.message)}. Rode sql/exonerados_e_sem_lotacao.sql no Supabase.</td></tr>`;
    return;
  }

  let lista = data || [];
  window._exoneradosCache = lista;
  const termo = ($('exo-busca')?.value || '').trim().toLowerCase();
  if (termo) {
    lista = lista.filter(f =>
      (f.nome || '').toLowerCase().includes(termo) ||
      String(f.matricula || '').toLowerCase().includes(termo)
    );
  }

  if ($('exo-count')) $('exo-count').textContent = `${lista.length} exonerado(s)`;
  atualizarBadgesSemLotacaoExonerados();

  if (!lista.length) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Nenhum servidor exonerado.</td></tr>';
    return;
  }

  const fmtDt = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  tbody.innerHTML = lista.map(f => `
    <tr>
      <td style="font-family:monospace;font-size:12px">${htmlEscape(f.matricula || '—')}</td>
      <td style="font-weight:600">${htmlEscape(f.nome || '—')}</td>
      <td style="font-weight:700;color:var(--gov-red)">${fmtDt(f.data_exoneracao)}</td>
      <td>${htmlEscape(f.funcao || '—')}</td>
      <td>${htmlEscape(f.lotacao_nome || '—')}</td>
      <td>${htmlEscape(f.vinculo || '—')}</td>
      <td>${htmlEscape(f.simbologia || '—')}</td>
      <td style="font-size:12px">${fmtDt(f.data_admissao)}</td>
      <td style="text-align:center">
        <button
          type="button"
          class="btn-primary"
          style="padding:6px 10px;font-size:12px"
          onclick="reativarExonerado(${Number(f.funcionario_id)})"
          title="Reativar e devolver à última lotação"
        >
          <i class="ti ti-user-check"></i> Reativar
        </button>
      </td>
    </tr>
  `).join('');
}

window.reativarExonerado = async function reativarExonerado(funcionarioId) {
  const servidor = (window._exoneradosCache || [])
    .find((f) => Number(f.funcionario_id) === Number(funcionarioId));
  const nome = servidor?.nome || 'Servidor(a)';
  const ultimaLotacao = servidor?.lotacao_nome || '';
  const destino = ultimaLotacao || 'Sem Lotação';
  if (!confirm(
    `CONFIRMAR REATIVAÇÃO\n\n` +
    `Deseja realmente desfazer a exoneração de “${nome}”?\n\n` +
    `O servidor voltará ao quadro ativo em:\n${destino}\n\n` +
    'Clique em OK somente se deseja confirmar esta ação.'
  )) return;

  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await sb.rpc('fn_reativar_funcionario', {
      p_funcionario_id: Number(funcionarioId),
      p_data_reativacao: hoje
    });
    if (error) throw error;

    await registrarLog('EXONERAÇÃO DESFEITA / REATIVAÇÃO', Number(funcionarioId), nome, {
      data_reativacao: hoje,
      lotacao_restaurada: ultimaLotacao || null,
      confirmada: true,
      sem_lotacao: !!data?.sem_lotacao
    });

    gsInvalidarCache();
    invalidarCacheFiltros();
    showToast(
      data?.sem_lotacao
        ? `${nome} foi reativado, mas não tinha lotação anterior e foi para Sem Lotação.`
        : `Exoneração desfeita. ${nome} voltou para ${ultimaLotacao}.`,
      data?.sem_lotacao ? 'warning' : 'success'
    );
    await renderExonerados();
    atualizarBadgesSemLotacaoExonerados();
  } catch (e) {
    const msg = e.message || String(e);
    const detalhes = [e.details, e.hint, e.code].filter(Boolean).join(' | ');
    if (/schema cache|does not exist|PGRST202|404/i.test(`${msg} ${detalhes}`)) {
      showToast(
        `Função não encontrada no Supabase. Rode sql/reativar_servidor_exonerado.sql e tente de novo. (${msg})`,
        'warning'
      );
    } else {
      showToast(detalhes ? `${msg} — ${detalhes}` : msg, 'error');
    }
  }
};

document.addEventListener('input', debounce((e) => {
  if (e.target.id === 'semlot-busca') renderSemLotacao();
  if (e.target.id === 'exo-busca') renderExonerados();
}, 250));

// ╔══════════════════════════════════════════════════════════════╗
// ║                    RELATÓRIO API GIAP                         ║
// ╚══════════════════════════════════════════════════════════════╝
let _giapPollTimer = null;
let _giapJobId = null;

function giapCompetenciaPadrao() {
  const d = new Date();
  let y = d.getFullYear();
  let m = d.getMonth(); // 0 = jan → competência mês anterior
  if (m === 0) { m = 12; y -= 1; }
  return y * 100 + m;
}

async function giapProxy(acao, extra = {}) {
  const { data: sess } = await sb.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/giap-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON
    },
    body: JSON.stringify({ acao, ...extra })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = data.error || `Erro HTTP ${res.status}`;
    if (/main frame too early/i.test(msg)) {
      msg =
        'Portal GIAP/Chrome ainda inicializando no servidor. Aguarde ~15s e clique em Puxar de novo. ' +
        '(Se repetir: faça Manual Deploy do giap-sync-semcas no Render.)';
    }
    throw new Error(msg);
  }
  return data;
}

function giapPintarProgresso(job) {
  if (!job) return;
  const pct = Number(job.progresso_pct || 0);
  const bar = $('giap-progress-bar');
  const lbl = $('giap-progress-label');
  const meta = $('giap-job-meta');
  const etapa = $('giap-job-etapa');
  const resumo = $('giap-resumo');
  if (bar) {
    bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    if (job.status === 'running' || job.status === 'pending') {
      bar.style.background = 'var(--gov-blue-primary, #3182ce)';
    } else if (job.status === 'error') {
      bar.style.background = 'var(--gov-red, #e53e3e)';
    } else {
      bar.style.background = 'var(--gov-green, #2f855a)';
    }
  }
  if (lbl) lbl.textContent = `${pct}% · ${job.status || '—'}`;
  if (meta) {
    meta.textContent = job.id
      ? `Job #${job.id} · competência ${job.competencia} · ${job.modo || 'manual'}${job.dry_run ? ' · SIMULAÇÃO' : ''}`
      : (job.meta || '—');
  }
  if (etapa) etapa.textContent = job.resumo?.etapa || job.etapa || '';
  if (resumo) {
    resumo.textContent = job.erro
      ? `ERRO: ${job.erro}\n\n${JSON.stringify(job.resumo || {}, null, 2)}`
      : JSON.stringify(job.resumo || {}, null, 2);
  }
}

function giapProgressoLocal(texto, etapa) {
  giapPintarProgresso({
    id: null,
    progresso_pct: 2,
    status: 'pending',
    competencia: Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao()),
    modo: 'manual',
    meta: texto,
    etapa,
    resumo: { etapa: etapa || 'iniciando' }
  });
  const card = $('giap-progress-bar')?.closest('.card');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function giapAtualizarBadges() {
  try {
    const comp = Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
    const { count } = await sb.from('folha_pmsl')
      .select('id', { count: 'exact', head: true })
      .eq('competencia', comp);
    const n = count || 0;
    const b = $('badge-giap-revisao');
    if (b) {
      b.textContent = n > 999 ? '999+' : String(n);
      b.style.display = n > 0 ? '' : 'none';
      b.title = `Registros na folha GIAP (competência ${comp})`;
    }
  } catch (_) { /* ok */ }
}

function giapNormNome(s) {
  if (!s) return '';
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/** Padrão RH: Jurandy Soares Santana Junior (não JURANDY…) */
function giapNomeTitulo(s) {
  if (!s) return '';
  const particulas = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du']);
  return String(s)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      if (w === 'jr' || w === 'jr.') return 'Jr';
      if (w === 'junior') return 'Junior';
      if (i > 0 && particulas.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

function giapFiltrosBusca() {
  return {
    soSemMatricula: !!$('giap-opt-sem-matricula')?.checked,
    soSemAdmissao: !!$('giap-opt-sem-admissao')?.checked,
    incluirComMatricula: !!$('giap-opt-com-matricula')?.checked
  };
}

const _giapFolha = {
  rows: [],
  filtered: [],
  sortKey: 'funcionario',
  sortDir: 'asc',
  page: 1,
  pageSize: 50,
  okCount: 0,
  competencia: null,
  busca: '',
  filtroAcao: '',
  /** semcas = SEMCAS + cedidos; todas = inclui outras secretarias */
  escopoOrgao: 'semcas'
};

function giapFolhaFmtDt(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, day] = s.split('-');
    return `${day}/${m}/${y}`;
  }
  return s;
}

/** Normaliza data GIAP/RH para YYYY-MM-DD */
function giapDataISO(d) {
  if (!d) return '';
  const s = String(d).trim();
  let m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

function giapFolhaFindRow(mat) {
  const key = String(mat ?? '').trim();
  return _giapFolha.rows.find((r) => String(r.matricula ?? '').trim() === key) || null;
}

function giapFolhaFindRowByKey(rowKey) {
  return _giapFolha.rows.find((r) => r._rowKey === String(rowKey || '')) || null;
}

/** Compara grafia real (ignora MAIÚSCULA do GIAP, acentos, JR/Júnior). */
function giapNomeMesmaGrafia(giapNome, rhNome) {
  if (!giapNome || !rhNome) return true;
  // Compatível (JR/JUNIOR, tamanho parecido) = não é erro
  if (typeof giapNomesCompativeis === 'function' && giapNomesCompativeis(giapNome, rhNome)) {
    return true;
  }
  const limpar = (s) => {
    let n = giapNormNome(s);
    // Padroniza sufixos
    n = n.replace(/\bJUNIOR\b/g, 'JR').replace(/\bFILHO\b/g, 'FILHO');
    // Funde pedaços tipo CONCEI CAO → CONCEICAO
    n = n.replace(/\bCONCEI\s+CAO\b/g, 'CONCEICAO');
    return n.replace(/\s+/g, ' ').trim();
  };
  return limpar(giapNome) === limpar(rhNome);
}

/** Detecta o que falta corrigir entre GIAP e RH */
function giapFolhaDetectarCorrecoes(r) {
  if (!r._rhId) {
    return {
      sem_vinculo: true,
      precisa: false,
      tipos: ['sem_vinculo'],
      labels: ['Sem vínculo RH'],
      resumo: 'Sem vínculo RH'
    };
  }
  const matG = r.matricula != null ? String(r.matricula).trim() : '';
  const matR = r._rhMatricula != null ? String(r._rhMatricula).trim() : '';
  // GIAP vem em MAIÚSCULAS — isso NÃO é erro (padrão RH: Jurandy Soares…)
  // Só marca divergência se a grafia (ignorando caixa/acento/JR) for diferente
  const nomeDiff = !!(r._rhNome && r.funcionario)
    && giapNormNome(r.funcionario) !== giapNormNome(r._rhNome)
    && !giapNomeMesmaGrafia(r.funcionario, r._rhNome);
  const admG = giapDataISO(r.admissao);
  const admR = giapDataISO(r._rhAdmissao);
  const admDiff = !!admG && admG !== admR;
  const matDiff = !!(matG && (!matR || giapMatKey(matG) !== giapMatKey(matR)));
  const matNova = matDiff && !matR;
  const demissao = !!r.demissao;
  const cpfG = soDigitos(r.cpf);
  const cpfR = soDigitos(r._rhCpf);
  const cpfGiapOk = cpfG.length === 11 && cpfValido(cpfG);
  // Só alimenta se RH estiver sem CPF (não sobrescreve CPF já cadastrado)
  const cpfFalta = cpfGiapOk && cpfR.length !== 11;

  const tipos = [];
  const labels = [];
  if (matDiff) {
    tipos.push('matricula');
    labels.push(matNova ? 'Cadastrar matrícula' : 'Corrigir matrícula');
  }
  if (nomeDiff) {
    tipos.push('nome');
    labels.push('Corrigir nome');
  }
  if (admDiff) {
    tipos.push('admissao');
    labels.push('Corrigir admissão');
  }
  if (cpfFalta) {
    tipos.push('cpf');
    labels.push('Preencher CPF');
  }
  if (demissao) {
    tipos.push('exoneracao');
    labels.push('Demissão GIAP');
  }

  // Alinhado = match OK e sem divergência de mat/nome/admissão (CPF faltando ainda pode “alimentar”)
  const soCpf = cpfFalta && !matDiff && !nomeDiff && !admDiff && !demissao;
  if (!tipos.length || soCpf) {
    if (soCpf) {
      return {
        alinhado: true,
        precisa: true,
        tipos: ['alinhado', 'cpf'],
        labels: ['Alinhado', 'Preencher CPF'],
        resumo: 'Alinhado · Preencher CPF',
        matDiff: false,
        matNova: false,
        nomeDiff: false,
        admDiff: false,
        demissao: false,
        cpfFalta: true,
        matG,
        admG,
        cpfG
      };
    }
    return {
      alinhado: true,
      precisa: false,
      tipos: ['alinhado'],
      labels: ['Alinhado'],
      resumo: 'Alinhado',
      matDiff: false,
      matNova: false,
      nomeDiff: false,
      admDiff: false,
      demissao: false,
      cpfFalta: false
    };
  }

  return {
    precisa: true,
    tipos,
    labels,
    resumo: labels.join(' · '),
    matDiff,
    matNova,
    nomeDiff,
    admDiff,
    demissao,
    cpfFalta,
    matG,
    admG,
    cpfG
  };
}

function giapFolhaChip(texto, cor) {
  const cores = {
    azul: 'background:#ebf8ff;color:#2b6cb0;border:1px solid #bee3f8',
    laranja: 'background:#fffaf0;color:#c05621;border:1px solid #fbd38d',
    verde: 'background:#f0fff4;color:#276749;border:1px solid #9ae6b4',
    vermelho: 'background:#fff5f5;color:#c53030;border:1px solid #feb2b2',
    cinza: 'background:#edf2f7;color:#4a5568;border:1px solid #e2e8f0',
    roxo: 'background:#faf5ff;color:#6b46c1;border:1px solid #d6bcfa'
  };
  return `<span style="display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;margin:1px;white-space:nowrap;${cores[cor] || cores.cinza}">${htmlEscape(texto)}</span>`;
}

function giapFolhaHtmlCorrecao(r) {
  const c = r._correcao || giapFolhaDetectarCorrecoes(r);
  if (c.sem_vinculo) return giapFolhaChip('Sem vínculo RH', 'cinza');
  const mapCor = {
    alinhado: 'verde',
    matricula: 'azul',
    nome: 'roxo',
    admissao: 'laranja',
    cpf: 'azul',
    exoneracao: 'vermelho'
  };
  if (c.alinhado && !c.cpfFalta) return giapFolhaChip('Alinhado', 'verde');
  return `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:2px;max-width:200px">${
    c.tipos.map((t, i) => giapFolhaChip(c.labels[i], mapCor[t] || 'cinza')).join('')
  }</div>`;
}

function giapFolhaHtmlAcoes(r) {
  const c = r._correcao || giapFolhaDetectarCorrecoes(r);
  if (c.sem_vinculo) {
    const rowKey = JSON.stringify(r._rowKey || '');
    return `<button type="button" class="btn-primary" style="padding:4px 8px;font-size:11px;white-space:nowrap" title="Verificar matrícula e nome antes de abrir o cadastro" onclick='giapAdicionarServidor(${rowKey})'><i class="ti ti-user-plus"></i> Adicionar servidor</button>`;
  }
  const matKey = JSON.stringify(c.matG || String(r.matricula ?? '').trim());
  const btns = [];
  const btn = (label, fn, title, danger) =>
    `<button type="button" class="btn-secondary" style="padding:3px 7px;font-size:11px;margin:1px;${danger ? 'color:var(--gov-red);border-color:#feb2b2' : ''}" title="${htmlEscape(title || label)}" onclick='${fn}(${matKey})'>${label}</button>`;

  if (c.matDiff) {
    btns.push(btn(c.matNova ? 'Cadastrar mat.' : 'Corrigir mat.', 'giapAplicarMatricula', 'Gravar matrícula do GIAP no RH'));
  }
  if (c.nomeDiff) {
    btns.push(btn('Corrigir nome', 'giapAplicarNome', 'Corrigir nome no RH com o da folha GIAP'));
  }
  if (c.admDiff) {
    btns.push(btn('Corrigir admissão', 'giapAplicarAdmissao', `Usar admissão GIAP ${giapFolhaFmtDt(r.admissao)}`));
  }
  if (c.cpfFalta) {
    btns.push(btn('Preencher CPF', 'giapAplicarCpf', `Gravar CPF ${mascaraCPF(c.cpfG || r.cpf)} no cadastro do RH`));
  }
  if (c.demissao) {
    btns.push(btn('→ Exonerados', 'giapAplicarExoneracao', 'Manual: so se confirmar (pode ter novo cargo no mes seguinte)', true));
  }
  if (!btns.length) {
    return '<span style="font-size:11px;color:var(--gov-green)">OK</span>';
  }
  return `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:2px;max-width:220px">${btns.join('')}</div>`;
}

function giapFolhaSortValor(row, key) {
  if (key === 'ok') return row._ok ? 1 : 0;
  if (key === 'rh') return row._rhLabel || '';
  if (key === 'funcao_rh') return String(row._rhFuncao || '').toLowerCase();
  if (key === 'correcao') return (row._correcao?.resumo || '').toLowerCase();
  if (key === 'matricula' || key === 'codigo_orgao' || key === 'cpf') {
    return String(row[key] ?? '');
  }
  if (key === 'admissao' || key === 'demissao') return String(row[key] || '');
  return String(row[key] ?? '').toLowerCase();
}

function giapFolhaAplicarFiltro() {
  const q = giapNormNome(_giapFolha.busca);
  const acao = _giapFolha.filtroAcao || '';
  const escopo = _giapFolha.escopoOrgao || 'semcas';
  _giapFolha.filtered = _giapFolha.rows.filter((r) => {
    // Padrão: SEMCAS + outras secs que casaram com alguém do RH (mat. ou cedido)
    if (escopo === 'semcas') {
      if (r._outraSecretaria && !r._ok) return false;
    }
    if (q) {
      const blob = giapNormNome([
        r.funcionario,
        r.matricula,
        r.lotacao,
        r.codigo_orgao,
        r.cargo_origem,
        r._rhFuncao,
        r.cpf,
        r._rhLabel,
        r._correcao?.resumo
      ].join(' '));
      if (!blob.includes(q)) return false;
    }
    if (!acao) return true;
    const c = r._correcao || giapFolhaDetectarCorrecoes(r);
    if (acao === 'precisa') return !!c.precisa;
    if (acao === 'alinhado') return !!c.alinhado;
    if (acao === 'cpf') return !!c.cpfFalta;
    if (acao === 'sem_vinculo') return !!c.sem_vinculo;
    return (c.tipos || []).includes(acao);
  });
}

function giapFolhaAplicarSort() {
  const { sortKey, sortDir } = _giapFolha;
  const mult = sortDir === 'desc' ? -1 : 1;
  _giapFolha.filtered.sort((a, b) => {
    const va = giapFolhaSortValor(a, sortKey);
    const vb = giapFolhaSortValor(b, sortKey);
    if (va < vb) return -1 * mult;
    if (va > vb) return 1 * mult;
    return 0;
  });
}

function giapFolhaPintarCabecalhos() {
  document.querySelectorAll('#table-giap-folha th[data-giap-sort]').forEach((th) => {
    const key = th.getAttribute('data-giap-sort');
    const base = th.textContent.replace(/\s*[▲▼]\s*$/, '').trim();
    if (key === _giapFolha.sortKey) {
      th.textContent = base + (_giapFolha.sortDir === 'desc' ? ' ▼' : ' ▲');
    } else {
      th.textContent = base;
    }
  });
}

function giapFolhaRenderPagina() {
  const tbody = $('tbody-giap-folha');
  if (!tbody) return;
  const { filtered, page, pageSize, rows } = _giapFolha;
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
  if (_giapFolha.page > pages) _giapFolha.page = pages;
  const p = _giapFolha.page;
  const start = (p - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="13" class="empty-state">Nenhum registro em folha_pmsl${_giapFolha.competencia ? ` para ${_giapFolha.competencia}` : ''}. Use “Buscar e gravar folha”.</td></tr>`;
  } else if (!total) {
    tbody.innerHTML = `<tr><td colspan="13" class="empty-state">Nenhum resultado para o filtro atual.</td></tr>`;
  } else {
    tbody.innerHTML = slice.map((r) => {
      const badge = r._ok
        ? '<span style="background:var(--gov-green,#2f855a);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">OK</span>'
        : '<span style="background:#cbd5e0;color:#4a5568;padding:2px 8px;border-radius:4px;font-size:11px">—</span>';
      const mat = r.matricula != null ? String(r.matricula).trim() : '';
      const nomeExibido = giapNomeTitulo(r.funcionario) || r.funcionario || '—';
      const nomeRh = r._rhNome || nomeExibido;
      const nomeHtml = r._rhId
        ? `<a
             href="index.html#funcionarios/busca/${htmlEscape(encodeURIComponent(nomeRh))}"
             target="_blank"
             rel="noopener"
             title="Abrir este servidor em Funcionários"
             style="color:var(--gov-blue-primary);text-decoration:underline;text-underline-offset:2px"
           >${htmlEscape(nomeExibido)}</a>`
        : htmlEscape(nomeExibido);
      return `<tr>
        <td style="text-align:center">${badge}</td>
        <td style="font-family:monospace;font-size:12px">${htmlEscape(mat || '—')}</td>
        <td style="font-weight:600">${nomeHtml}</td>
        <td>${htmlEscape(r.lotacao || '—')}</td>
        <td>${htmlEscape(r.codigo_orgao != null ? String(r.codigo_orgao) : '—')}</td>
        <td style="font-size:12px">${giapFolhaFmtDt(r.admissao)}</td>
        <td style="font-size:12px;${r.demissao ? 'color:var(--gov-orange,#c05621);font-weight:600' : ''}">${giapFolhaFmtDt(r.demissao)}</td>
        <td style="font-size:12px">${htmlEscape(r.cargo_origem || '—')}</td>
        <td style="font-size:12px;color:var(--gov-blue-dark)">${htmlEscape(r._rhFuncao || '—')}</td>
        <td style="font-family:monospace;font-size:11px">${htmlEscape(r.cpf || '—')}</td>
        <td style="font-size:12px">${r._rhLabel}</td>
        <td style="text-align:center">${giapFolhaHtmlCorrecao(r)}</td>
        <td style="text-align:center">${giapFolhaHtmlAcoes(r)}</td>
      </tr>`;
    }).join('');
  }

  giapFolhaPintarCabecalhos();
  if ($('giap-folha-count')) {
    const precisa = _giapFolha.rows.filter((r) => r._correcao?.precisa).length;
    const partes = [`${rows.length} registro(s)`, `${_giapFolha.okCount} OK no RH`, `${precisa} com correção`];
    if (_giapFolha.busca || _giapFolha.filtroAcao) {
      partes.push(`filtro: ${total}/${rows.length}`);
    }
    partes.push(`competência ${_giapFolha.competencia}`);
    $('giap-folha-count').textContent = partes.join(' · ');
  }
  if ($('giap-folha-pager-info')) {
    const de = total ? start + 1 : 0;
    const ate = Math.min(start + pageSize, total);
    $('giap-folha-pager-info').textContent = total
      ? `Exibindo ${de}–${ate} de ${total}`
      : 'Sem registros';
  }
  if ($('giap-folha-page-num')) {
    $('giap-folha-page-num').textContent = `${p} / ${pages}`;
  }
}

window.giapFolhaFiltrarTexto = function giapFolhaFiltrarTexto(valor) {
  _giapFolha.busca = String(valor || '');
  _giapFolha.page = 1;
  giapFolhaAplicarFiltro();
  giapFolhaAplicarSort();
  giapFolhaRenderPagina();
};

window.giapFolhaFiltrarAcao = function giapFolhaFiltrarAcao(valor) {
  _giapFolha.filtroAcao = String(valor || '');
  _giapFolha.page = 1;
  giapFolhaAplicarFiltro();
  giapFolhaAplicarSort();
  giapFolhaRenderPagina();
};

window.giapFolhaFiltrarEscopo = function giapFolhaFiltrarEscopo(valor) {
  _giapFolha.escopoOrgao = String(valor || 'semcas');
  _giapFolha.page = 1;
  giapFolhaAplicarFiltro();
  giapFolhaAplicarSort();
  giapFolhaRenderPagina();
};

window.giapPuxarNomeApi = async function giapPuxarNomeApi() {
  const bruto = String($('giap-folha-busca')?.value || '').trim();

  // Sem nome digitado → puxa automaticamente a lista de Cedidos/Recebidos
  if (!bruto) {
    return window.giapPuxarCedidos();
  }

  const soMat = /^\d{5,}$/.test(bruto.replace(/\D/g, '')) && bruto.replace(/\D/g, '').length >= 5
    ? bruto.replace(/\D/g, '')
    : '';
  const nome = soMat ? '' : bruto;

  if (!soMat && nome.split(/\s+/).length < 2) {
    return showToast('Digite o nome completo (pelo menos 2 palavras), a matrícula, ou deixe em branco para Cedidos/Recebidos.', 'error');
  }
  const btn = $('giap-btn-puxar-nome');
  if (btn) btn.disabled = true;
  try {
    const competencia = Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
    let matricula = soMat || undefined;
    let nomeBusca = nome;

    // Resolve no RH: matrícula + nome oficiais (evita puxar sem mat e perder o registro)
    try {
      let rh = null;
      if (matricula) {
        const mk = giapMatKey(matricula);
        for (let from = 0; ; from += 1000) {
          const { data, error } = await sb.from('funcionarios')
            .select('id, nome, matricula')
            .not('matricula', 'is', null)
            .range(from, from + 999);
          if (error) throw error;
          rh = (data || []).find((f) => giapMatKey(f.matricula) === mk) || null;
          if (rh || !data || data.length < 1000) break;
        }
      }
      if (!rh && nomeBusca) {
        const naFila = (_giapFaltando.rows || []).find(
          (r) => giapNomesCompativeis(r.nome, nomeBusca)
        );
        if (naFila?.matricula) {
          matricula = String(naFila.matricula).trim();
          nomeBusca = naFila.nome || nomeBusca;
        } else {
          const termo = nomeBusca.split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
          const { data } = await sb.from('funcionarios')
            .select('id, nome, matricula')
            .eq('ativo', true)
            .ilike('nome', `%${termo}%`)
            .limit(50);
          const hits = (data || []).filter((f) => giapNomesCompativeis(f.nome, nomeBusca));
          if (hits.length === 1) rh = hits[0];
          else if (hits.length > 1) {
            const exact = hits.find((f) => giapNormNome(f.nome) === giapNormNome(nomeBusca));
            rh = exact || hits[0];
          }
        }
      }
      if (rh) {
        if (rh.matricula) matricula = String(rh.matricula).trim();
        if (rh.nome) nomeBusca = rh.nome;
      }
      if (!matricula && nomeBusca) {
        const { data: ceds } = await sb.from('v_cedencias_atuais')
          .select('matricula, nome')
          .limit(3000);
        const hit = (ceds || []).find((c) => giapNomesCompativeis(c.nome, nomeBusca));
        if (hit?.matricula) matricula = hit.matricula;
      }
    } catch (_) { /* ok */ }

    if (!nomeBusca) {
      return showToast('Matrícula sem nome no RH — digite o nome completo para buscar no GIAP.', 'error');
    }

    showToast(
      `Buscando “${nomeBusca}”${matricula ? ` (mat. ${matricula})` : ''} no GIAP…`,
      'info'
    );
    const data = await giapProxy('sync_nome', {
      nomeServidor: nomeBusca,
      competencia,
      matricula: matricula || undefined
    });
    const enc = data.registros_encontrados || 0;
    const fil = data.registros_filtrados || 0;
    const ins = data.registros_inseridos || 0;
    if (ins === 0 && fil === 0) {
      showToast(
        enc > 0
          ? `Portal achou ${enc}, mas nenhum passou no filtro (órgão/nome). Mat. RH: ${matricula || '—'}.`
          : `Portal não retornou ninguém para “${nomeBusca}” na competência ${competencia}.`,
        'info'
      );
    } else {
      showToast(`OK: ${ins} gravado(s) · ${fil} filtrado(s) · ${enc} no portal.`, 'success');
      await sincronizarRemuneracoesGiap({ competencia, silencioso: true });
    }
    await giapCarregarFolhaTabela();
    // Filtra pela matrícula (mais confiável que o nome digitado)
    const buscaUi = matricula || nomeBusca;
    if ($('giap-folha-busca')) $('giap-folha-busca').value = buscaUi;
    giapFolhaFiltrarTexto(buscaUi);
  } catch (e) {
    showToast(e.message || String(e), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.giapFolhaOrdenar = function giapFolhaOrdenar(key) {
  if (_giapFolha.sortKey === key) {
    _giapFolha.sortDir = _giapFolha.sortDir === 'desc' ? 'asc' : 'desc';
  } else {
    _giapFolha.sortKey = key;
    _giapFolha.sortDir = 'desc';
  }
  _giapFolha.page = 1;
  giapFolhaAplicarSort();
  giapFolhaRenderPagina();
};

window.giapFolhaPagina = function giapFolhaPagina(delta) {
  const pages = Math.max(1, Math.ceil(_giapFolha.filtered.length / _giapFolha.pageSize) || 1);
  _giapFolha.page = Math.min(pages, Math.max(1, _giapFolha.page + delta));
  giapFolhaRenderPagina();
};

window.giapFolhaMudarPageSize = function giapFolhaMudarPageSize(v) {
  _giapFolha.pageSize = Math.max(10, Number(v) || 50);
  _giapFolha.page = 1;
  giapFolhaRenderPagina();
};

const _giapRhMaps = { at: 0, funcs: null, funcoesRh: null, cedencias: null };
const GIAP_RH_TTL_MS = 5 * 60 * 1000;

function giapInvalidarMapaRh() {
  _giapRhMaps.at = 0;
  _giapRhMaps.funcs = null;
  _giapRhMaps.funcoesRh = null;
  _giapRhMaps.cedencias = null;
}

async function giapGarantirMapaRh(force = false) {
  const fresco = !force
    && _giapRhMaps.funcs
    && (Date.now() - _giapRhMaps.at) < GIAP_RH_TTL_MS;
  if (fresco) return _giapRhMaps;

  const [funcs, cedencias, funcoesRh] = await Promise.all([
    (async () => {
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error: e } = await sb.from('funcionarios')
          .select('id, nome, matricula, data_admissao, cpf, ativo')
          .range(from, from + 999);
        if (e) throw e;
        if (data?.length) all.push(...data);
        if (!data || data.length < 1000) break;
      }
      return all;
    })(),
    (async () => {
      try {
        const { data } = await sb.from('v_cedencias_atuais')
          .select('funcionario_id, matricula')
          .limit(3000);
        return data || [];
      } catch (_) {
        return [];
      }
    })(),
    (async () => {
      try {
        const all = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await sb.from('v_funcionarios_atual')
            .select('funcionario_id, funcao')
            .range(from, from + 999);
          if (error) throw error;
          if (data?.length) all.push(...data);
          if (!data || data.length < 1000) break;
        }
        return all;
      } catch (_) {
        return [];
      }
    })()
  ]);
  _giapRhMaps.funcs = funcs;
  _giapRhMaps.cedencias = cedencias;
  _giapRhMaps.funcoesRh = funcoesRh;
  _giapRhMaps.at = Date.now();
  return _giapRhMaps;
}

async function giapCarregarFolhaTabela() {
  const tbody = $('tbody-giap-folha');
  if (!tbody) return;
  const comp = Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
  tbody.innerHTML = '<tr><td colspan="13" class="empty-state"><span class="spinner"></span> Carregando…</td></tr>';
  try {
    const [folha, rhMaps] = await Promise.all([
      (async () => {
        const all = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await sb.from('folha_pmsl')
            .select('matricula, funcionario, lotacao, codigo_orgao, admissao, demissao, cargo_origem, cpf, competencia')
            .eq('competencia', comp)
            .order('funcionario')
            .range(from, from + 999);
          if (error) throw error;
          if (data?.length) all.push(...data);
          if (!data || data.length < 1000) break;
        }
        return all;
      })(),
      giapGarantirMapaRh(false)
    ]);
    const funcs = rhMaps.funcs || [];
    const cedencias = rhMaps.cedencias || [];
    const funcoesRh = rhMaps.funcoesRh || [];

    const cedIds = new Set();
    const cedMats = new Set();
    for (const c of cedencias) {
      if (c.funcionario_id) cedIds.add(c.funcionario_id);
      const mk = giapMatKey(c.matricula);
      if (mk) cedMats.add(mk);
    }

    const funcaoPorId = new Map();
    for (const f of funcoesRh || []) {
      if (f.funcionario_id != null) {
        funcaoPorId.set(f.funcionario_id, (f.funcao || '').trim() || null);
      }
    }

    const porMat = new Map();
    const funcsAtivos = [];
    for (const f of funcs) {
      const mk = giapMatKey(f.matricula);
      if (mk) porMat.set(mk, f);
      funcsAtivos.push(f);
    }

    let okCount = 0;
    const rows = (folha || []).map((r, index) => {
      const mat = r.matricula != null ? String(r.matricula).trim() : '';
      const matKey = giapMatKey(mat);
      const folhaSemcas = giapEhFolhaSemcas(r);
      let rh = matKey ? porMat.get(matKey) : null;

      // Match por matrícula: SEMPRE vale (é a mesma pessoa no RH, mesmo se o GIAP
      // marcar outro órgão/lotação — senão gente como Jurandy some da lista).
      // Match só por nome: SEMCAS livre; outra secretaria só Cedidos/Recebidos.
      if (!rh) {
        let cands = funcsAtivos.filter(
          (c) => c.ativo !== false && giapNomesCompativeis(r.funcionario, c.nome)
        );
        if (!folhaSemcas) {
          cands = cands.filter(
            (c) => cedIds.has(c.id) || cedMats.has(giapMatKey(c.matricula))
          );
        }
        if (cands.length === 1) rh = cands[0];
        else if (!cands.length) {
          let candsAll = funcsAtivos.filter((c) => giapNomesCompativeis(r.funcionario, c.nome));
          if (!folhaSemcas) {
            candsAll = candsAll.filter(
              (c) => cedIds.has(c.id) || cedMats.has(giapMatKey(c.matricula))
            );
          }
          if (candsAll.length === 1) rh = candsAll[0];
        }
      }

      const ok = !!rh;
      if (ok) okCount++;
      const rhFuncao = rh ? (funcaoPorId.get(rh.id) || null) : null;
      const row = {
        ...r,
        _rowKey: `${comp}:${matKey || 'sem-mat'}:${giapNormNome(r.funcionario)}:${index}`,
        _ok: ok,
        _folhaSemcas: folhaSemcas,
        _outraSecretaria: !folhaSemcas,
        _rhId: rh?.id || null,
        _rhNome: rh?.nome || null,
        _rhMatricula: rh?.matricula || null,
        _rhAdmissao: rh?.data_admissao || null,
        _rhCpf: rh?.cpf || null,
        _rhFuncao: rhFuncao,
        _rhLabel: rh
          ? `${htmlEscape(rh.nome || '')}${rh.matricula ? ` · ${htmlEscape(String(rh.matricula))}` : ' · s/ mat.'}${rh.ativo === false ? ' · inativo' : ''}`
          : (folhaSemcas ? '—' : `<span style="color:#c05621;font-size:11px">Outra sec. (não cedido)</span>`)
      };
      row._correcao = giapFolhaDetectarCorrecoes(row);
      return row;
    });

    _giapFolha.rows = rows;
    _giapFolha.okCount = okCount;
    _giapFolha.competencia = comp;
    _giapFolha.page = 1;
    if ($('giap-folha-page-size')) {
      _giapFolha.pageSize = Number($('giap-folha-page-size').value) || 50;
    }
    if ($('giap-folha-busca')) {
      _giapFolha.busca = $('giap-folha-busca').value || '';
    }
    if ($('giap-folha-filtro-acao')) {
      _giapFolha.filtroAcao = $('giap-folha-filtro-acao').value || '';
    }
    if ($('giap-folha-escopo')) {
      _giapFolha.escopoOrgao = $('giap-folha-escopo').value || 'semcas';
    }
    giapFolhaAplicarFiltro();
    giapFolhaAplicarSort();
    giapFolhaRenderPagina();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="13" class="empty-state">Erro: ${htmlEscape(e.message || e)}</td></tr>`;
  }
}

window.giapAdicionarServidor = async function giapAdicionarServidor(rowKey) {
  const r = giapFolhaFindRowByKey(rowKey);
  if (!r) return showToast('Registro GIAP não encontrado. Atualize a página e tente novamente.', 'error');

  const nome = giapNomeTitulo(r.funcionario) || String(r.funcionario || '').trim();
  const matricula = String(r.matricula || '').trim();
  if (!nome) return showToast('O registro GIAP não possui nome para cadastrar.', 'warning');

  try {
    const duplicado = await buscarFuncionarioDuplicado({
      nome,
      matricula,
      cpf: String(r.cpf || '').trim()
    });
    if (duplicado) {
      giapInvalidarMapaRh();
      await giapCarregarFolhaTabela();
      return showToast(
        `${duplicado.nome} já existe no sistema${duplicado.matricula ? ` (matrícula ${duplicado.matricula})` : ''}${duplicado.ativo === false ? ' e está inativo' : ''}. Cadastro não aberto.`,
        'warning'
      );
    }

    abrirModalAddFuncionario();
    window._addFuncionarioOrigemGiap = true;
    $('add-nome').value = nome;
    $('add-matricula').value = matricula;
    $('add-cpf').value = String(r.cpf || '').trim();
    $('add-admissao').value = giapDataISO(r.admissao);
    $('add-funcao').value = String(r.cargo_origem || '').trim();
    showToast('Dados do GIAP preenchidos. Informe Lotação e Vínculo para concluir.', 'info');
  } catch (e) {
    showToast('Erro ao verificar matrícula e nome: ' + (e.message || e), 'error');
  }
};

async function giapMarcarCompetenciaBuscada(comp) {
  const c = Number(comp);
  if (!c) return;
  try {
    const { data: cfg } = await sb.from('giap_config').select('competencias_buscadas').eq('id', 1).maybeSingle();
    const lista = Array.isArray(cfg?.competencias_buscadas) ? [...cfg.competencias_buscadas] : [];
    if (!lista.includes(c)) lista.push(c);
    lista.sort((a, b) => b - a);
    await sb.from('giap_config').upsert({
      id: 1,
      competencias_buscadas: lista.slice(0, 36),
      updated_at: new Date().toISOString()
    });
  } catch (_) { /* coluna pode faltar até rodar o SQL */ }
}

function giapPintarBadgeCompetencia(cfg) {
  const el = $('giap-comp-badge');
  if (!el) return;
  const comp = Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
  const lista = Array.isArray(cfg?.competencias_buscadas) ? cfg.competencias_buscadas : [];
  if (lista.map(Number).includes(comp)) {
    el.textContent = `Competência ${comp}: buscas já gravadas`;
    el.style.background = '#c6f6d5';
    el.style.color = '#22543d';
  } else {
    el.textContent = `Competência ${comp}: ainda sem busca gravada`;
    el.style.background = '#feebc8';
    el.style.color = '#7b341e';
  }
}

window.giapAplicarMatricula = async function giapAplicarMatricula(mat) {
  const r = giapFolhaFindRow(mat);
  if (!r?._rhId || !mat) return showToast('Sem match RH para aplicar matrícula.', 'error');
  if (!confirm(`Cadastrar/corrigir matrícula ${mat} em “${r._rhNome}”?`)) return;
  try {
    const { error } = await sb.from('funcionarios').update({ matricula: String(mat).trim() }).eq('id', r._rhId);
    if (error) throw error;
    await registrarLog('GIAP — MATRÍCULA', r._rhId, r._rhNome, { matricula: String(mat).trim(), competencia: r.competencia });
    showToast('Matrícula gravada no RH.', 'success');
    gsInvalidarCache();
    await giapCarregarFolhaTabela();
  } catch (e) {
    showToast(e.message || String(e), 'error');
  }
};

window.giapAplicarNome = async function giapAplicarNome(mat) {
  const r = giapFolhaFindRow(mat);
  if (!r?._rhId || !r.funcionario) return showToast('Sem match RH para corrigir nome.', 'error');
  const nomePadrao = giapNomeTitulo(r.funcionario);
  if (!confirm(`Corrigir nome no RH?\n\nDe: ${r._rhNome}\nPara: ${nomePadrao}`)) return;
  try {
    const { error } = await sb.from('funcionarios').update({ nome: nomePadrao }).eq('id', r._rhId);
    if (error) throw error;
    await registrarLog('GIAP — NOME', r._rhId, nomePadrao, { antes: r._rhNome, depois: nomePadrao });
    showToast('Nome corrigido no RH (padrão do sistema).', 'success');
    gsInvalidarCache();
    await giapCarregarFolhaTabela();
  } catch (e) {
    showToast(e.message || String(e), 'error');
  }
};

window.giapAplicarAdmissao = async function giapAplicarAdmissao(mat) {
  const r = giapFolhaFindRow(mat);
  const iso = giapDataISO(r?.admissao);
  if (!r?._rhId || !iso) return showToast('Sem data de admissão no GIAP.', 'error');
  if (!confirm(`Corrigir data de admissão de “${r._rhNome}”?\n\nRH: ${giapFolhaFmtDt(r._rhAdmissao)}\nGIAP: ${giapFolhaFmtDt(iso)}`)) return;
  try {
    const { error } = await sb.from('funcionarios').update({ data_admissao: iso }).eq('id', r._rhId);
    if (error) throw error;
    await registrarLog('GIAP — ADMISSÃO', r._rhId, r._rhNome, {
      antes: r._rhAdmissao,
      depois: iso,
      competencia: r.competencia
    });
    showToast('Data de admissão corrigida.', 'success');
    gsInvalidarCache();
    await giapCarregarFolhaTabela();
  } catch (e) {
    showToast(e.message || String(e), 'error');
  }
};

window.giapAplicarCpf = async function giapAplicarCpf(mat) {
  const r = giapFolhaFindRow(mat);
  const dig = soDigitos(r?.cpf);
  if (!r?._rhId || dig.length !== 11 || !cpfValido(dig)) {
    return showToast('CPF do GIAP inválido ou sem match RH.', 'error');
  }
  if (soDigitos(r._rhCpf).length === 11) {
    return showToast('Este servidor já tem CPF no RH — não sobrescreve.', 'info');
  }
  const formatado = mascaraCPF(dig);
  if (!confirm(`Preencher CPF de “${r._rhNome}” com ${formatado}?`)) return;
  try {
    // Evita duplicar CPF em outro cadastro
    const { data: conflito } = await sb.from('funcionarios')
      .select('id, nome')
      .neq('id', r._rhId)
      .or(`cpf.eq.${formatado},cpf.eq.${dig}`)
      .limit(1);
    if (conflito?.length) {
      return showToast(`CPF já usado por: ${conflito[0].nome}`, 'error');
    }
    const { error } = await sb.from('funcionarios').update({ cpf: formatado }).eq('id', r._rhId);
    if (error) throw error;
    await registrarLog('GIAP — CPF', r._rhId, r._rhNome, { cpf: formatado, competencia: r.competencia });
    showToast('CPF gravado no cadastro do RH.', 'success');
    gsInvalidarCache();
    await giapCarregarFolhaTabela();
  } catch (e) {
    showToast(e.message || String(e), 'error');
  }
};

/** Em lote: alinhados (ou qualquer match) sem CPF no RH, com CPF válido no GIAP. */
window.giapAlimentarCpfsAlinhados = async function giapAlimentarCpfsAlinhados() {
  // Só quem já está Alinhado (mat/nome/admissão OK) e sem CPF no RH
  const alvos = (_giapFolha.rows || []).filter((r) => {
    const c = r._correcao || giapFolhaDetectarCorrecoes(r);
    return r._ok && c.alinhado && c.cpfFalta && r._rhId;
  });
  if (!alvos.length) {
    return showToast('Nenhum alinhado sem CPF para alimentar.', 'info');
  }
  if (!confirm(
    `Alimentar CPF de ${alvos.length} servidor(es) alinhado(s) que estão sem CPF no RH?\n\n` +
    `Só preenche quem ainda não tem CPF (não sobrescreve).`
  )) return;

  const btn = $('giap-btn-alimentar-cpf');
  if (btn) btn.disabled = true;
  let ok = 0;
  let skip = 0;
  let erro = 0;
  try {
    for (const r of alvos) {
      const dig = soDigitos(r.cpf);
      if (dig.length !== 11 || !cpfValido(dig)) { skip++; continue; }
      if (soDigitos(r._rhCpf).length === 11) { skip++; continue; }
      const formatado = mascaraCPF(dig);
      try {
        const { data: conflito } = await sb.from('funcionarios')
          .select('id')
          .neq('id', r._rhId)
          .or(`cpf.eq.${formatado},cpf.eq.${dig}`)
          .limit(1);
        if (conflito?.length) { skip++; continue; }
        const { error } = await sb.from('funcionarios').update({ cpf: formatado }).eq('id', r._rhId);
        if (error) throw error;
        await registrarLog('GIAP — CPF (lote)', r._rhId, r._rhNome, { cpf: formatado });
        ok++;
      } catch (e) {
        console.warn('[GIAP] CPF', r._rhNome, e);
        erro++;
      }
    }
    showToast(`CPFs: ${ok} gravado(s), ${skip} ignorado(s), ${erro} erro(s).`, erro ? 'info' : 'success');
    gsInvalidarCache();
    await giapCarregarFolhaTabela();
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.giapAplicarExoneracao = async function giapAplicarExoneracao(mat) {
  const r = giapFolhaFindRow(mat);
  if (!r?._rhId) return showToast('Sem match RH.', 'error');
  const dataExo = giapDataISO(r.demissao) || new Date().toISOString().slice(0, 10);
  const ok = confirm(
    `Enviar “${r._rhNome}” para o menu Exonerados?\n\n` +
    `Data GIAP: ${giapFolhaFmtDt(dataExo)}\n\n` +
    `Atenção: se a pessoa reaparecer em outro cargo no mês seguinte, NÃO use esta ação — a demissão no GIAP de um mês não significa exoneração definitiva.`
  );
  if (!ok) return;
  try {
    const { error } = await sb.rpc('fn_exonerar_funcionario', {
      p_funcionario_id: r._rhId,
      p_data_exoneracao: dataExo,
      p_motivo: `Manual via Relatório API GIAP (competência ${r.competencia})`
    });
    if (error) throw error;
    await registrarLog('GIAP — EXONERAÇÃO MANUAL', r._rhId, r._rhNome, {
      data_exoneracao: dataExo,
      competencia: r.competencia
    });
    showToast('Servidor enviado para Exonerados.', 'success');
    gsInvalidarCache();
    atualizarBadgesSemLotacaoExonerados();
    await giapCarregarFolhaTabela();
  } catch (e) {
    showToast(e.message || String(e), 'error');
  }
};

function giapBindBotoes() {
  const run = $('giap-btn-run');
  if (run && !run.dataset.giapBound) {
    run.dataset.giapBound = '1';
    run.addEventListener('click', (e) => {
      e.preventDefault();
      window.giapRodarCiclo();
    });
  }
  const dem = $('giap-btn-demissao');
  if (dem && !dem.dataset.giapBound) {
    dem.dataset.giapBound = '1';
    dem.addEventListener('click', (e) => {
      e.preventDefault();
      window.giapBuscarDemissoes();
    });
  }
}

/** Remove da folha_pmsl outras secretarias — mantém SEMCAS, Cedidos e matrículas do RH. */
async function giapLimparFolhaNaoSemcas() {
  const ids = [];
  try {
    const matsManter = new Set();
    try {
      const { data: ceds } = await sb.from('v_cedencias_atuais')
        .select('matricula')
        .limit(3000);
      for (const c of ceds || []) {
        const mk = giapMatKey(c.matricula);
        if (mk) matsManter.add(mk);
      }
    } catch (_) { /* ok */ }
    // Quem já está no cadastro Funcionários: não apagar mesmo se o GIAP vier com outro órgão
    try {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('funcionarios')
          .select('matricula')
          .not('matricula', 'is', null)
          .range(from, from + 999);
        if (error) throw error;
        for (const f of data || []) {
          const mk = giapMatKey(f.matricula);
          if (mk) matsManter.add(mk);
        }
        if (!data || data.length < 1000) break;
      }
    } catch (_) { /* ok */ }

    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('folha_pmsl')
        .select('id, lotacao, codigo_orgao, matricula')
        .range(from, from + 999);
      if (error) throw error;
      for (const r of data || []) {
        const semcas =
          String(r.lotacao || '').toUpperCase().trim() === 'SEMCAS' ||
          String(r.codigo_orgao ?? '').trim() === '9';
        if (semcas) continue;
        if (matsManter.has(giapMatKey(r.matricula))) continue;
        ids.push(r.id);
      }
      if (!data || data.length < 1000) break;
    }
    if (!ids.length) return 0;

    let apagados = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error, count } = await sb.from('folha_pmsl')
        .delete({ count: 'exact' })
        .in('id', chunk);
      if (error) throw error;
      apagados += count ?? chunk.length;
    }
    return apagados;
  } catch (e) {
    console.error('[GIAP] limpar não-SEMCAS:', e);
    showToast('Falha ao limpar outras secretarias: ' + (e.message || e), 'error');
    return 0;
  }
}

window.giapLimparFolhaNaoSemcas = giapLimparFolhaNaoSemcas;

async function renderRelatorioApi() {
  if (!usuarioEhCoordenador()) {
    location.hash = '#painel';
    return;
  }
  giapBindBotoes();

  const nLimpou = await giapLimparFolhaNaoSemcas();
  if (nLimpou > 0) {
    showToast(
      `Removidos ${nLimpou} registro(s) de outras secretarias (não cedidos). SEMCAS e Cedidos/Recebidos foram mantidos.`,
      'info'
    );
  }

  await giapAtualizarBadges();

  const kpisEl = $('giap-kpis');
  try {
    const comp = Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
    const { data: view } = await sb.from('v_giap_relatorio').select('*').maybeSingle();
    const { count: ativos } = await sb.from('funcionarios').select('id', { count: 'exact', head: true }).eq('ativo', true);
    let semMatricula = view?.sem_matricula;
    if (semMatricula == null) {
      const { data: all } = await sb.from('funcionarios').select('matricula').eq('ativo', true);
      semMatricula = (all || []).filter(f => !f.matricula || !String(f.matricula).trim()).length;
    }
    const { count: naFolha } = await sb.from('folha_pmsl')
      .select('id', { count: 'exact', head: true })
      .eq('competencia', comp);
    const pct = view?.ultimo_progresso ?? 0;
    if (kpisEl) {
      kpisEl.innerHTML = [
        ['Ativos no RH', ativos ?? view?.total_ativos ?? '—', 'Servidores ativos', 'var(--gov-blue-primary)'],
        ['Sem matrícula', semMatricula ?? '—', 'Prioridade na busca por nome', 'var(--gov-orange,#ed8936)'],
        ['Folha GIAP', naFolha ?? 0, `Competência ${comp}`, 'var(--gov-yellow,#d69e2e)'],
        ['Último progresso', `${pct ?? 0}%`, view?.ultimo_status || 'sem job', 'var(--gov-green)'],
      ].map(([lbl, val, sub, cor]) => `
        <div class="stat" style="border-left-color:${cor}">
          <div class="stat-lbl">${lbl}</div>
          <div class="stat-val">${val}</div>
          <div class="stat-sub">${sub}</div>
        </div>`).join('');
    }
  } catch (e) {
    if (kpisEl) {
      kpisEl.innerHTML = `<div class="stat"><div class="stat-lbl">Aviso</div><div class="stat-sub">Rode sql/giap_relatorio_api.sql no Supabase. ${htmlEscape(e.message || '')}</div></div>`;
    }
  }

  try {
    const { data: cfg } = await sb.from('giap_config').select('*').eq('id', 1).maybeSingle();
    if ($('giap-cfg-auto')) $('giap-cfg-auto').checked = !!cfg?.automatico;
    if ($('giap-cfg-dia')) $('giap-cfg-dia').value = cfg?.dia_mes ?? 27;
    if ($('giap-cfg-comp') && !$('giap-cfg-comp').value) {
      $('giap-cfg-comp').value = giapCompetenciaPadrao();
    }
    giapPintarBadgeCompetencia(cfg);
  } catch (_) { /* ok */ }

  if ($('giap-cfg-comp') && !$('giap-cfg-comp').dataset.giapBound) {
    $('giap-cfg-comp').dataset.giapBound = '1';
    $('giap-cfg-comp').addEventListener('change', async () => {
      try {
        const { data: cfg } = await sb.from('giap_config').select('competencias_buscadas').eq('id', 1).maybeSingle();
        giapPintarBadgeCompetencia(cfg);
      } catch (_) { giapPintarBadgeCompetencia(null); }
      await giapCarregarFolhaTabela();
      await giapCarregarFaltandoFolha();
    });
  }

  try {
    const { data: jobs } = await sb.from('giap_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    const job = jobs?.[0];
    if (job) {
      _giapJobId = job.id;
      giapPintarProgresso(job);
      if (job.status === 'running' || job.status === 'pending') giapIniciarPoll(job.id);
    }
  } catch (_) { /* ok */ }

  await giapCarregarFolhaTabela();
  await giapCarregarFaltandoFolha();
}

const _giapFaltando = {
  rows: [],
  page: 1,
  pageSize: 25,
  totalFora: 0,
  semMatricula: 0,
  comMatricula: 0
};

function giapMatKey(m) {
  if (m == null || m === '') return '';
  const raw = String(m).trim();
  const digits = raw.replace(/\D/g, '');
  const s = digits || raw;
  const stripped = s.replace(/^0+/, '');
  return stripped || '0';
}

/** Igual ao backend: JR/JUNIOR e partículas não atrapalham o match.
 *  Exige tamanho parecido — evita MARIA DA CONCEICAO × CONCEICAO DE MARIA ABREU… */
function giapNomesCompativeis(a, b) {
  const na = giapNormNome(a);
  const nb = giapNormNome(b);
  if (!na || !nb) return false;
  if (na.replace(/\s+/g, '') === nb.replace(/\s+/g, '')) return true;
  const ign = new Set(['JR', 'JUNIOR', 'FILHO', 'NETO', 'SOBRINHO', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'DI', 'DU']);
  const ta = na.split(' ').filter((t) => t && !ign.has(t));
  const tb = nb.split(' ').filter((t) => t && !ign.has(t));
  if (!ta.length || !tb.length) return false;
  const setA = new Set(ta);
  const setB = new Set(tb);
  const aInB = ta.every((t) => setB.has(t));
  const bInA = tb.every((t) => setA.has(t));
  if (!aInB && !bInA) return false;
  const menor = Math.min(ta.length, tb.length);
  const maior = Math.max(ta.length, tb.length);
  return menor / maior >= 0.75;
}

function giapEhFolhaSemcas(r) {
  return (
    String(r?.lotacao || '').toUpperCase().trim() === 'SEMCAS' ||
    String(r?.codigo_orgao ?? '') === '9'
  );
}

function giapFaltandoExcluido(vinculo) {
  const c = giapNormNome(vinculo || '');
  // Sem vínculo informado: inclui na vasculha (não esconde)
  if (!c) return false;
  if (c.includes('TERCEIRIZ') || c.includes('PROCAD') || c.includes('ESTAGI')) return true;
  return false;
}

function giapTemMatricula(m) {
  return !!giapMatKey(m);
}

function giapFaltandoRender() {
  const tbody = $('tbody-giap-faltando');
  if (!tbody) return;
  const { rows, page, pageSize } = _giapFaltando;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize) || 1);
  if (_giapFaltando.page > pages) _giapFaltando.page = pages;
  const p = _giapFaltando.page;
  const start = (p - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);

  const comp = _giapFolha.competencia || Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
  const { semMatricula, comMatricula, totalFora } = _giapFaltando;
  if ($('giap-faltando-count')) {
    $('giap-faltando-count').textContent =
      `${rows.length} faltando · competência ${comp}`;
  }
  const resumo = $('giap-faltando-resumo');
  if (resumo) {
    if (totalFora > 0) {
      resumo.style.display = '';
      resumo.style.background = '#fffaf0';
      resumo.style.borderColor = '#fbd38d';
      resumo.style.color = '#744210';
      resumo.innerHTML =
        `<strong>${totalFora} servidor(es)</strong> do RH ainda fora dos Resultados ` +
        `(<strong>${semMatricula}</strong> sem matrícula · <strong>${comMatricula}</strong> com matrícula). ` +
        `Competência <strong>${comp}</strong>.`;
    } else {
      resumo.style.display = '';
      resumo.style.background = '#f0fff4';
      resumo.style.borderColor = '#9ae6b4';
      resumo.style.color = '#276749';
      resumo.innerHTML = `Ninguém faltando na competência <strong>${comp}</strong> — todo o RH elegível já está na folha.`;
    }
  }
  if ($('giap-faltando-page')) {
    $('giap-faltando-page').textContent = `${p} / ${pages}`;
  }

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state" style="color:var(--gov-green);font-weight:600">Ninguém faltando: todo o RH elegível já está na folha sync.</td></tr>';
    return;
  }

  const fmt = (d) => {
    if (!d) return '—';
    const s = String(d).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, day] = s.split('-');
      return `${day}/${m}/${y}`;
    }
    return s;
  };

  tbody.innerHTML = slice.map((r) => {
    const nomeJs = JSON.stringify(r.nome || '');
    const matJs = JSON.stringify(r.matricula || '');
    return `<tr>
      <td style="font-family:monospace;font-size:12px">${htmlEscape(r.matricula || '—')}</td>
      <td style="font-weight:600">${htmlEscape(r.nome || '—')}</td>
      <td>${htmlEscape(r.vinculo || '—')}</td>
      <td style="font-size:12px">${fmt(r.data_admissao)}</td>
      <td style="text-align:center">
        <button type="button" class="btn-secondary" style="padding:4px 8px;font-size:12px"
          onclick='giapPuxarNomeDireto(${nomeJs}, ${matJs})'>Puxar</button>
      </td>
    </tr>`;
  }).join('');
}

window.giapVasculharFaltantes = async function giapVasculharFaltantes() {
  const cb = $('giap-fila-com-matricula');
  if (cb) cb.checked = true;
  showToast('Vasculhando RH × folha GIAP…', 'info');
  await giapCarregarFaltandoFolha();
  const { totalFora, semMatricula, comMatricula } = _giapFaltando;
  showToast(
    totalFora
      ? `Vasculha: ${totalFora} faltando (${semMatricula} s/ mat · ${comMatricula} c/ mat).`
      : 'Vasculha: ninguém faltando nesta competência.',
    totalFora ? 'info' : 'success'
  );
  const card = $('giap-card-fila-resultados');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.giapExportarFaltantesCsv = function giapExportarFaltantesCsv() {
  const rows = _giapFaltando.rows || [];
  if (!rows.length) return showToast('Nada para exportar — rode Vasculhar faltantes.', 'info');
  const comp = _giapFolha.competencia || Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    'matricula,nome,vinculo,data_admissao,competencia',
    ...rows.map((r) =>
      [r.matricula, r.nome, r.vinculo, r.data_admissao, comp].map(esc).join(',')
    )
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `giap_faltantes_${comp}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`CSV: ${rows.length} servidor(es) faltando.`, 'success');
};

window.giapFaltandoPagina = function giapFaltandoPagina(delta) {
  const pages = Math.max(1, Math.ceil(_giapFaltando.rows.length / _giapFaltando.pageSize) || 1);
  _giapFaltando.page = Math.min(pages, Math.max(1, _giapFaltando.page + delta));
  giapFaltandoRender();
};

window.giapPuxarNomeDireto = async function giapPuxarNomeDireto(nome, matricula) {
  const busca = (matricula && String(matricula).trim()) || nome;
  if ($('giap-folha-busca')) $('giap-folha-busca').value = busca;
  await giapPuxarNomeApi();
  await giapCarregarFaltandoFolha();
};

const _giapPuxarTodos = { rodando: false, parar: false };

window.giapPararPuxarTodos = function giapPararPuxarTodos() {
  _giapPuxarTodos.parar = true;
  const st = $('giap-puxar-todos-status');
  if (st) st.textContent = 'Parando após o nome atual…';
};

/** Puxa na API só quem está em Cedidos/Recebidos (pode ser outra secretaria). */
window.giapPuxarCedidos = async function giapPuxarCedidos() {
  if (_giapPuxarTodos.rodando) {
    return showToast('Já há um puxar em andamento. Use Parar se quiser interromper.', 'info');
  }

  let lista = [];
  try {
    const { data, error } = await sb.from('v_cedencias_atuais')
      .select('funcionario_id, nome, matricula, tipo, orgao_destino_origem')
      .limit(3000);
    if (error) throw error;
    lista = (data || []).filter((c) => (c.nome || '').trim().split(/\s+/).length >= 2);
  } catch (e) {
    return showToast('Erro ao ler Cedidos/Recebidos: ' + (e.message || e), 'error');
  }

  if (!lista.length) {
    return showToast('Nenhum Cedido/Recebido cadastrado no menu Cedidos.', 'info');
  }

  if (!confirm(
    `Puxar ${lista.length} Cedido(s)/Recebido(s) na API GIAP (1 a 1)?\n\n` +
    `Outras secretarias (SEMOSP etc.) são permitidas só para este grupo.\n` +
    `Pode demorar. Use Parar se precisar.`
  )) return;

  _giapPuxarTodos.rodando = true;
  _giapPuxarTodos.parar = false;
  const btn = $('giap-btn-puxar-cedidos');
  const btnParar = $('giap-btn-parar-puxar');
  const st = $('giap-puxar-todos-status');
  if (btn) btn.disabled = true;
  if (btnParar) btnParar.style.display = '';
  if (st) st.style.display = '';

  const competencia = Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
  let ok = 0;
  let vazio = 0;
  let erro = 0;
  const total = lista.length;

  try {
    for (let i = 0; i < lista.length; i++) {
      if (_giapPuxarTodos.parar) break;
      const c = lista[i];
      const nome = String(c.nome || '').trim();
      const pct = Math.round((i / total) * 100);
      giapPintarProgresso({
        id: null,
        progresso_pct: pct,
        status: 'running',
        competencia,
        meta: `Cedidos ${i + 1}/${total}`,
        etapa: nome,
        resumo: { etapa: `cedidos_${i + 1}/${total}`, nome, tipo: c.tipo, orgao: c.orgao_destino_origem, ok, vazio, erro }
      });
      if (st) {
        st.textContent = `${i + 1}/${total} · ${c.tipo || '—'} · ${nome} · ok ${ok} · vazio ${vazio} · erro ${erro}`;
      }

      try {
        const data = await giapProxy('sync_nome', {
          nomeServidor: nome,
          competencia,
          matricula: c.matricula || undefined
        });
        if ((data.registros_inseridos || 0) === 0 && (data.registros_filtrados || 0) === 0) {
          vazio++;
        } else {
          ok++;
        }
      } catch (e) {
        erro++;
        console.warn('[GIAP] puxar cedidos', nome, e.message || e);
        await new Promise((r) => setTimeout(r, 3000));
      }

      if ((i + 1) % 5 === 0 || i === lista.length - 1) {
        await giapCarregarFolhaTabela();
      }
      await new Promise((r) => setTimeout(r, 800));
    }

    const msg = _giapPuxarTodos.parar
      ? `Parado. Cedidos: ok ${ok}, vazio ${vazio}, erro ${erro} de ${total}.`
      : `Cedidos concluído. ok ${ok}, vazio ${vazio}, erro ${erro} de ${total}.`;
    showToast(msg, erro ? 'info' : 'success');
    giapPintarProgresso({
      id: null,
      progresso_pct: 100,
      status: _giapPuxarTodos.parar ? 'cancelled' : 'done',
      competencia,
      meta: 'Puxar Cedidos/Recebidos',
      resumo: { ok, vazio, erro, total, parado: _giapPuxarTodos.parar }
    });
    if (st) st.textContent = msg;
    await giapCarregarFolhaTabela();
    if (ok > 0) await sincronizarRemuneracoesGiap({ competencia, silencioso: true });
  } finally {
    _giapPuxarTodos.rodando = false;
    _giapPuxarTodos.parar = false;
    if (btn) btn.disabled = false;
    if (btnParar) btnParar.style.display = 'none';
  }
};

window.giapPuxarTodosFaltando = async function giapPuxarTodosFaltando() {
  return window.giapPuxarTodosVasculha({ origem: 'completar' });
};

/**
 * Puxa a Vasculha (RH fora dos Resultados) em lotes — respeita limite do Render free.
 * @param {{ origem?: string }} [opts]
 */
window.giapPuxarTodosVasculha = async function giapPuxarTodosVasculha(opts = {}) {
  if (_giapPuxarTodos.rodando) {
    return showToast('Já está puxando. Use Parar se quiser interromper.', 'info');
  }

  const cb = $('giap-fila-com-matricula');
  if (cb) cb.checked = true;
  await giapCarregarFaltandoFolha();

  let fila = (_giapFaltando.rows || []).filter(
    (r) => (r.nome || '').trim().split(/\s+/).length >= 2
  );
  if (!fila.length) {
    return showToast('Ninguém pendente na Vasculha para puxar.', 'info');
  }

  const loteSize = Math.max(1, Math.min(15, Number($('giap-vasculha-lote')?.value || 8)));
  const totalGeral = fila.length;
  const nLotes = Math.ceil(totalGeral / loteSize);
  const okConfirm = confirm(
    `Puxar ${totalGeral} servidor(es) da Vasculha?\n\n` +
    `• Lotes de ${loteSize} (≈ ${nLotes} lote(s))\n` +
    `• 1 a 1 com pausa — evita derrubar o Render\n` +
    `• Use Parar a qualquer momento\n\n` +
    `Continuar?`
  );
  if (!okConfirm) return;

  _giapPuxarTodos.rodando = true;
  _giapPuxarTodos.parar = false;

  const btn = $('giap-btn-vasculha-puxar-todos') || $('giap-btn-puxar-todos');
  const btnParar = $('giap-btn-vasculha-parar') || $('giap-btn-parar-puxar');
  const btnTopoParar = $('giap-btn-parar-puxar');
  const st = $('giap-vasculha-status') || $('giap-puxar-todos-status');
  if (btn) btn.disabled = true;
  if (btnParar) btnParar.style.display = '';
  if (btnTopoParar) btnTopoParar.style.display = '';
  if (st) {
    st.style.display = '';
    st.textContent = 'Iniciando…';
  }

  const competencia = Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
  let ok = 0;
  let vazio = 0;
  let erro = 0;
  let processados = 0;

  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    for (let i = 0; i < fila.length; i++) {
      if (_giapPuxarTodos.parar) break;

      // Pausa maior entre lotes (deixa o Chrome no Render respirar)
      if (i > 0 && i % loteSize === 0) {
        if (st) {
          st.textContent =
            `Pausa entre lotes… ${i}/${totalGeral} · ok ${ok} · vazio ${vazio} · erro ${erro}`;
        }
        await pause(5000);
        if (_giapPuxarTodos.parar) break;
      }

      const item = fila[i];
      const nome = String(item.nome || '').trim();
      const mat = item.matricula ? String(item.matricula).trim() : '';
      processados = i + 1;
      const loteAtual = Math.floor(i / loteSize) + 1;
      const pct = Math.round((i / totalGeral) * 100);

      giapPintarProgresso({
        id: null,
        progresso_pct: pct,
        status: 'running',
        competencia,
        meta: `Vasculha lote ${loteAtual}/${nLotes} · ${processados}/${totalGeral}`,
        etapa: nome,
        resumo: { ok, vazio, erro, lote: loteAtual, origem: opts.origem || 'vasculha' }
      });
      if (st) {
        st.textContent =
          `Lote ${loteAtual}/${nLotes} · ${processados}/${totalGeral} · ${nome}` +
          (mat ? ` (${mat})` : '') +
          ` · ok ${ok} · vazio ${vazio} · erro ${erro}`;
      }

      try {
        const data = await giapProxy('sync_nome', {
          nomeServidor: nome,
          competencia,
          matricula: mat || undefined
        });
        if (
          (data.registros_inseridos || 0) === 0 &&
          (data.registros_filtrados || 0) === 0
        ) {
          vazio++;
        } else {
          ok++;
          _giapFaltando.rows = _giapFaltando.rows.filter((r) => {
            if (mat && giapMatKey(r.matricula) === giapMatKey(mat)) return false;
            return giapNormNome(r.nome) !== giapNormNome(nome);
          });
          giapFaltandoRender();
        }
      } catch (e) {
        erro++;
        console.warn('[GIAP] vasculha puxar', nome, e.message || e);
        await pause(3500);
      }

      if (processados % 4 === 0 || processados === totalGeral) {
        await giapCarregarFolhaTabela();
      }
      // Pausa entre nomes (Chrome free tier)
      await pause(1500);
    }

    const msg = _giapPuxarTodos.parar
      ? `Parado. ok ${ok}, vazio ${vazio}, erro ${erro} de ${processados}/${totalGeral}.`
      : `Concluído. ok ${ok}, vazio ${vazio}, erro ${erro} de ${totalGeral}.`;
    showToast(msg, erro ? 'info' : 'success');
    giapPintarProgresso({
      id: null,
      progresso_pct: 100,
      status: _giapPuxarTodos.parar ? 'cancelled' : 'done',
      competencia,
      meta: 'Puxar Vasculha',
      resumo: { ok, vazio, erro, total: totalGeral, processados, parado: _giapPuxarTodos.parar }
    });
    if (st) st.textContent = msg;
    await giapCarregarFolhaTabela();
    await giapCarregarFaltandoFolha();
    if (ok > 0) await sincronizarRemuneracoesGiap({ competencia, silencioso: true });
  } finally {
    _giapPuxarTodos.rodando = false;
    _giapPuxarTodos.parar = false;
    if (btn) btn.disabled = false;
    if (btnParar) btnParar.style.display = 'none';
    if (btnTopoParar) btnTopoParar.style.display = 'none';
  }
};

window.giapCarregarFaltandoFolha = async function giapCarregarFaltandoFolha() {
  const tbody = $('tbody-giap-faltando');
  if (!tbody) return;
  const comp = Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
  tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><span class="spinner"></span> Vasculhando RH × folha…</td></tr>';
  try {
    // Carrega TODO o RH elegível (sem limite 2000 — senão gente some da vasculha)
    let rhRows = [];
    const viewProbe = await sb.from('v_funcionarios_atual')
      .select('funcionario_id')
      .limit(1);
    if (!viewProbe.error) {
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('v_funcionarios_atual')
          .select('funcionario_id, nome, matricula, vinculo')
          .order('nome')
          .range(from, from + 999);
        if (error) throw error;
        if (data?.length) {
          all.push(...data.map((r) => ({
            id: r.funcionario_id,
            nome: r.nome,
            matricula: r.matricula,
            vinculo: r.vinculo,
            data_admissao: null
          })));
        }
        if (!data || data.length < 1000) break;
      }
      rhRows = all;
    } else {
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('funcionarios')
          .select('id, nome, matricula, data_admissao')
          .eq('ativo', true)
          .range(from, from + 999);
        if (error) throw error;
        if (data?.length) all.push(...data.map((r) => ({ ...r, vinculo: null })));
        if (!data || data.length < 1000) break;
      }
      rhRows = all;
    }

    const matsFolha = new Set();
    const nomesFolhaList = [];
    const nomesFolhaExact = new Set();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('folha_pmsl')
        .select('matricula, funcionario, funcionario_norm')
        .eq('competencia', comp)
        .range(from, from + 999);
      if (error) throw error;
      for (const f of data || []) {
        const mk = giapMatKey(f.matricula);
        if (mk) matsFolha.add(mk);
        const nn = f.funcionario_norm || giapNormNome(f.funcionario);
        if (nn) {
          nomesFolhaExact.add(nn);
          nomesFolhaList.push(f.funcionario || nn);
        }
      }
      if (!data || data.length < 1000) break;
    }

    // Também usa o que já está carregado em Resultados (evita falso “faltando”)
    for (const r of _giapFolha.rows || []) {
      const mk = giapMatKey(r.matricula);
      if (mk) matsFolha.add(mk);
      if (r.funcionario) nomesFolhaList.push(r.funcionario);
      const nn = giapNormNome(r.funcionario);
      if (nn) nomesFolhaExact.add(nn);
    }

    const jaNaFolha = (r) => {
      const mk = giapMatKey(r.matricula);
      if (mk && matsFolha.has(mk)) return true;
      const nn = giapNormNome(r.nome);
      if (nn && nomesFolhaExact.has(nn)) return true;
      for (const nf of nomesFolhaList) {
        if (giapNomesCompativeis(r.nome, nf)) return true;
      }
      return false;
    };

    const fora = rhRows.filter((r) => {
      if (giapFaltandoExcluido(r.vinculo)) return false;
      if (jaNaFolha(r)) return false;
      return true;
    });

    const semMat = fora.filter((r) => !giapTemMatricula(r.matricula));
    const comMat = fora.filter((r) => giapTemMatricula(r.matricula));
    const mostrarComMat = $('giap-fila-com-matricula') ? !!$('giap-fila-com-matricula').checked : true;

    const faltando = (mostrarComMat ? fora : semMat).slice();

    faltando.sort((a, b) => {
      const am = giapTemMatricula(a.matricula) ? 1 : 0;
      const bm = giapTemMatricula(b.matricula) ? 1 : 0;
      if (am !== bm) return am - bm;
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });

    _giapFaltando.rows = faltando;
    _giapFaltando.totalFora = fora.length;
    _giapFaltando.semMatricula = semMat.length;
    _giapFaltando.comMatricula = comMat.length;
    _giapFaltando.page = 1;
    giapFaltandoRender();

    const card = $('giap-card-fila-resultados');
    if (card) card.style.display = '';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Erro: ${htmlEscape(e.message || e)}</td></tr>`;
  }
}

function giapIniciarPoll(jobId) {
  if (_giapPollTimer) clearInterval(_giapPollTimer);
  const iniciadoEm = Date.now();
  const MAX_POLL_MS = 50 * 60 * 1000; // 50 min
  // 1ª leitura imediata (não espera 2,5s)
  (async () => {
    try {
      const { data: job } = await sb.from('giap_jobs').select('*').eq('id', jobId).maybeSingle();
      if (job) giapPintarProgresso(job);
    } catch (_) { /* ignore */ }
  })();
  _giapPollTimer = setInterval(async () => {
    try {
      if (Date.now() - iniciadoEm > MAX_POLL_MS) {
        clearInterval(_giapPollTimer);
        _giapPollTimer = null;
        showToast('Job ainda em andamento no servidor, ou o Render reiniciou. Atualize a página.', 'info');
        return;
      }
      const { data: job } = await sb.from('giap_jobs').select('*').eq('id', jobId).maybeSingle();
      if (!job) return;
      giapPintarProgresso(job);
      if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
        clearInterval(_giapPollTimer);
        _giapPollTimer = null;
        if (job.status === 'done') {
          showToast('Buscas da competência gravadas na folha.', 'success');
          if (job.competencia) await giapMarcarCompetenciaBuscada(job.competencia);
          await sincronizarRemuneracoesGiap({ competencia: job.competencia, silencioso: true });
        }
        if (job.status === 'error') showToast(`Job GIAP falhou: ${job.erro || 'erro'}`, 'error');
        renderRelatorioApi();
      }
    } catch (_) { /* ignore */ }
  }, 2000);
}

window.giapRodarCiclo = async function giapRodarCiclo() {
  const btn = $('giap-btn-run');
  if (btn) btn.disabled = true;
  try {
    const competencia = Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
    const filtros = giapFiltrosBusca();
    giapProgressoLocal(`Iniciando busca da competência ${competencia}…`, 'chamando_api');
    showToast(`Buscando e gravando folha ${competencia}…`, 'info');
    const data = await giapProxy('start_job', {
      tipo: 'sync_orgao',
      competencia,
      dryRun: false,
      filtros
    });
    const job = data.job;
    if (!job?.id) throw new Error('Job não retornado pela API. Verifique o proxy GIAP e o serviço no Render.');
    _giapJobId = job.id;
    giapPintarProgresso(job);
    giapIniciarPoll(job.id);
  } catch (e) {
    console.error('[GIAP] Buscar e gravar:', e);
    giapPintarProgresso({
      id: null,
      progresso_pct: 0,
      status: 'error',
      competencia: Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao()),
      erro: e.message || String(e),
      meta: 'Falha ao iniciar',
      resumo: { erro: e.message || String(e) }
    });
    showToast(e.message || String(e), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.giapBuscarDemissoes = async function giapBuscarDemissoes() {
  const btn = $('giap-btn-demissao');
  if (btn) btn.disabled = true;
  try {
    const competencia = Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
    giapProgressoLocal(`Detectando demissões (${competencia})…`, 'buscar_demissoes');
    showToast('Detectando demissões (somente leitura — não exonera)…', 'info');
    const data = await giapProxy('start_job', {
      tipo: 'buscar_demissoes',
      competencia,
      dryRun: true,
      filtros: { mesesAtras: 12 }
    });
    const job = data.job;
    if (!job?.id) throw new Error('Job não retornado pela API');
    _giapJobId = job.id;
    giapPintarProgresso(job);
    giapIniciarPoll(job.id);
  } catch (e) {
    console.error('[GIAP] Detectar demissões:', e);
    giapPintarProgresso({
      id: null,
      progresso_pct: 0,
      status: 'error',
      erro: e.message || String(e),
      meta: 'Falha ao iniciar',
      resumo: { erro: e.message || String(e) }
    });
    showToast(e.message || String(e), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.giapSalvarConfig = async function giapSalvarConfig() {
  try {
    const automatico = !!$('giap-cfg-auto')?.checked;
    const dia_mes = Math.min(28, Math.max(1, Number($('giap-cfg-dia')?.value || 27)));
    const { data: sess } = await sb.auth.getSession();
    const { error } = await sb.from('giap_config').upsert({
      id: 1,
      automatico,
      dia_mes,
      updated_at: new Date().toISOString(),
      updated_by: sess?.session?.user?.id || null
    });
    if (error) throw error;
    showToast('Configuração salva.', 'success');
  } catch (e) {
    showToast(e.message || String(e), 'error');
  }
};

window.giapExonerarRevisao = async function giapExonerarRevisao(revisaoId, funcionarioId) {
  if (!confirm('Exonerar este servidor agora?')) return;
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await sb.rpc('fn_exonerar_funcionario', {
      p_funcionario_id: funcionarioId,
      p_data_exoneracao: hoje,
      p_motivo: 'Revisão GIAP — ausência na folha'
    });
    if (error) throw error;
    await sb.from('giap_revisao_ausencia').update({
      status: 'exonerado',
      resolved_at: new Date().toISOString()
    }).eq('id', revisaoId);
    showToast('Servidor exonerado.', 'success');
    renderRelatorioApi();
    atualizarBadgesSemLotacaoExonerados();
  } catch (e) {
    showToast(e.message || String(e), 'error');
  }
};

window.giapIgnorarRevisao = async function giapIgnorarRevisao(revisaoId) {
  try {
    const { error } = await sb.from('giap_revisao_ausencia').update({
      status: 'ignorado',
      resolved_at: new Date().toISOString()
    }).eq('id', revisaoId);
    if (error) throw error;
    showToast('Item ignorado.', 'success');
    renderRelatorioApi();
  } catch (e) {
    showToast(e.message || String(e), 'error');
  }
};

// ╔══════════════════════════════════════════════════════════════╗
// ║                          FÉRIAS                               ║
// ╚══════════════════════════════════════════════════════════════╝
const stateFer = { aba: 'atuais' };
const _ferCache = { rows: [], render: null };

async function renderFerias() {
  const kpis = await handleErr(await sb.from('v_ferias_kpis').select('*').single(), 'KPIs férias');
  if (kpis) {
    $('ferias-kpis').innerHTML = [
      ['Em férias hoje',  kpis.em_ferias_hoje,    'Servidores ausentes agora', 'var(--gov-green)'],
      ['Próximas (60d)',  kpis.proximas_60_dias,  'Agendadas pros próximos 60 dias', 'var(--gov-yellow)'],
      ['Pendentes',       kpis.pendentes,         '+12 meses sem férias', 'var(--gov-red)'],
      ['Concluídas (12m)',kpis.concluidas_ultimo_ano, 'Último ano', 'var(--gov-blue-primary)'],
    ].map(([lbl, val, sub, cor]) => `
      <div class="stat" style="border-left-color:${cor}">
        <div class="stat-lbl">${lbl}</div>
        <div class="stat-val">${(val||0).toLocaleString('pt-BR')}</div>
        <div class="stat-sub">${sub}</div>
      </div>`).join('');
    $('cnt-atuais').textContent    = kpis.em_ferias_hoje || 0;
    $('cnt-proximas').textContent  = kpis.proximas_60_dias || 0;
    $('cnt-pendentes').textContent = kpis.pendentes || 0;
  }
  carregarAbaFerias(stateFer.aba);
}

$$('.fer-tab').forEach(t => t.onclick = () => {
  $$('.fer-tab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  stateFer.aba = t.dataset.aba;
  // Reseta filtros ao trocar de aba (colunas mudam entre abas)
  if ($('fer-filtro-busca')) $('fer-filtro-busca').value = '';
  if ($('fer-filtro-lotacao')) $('fer-filtro-lotacao').value = '';
  if ($('fer-filtro-tipo')) $('fer-filtro-tipo').value = '';
  carregarAbaFerias(stateFer.aba);
});

const fmtDt = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

async function carregarAbaFerias(aba) {
  $('ferias-aba-conteudo').innerHTML = '<span class="spinner"></span> Carregando…';
  let view, render;
  if (aba === 'atuais') {
    view = 'v_ferias_atuais';
    render = (rows) => rows.length === 0
      ? `<div class="empty-state">Nenhum servidor de férias hoje</div>`
      : `<table class="gov-table">
          <thead><tr><th>Nome</th><th>Lotação</th><th>Função</th><th>Início</th><th>Término</th><th>Dias restantes</th><th>Tipo</th><th style="width:80px">Ações</th></tr></thead>
          <tbody>${rows.map(r => `
            <tr>
              <td style="font-weight:500;color:var(--gov-blue-dark)">${htmlEscape(r.nome)}</td>
              <td>${htmlEscape(r.lotacao_nome || '—')}</td>
              <td>${htmlEscape(r.funcao || '—')}</td>
              <td>${fmtDt(r.data_inicio)}</td>
              <td>${fmtDt(r.data_fim)}</td>
              <td><strong>${r.dias_restantes}</strong> dias</td>
              <td>${r.tipo}</td>
              <td style="text-align:center"><button class="btn-icon" onclick="cancelarFerias(${r.ferias_id})">Cancelar</button></td>
            </tr>`).join('')}</tbody></table>`;
  } else if (aba === 'proximas') {
    view = 'v_ferias_proximas';
    render = (rows) => rows.length === 0
      ? `<div class="empty-state">Sem férias agendadas pros próximos 60 dias</div>`
      : `<table class="gov-table">
          <thead><tr><th>Nome</th><th>Lotação</th><th>Função</th><th>Início</th><th>Término</th><th>Em quantos dias</th><th>Tipo</th><th style="width:80px">Ações</th></tr></thead>
          <tbody>${rows.map(r => `
            <tr>
              <td style="font-weight:500;color:var(--gov-blue-dark)">${htmlEscape(r.nome)}</td>
              <td>${htmlEscape(r.lotacao_nome || '—')}</td>
              <td>${htmlEscape(r.funcao || '—')}</td>
              <td>${fmtDt(r.data_inicio)}</td>
              <td>${fmtDt(r.data_fim)}</td>
              <td><strong>${r.dias_para_iniciar}</strong> dias</td>
              <td>${r.tipo}</td>
              <td style="text-align:center"><button class="btn-icon" onclick="cancelarFerias(${r.ferias_id})">Cancelar</button></td>
            </tr>`).join('')}</tbody></table>`;
  } else if (aba === 'pendentes') {
    view = 'v_ferias_pendentes';
    render = (rows) => rows.length === 0
      ? `<div class="empty-state">Todos os servidores tiraram férias nos últimos 12 meses ✓</div>`
      : `<table class="gov-table">
          <thead><tr><th>Nome</th><th>Lotação</th><th>Função</th><th>Vínculo</th><th>Situação</th><th>Dias sem férias</th><th style="width:140px">Ações</th></tr></thead>
          <tbody>${rows.map(r => `
            <tr>
              <td style="font-weight:500;color:var(--gov-blue-dark)">${htmlEscape(r.nome)}</td>
              <td>${htmlEscape(r.lotacao_nome || '—')}</td>
              <td>${htmlEscape(r.funcao || '—')}</td>
              <td>${htmlEscape(r.vinculo || '—')}</td>
              <td>${htmlEscape(r.situacao)}</td>
              <td><strong>${r.dias_sem_ferias === 999 ? '∞' : r.dias_sem_ferias}</strong></td>
              <td style="text-align:center"><button class="btn-secondary" style="font-size:11px;padding:4px 8px" onclick="abrirAgendarFeriasPara(${r.funcionario_id}, '${htmlEscape(r.nome).replace(/'/g,'&#39;')}')">Agendar</button></td>
            </tr>`).join('')}</tbody></table>`;
  } else {
    view = 'v_ferias_historico';
    render = (rows) => rows.length === 0
      ? `<div class="empty-state">Nenhum registro de férias ainda</div>`
      : `<table class="gov-table">
          <thead><tr><th>Nome</th><th>Início</th><th>Término</th><th>Dias</th><th>Tipo</th><th>Status</th><th>Observação</th></tr></thead>
          <tbody>${rows.map(r => `
            <tr>
              <td style="font-weight:500;color:var(--gov-blue-dark)">${htmlEscape(r.nome)}</td>
              <td>${fmtDt(r.data_inicio)}</td>
              <td>${fmtDt(r.data_fim)}</td>
              <td>${r.dias_ferias}</td>
              <td>${r.tipo}</td>
              <td>${r.status_ferias}</td>
              <td style="font-size:12px;color:var(--color-text-muted)">${htmlEscape(r.observacao || '—')}</td>
            </tr>`).join('')}</tbody></table>`;
  }
  const rows = await handleErr(await fetchTudo(view, '*', 'nome'), `aba ${aba}`) || [];
  _ferCache.rows = rows;
  _ferCache.render = render;
  ferPopularFiltros(rows);
  ferAplicarFiltros();
}

// Popula os dropdowns de Lotação e Tipo com os valores presentes na aba atual (filtragem inteligente)
function ferPopularFiltros(rows) {
  const selLot = $('fer-filtro-lotacao');
  const selTipo = $('fer-filtro-tipo');
  if (selLot) {
    const lots = [...new Set(rows.map(r => (r.lotacao_nome || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    selLot.innerHTML = '<option value="">Todas as lotações</option>' +
      lots.map(l => `<option value="${htmlEscape(l)}">${htmlEscape(l)}</option>`).join('');
    selLot.disabled = lots.length === 0;
  }
  if (selTipo) {
    const tipos = [...new Set(rows.map(r => (r.tipo || '').toString().trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    selTipo.innerHTML = '<option value="">Todos os tipos</option>' +
      tipos.map(t => `<option value="${htmlEscape(t)}">${htmlEscape(t)}</option>`).join('');
    selTipo.disabled = tipos.length === 0;
  }
}

function ferAplicarFiltros() {
  const { rows, render } = _ferCache;
  if (!render) return;
  const busca = ($('fer-filtro-busca')?.value || '').toLowerCase().trim();
  const lot = $('fer-filtro-lotacao')?.value || '';
  const tipo = $('fer-filtro-tipo')?.value || '';
  const filtradas = rows.filter(r => {
    if (lot && (r.lotacao_nome || '').trim() !== lot) return false;
    if (tipo && (r.tipo || '').toString().trim() !== tipo) return false;
    if (busca) {
      const alvo = `${r.nome || ''} ${r.funcao || ''} ${r.lotacao_nome || ''} ${r.vinculo || ''}`.toLowerCase();
      if (!busca.split(/\s+/).every(p => alvo.includes(p))) return false;
    }
    return true;
  });
  $('ferias-aba-conteudo').innerHTML = `<div class="table-container">${render(filtradas)}</div>`;
  const cnt = $('fer-count');
  if (cnt) cnt.innerHTML = `<strong>${filtradas.length}</strong> de ${rows.length} registro(s)`;
}

$('fer-filtro-busca')?.addEventListener('input', debounce(ferAplicarFiltros, 200));
$('fer-filtro-lotacao')?.addEventListener('change', ferAplicarFiltros);
$('fer-filtro-tipo')?.addEventListener('change', ferAplicarFiltros);
$('fer-filtro-limpar')?.addEventListener('click', () => {
  if ($('fer-filtro-busca')) $('fer-filtro-busca').value = '';
  if ($('fer-filtro-lotacao')) $('fer-filtro-lotacao').value = '';
  if ($('fer-filtro-tipo')) $('fer-filtro-tipo').value = '';
  ferAplicarFiltros();
});

window.cancelarFerias = async (id) => {
  const motivo = prompt('Motivo do cancelamento (opcional):');
  if (motivo === null) return; // usuário desistiu
  const { data: atual } = await sb.from('funcionario_ferias').select('observacao').eq('id', id).single();
  const obs = ((atual?.observacao ? atual.observacao + '\n' : '') + '[CANCELADA]' + (motivo ? ' ' + motivo : '')).trim();
  const { error } = await sb.from('funcionario_ferias').update({ ativo: false, observacao: obs }).eq('id', id);
  if (error) return showToast('Erro: ' + error.message, 'error');
  await registrarLog('FÉRIAS CANCELADA', null, 'Servidor', { ferias_id: id, motivo });
  showToast('Férias canceladas', 'success');
  renderFerias();
};

window.abrirAgendarFerias = () => {
  ['fer-func-id','fer-search','fer-inicio','fer-fim','fer-dias','fer-obs'].forEach(id => $(id).value = '');
  $('fer-tipo').value = 'regular';
  openModal('modal-ferias');
  setTimeout(() => $('fer-search').focus(), 100);
};
window.abrirAgendarFeriasPara = (funcId, nome) => {
  abrirAgendarFerias();
  $('fer-func-id').value = funcId;
  $('fer-search').value = nome;
};

document.addEventListener('input', debounce(async (e) => {
  if (e.target.id !== 'fer-search') return;
  const q = e.target.value.trim();
  if (q.length < 2) { $('fer-suggest').innerHTML = ''; return; }
  const termoRPC = q.split(/\s+/).join('%');
  const data = await handleErr(await sb.rpc('fn_buscar_funcionarios', {
    p_termo: termoRPC, p_vinculo_id: null, p_lotacao_id: null, p_funcao: null, p_turno_id: null,
    p_limite: 8, p_offset: 0, p_order_by: 'nome', p_order_dir: 'asc'
  }), 'autocomp');
  if (!data || data.length === 0) { $('fer-suggest').innerHTML = '<div style="padding:8px;font-size:12px;color:var(--color-text-muted)">Nenhum resultado</div>'; return; }
  $('fer-suggest').innerHTML = `<div style="position:absolute;background:#fff;border:1px solid var(--gov-border);border-radius:4px;max-height:200px;overflow-y:auto;z-index:10;width:100%;box-shadow:var(--shadow-md)">
    ${data.map(d => `<div class="lotacao-tree-item" data-id="${d.funcionario_id}" data-nome="${htmlEscape(d.nome)}" style="padding:8px 10px">
      <strong>${htmlEscape(d.nome)}</strong> · <small>${htmlEscape(d.lotacao_nome || '')}</small>
    </div>`).join('')}
  </div>`;
  $$('#fer-suggest .lotacao-tree-item').forEach(el => el.onclick = () => {
    $('fer-func-id').value = el.dataset.id;
    $('fer-search').value = el.dataset.nome;
    $('fer-suggest').innerHTML = '';
  });
}, 250));

document.addEventListener('change', (e) => {
  if (e.target.id === 'fer-inicio' || e.target.id === 'fer-fim') {
    const ini = $('fer-inicio').value, fim = $('fer-fim').value;
    if (ini && fim) {
      const d = Math.floor((new Date(fim) - new Date(ini)) / 86400000) + 1;
      $('fer-dias').value = d > 0 ? `${d} dia(s)` : 'Data inválida';
    }
  }
});

// ╔══════════════════════════════════════════════════════════════╗
// ║                       PENDENTES                               ║
// ╚══════════════════════════════════════════════════════════════╝
const statePend = { busca: '', status: 'pendente', ordem: 'alfabetica', page: 1, pageSize: 20 };
window._pendRows = [];
window._pendSugCache = null;

async function renderPendentes() {
  const kpis = await handleErr(await sb.from('v_pendentes_kpis').select('*').single(), 'pend kpis');
  if (kpis) {
    $('pendentes-kpis').innerHTML = [
      ['Pendentes',         kpis.pendentes,         'Aguardam revisão',     'var(--gov-red)'],
      ['Casados',           kpis.casados,           'Atualizados existentes','var(--gov-green)'],
      ['Novos Cadastrados', kpis.novos_cadastrados, 'Criados no sistema',    'var(--gov-blue-primary)'],
      ['Descartados',       kpis.descartados,       'Não cadastrados',       'var(--color-text-muted)'],
    ].map(([lbl, val, sub, cor]) => `
      <div class="stat" style="border-left-color:${cor}">
        <div class="stat-lbl">${lbl}</div>
        <div class="stat-val">${(val||0).toLocaleString('pt-BR')}</div>
        <div class="stat-sub">${sub}</div>
      </div>`).join('');
    const badge = $('badge-pendentes');
    if (badge) {
      badge.textContent = kpis.pendentes || 0;
      badge.style.display = (kpis.pendentes || 0) > 0 ? '' : 'none';
    }
  }
  statePend.page = 1;
  carregarPendentes();
  carregarAuditoria();
}

async function carregarPendentes() {
  $('pend-tbody').innerHTML = '<tr><td colspan="7" class="empty-state"><span class="spinner"></span></td></tr>';
  const termoWild = statePend.busca ? sanitizarTermoLike(statePend.busca) : '';
  let q = sb.from('v_pendentes_com_sugestao').select('*');
  if (statePend.status) q = q.eq('status', statePend.status);
  if (termoWild) {
    q = q.or(`nome.ilike.%${termoWild}%,matricula.ilike.%${termoWild}%`);
  }
  // Quando o filtro de status não é pendente, a view só retorna pendentes — uso a tabela base
  if (statePend.status && statePend.status !== 'pendente') {
    q = sb.from('funcionarios_folha_pendentes').select('*').eq('status', statePend.status);
    if (termoWild) {
      q = q.or(`nome.ilike.%${termoWild}%,matricula.ilike.%${termoWild}%`);
    }
  }
  let data = await handleErr(await q.order('nome').range(0, 9999), 'pendentes') || [];

  // Sugestões confiáveis: exclui quem já foi associado a outro pendente e quem
  // já possui matrícula diferente (pertence a outra linha da folha); remove nomes repetidos
  const [usadosRes, matsRes] = await Promise.all([
    sb.from('funcionarios_folha_pendentes').select('funcionario_id').not('funcionario_id', 'is', null),
    fetchTudo('funcionarios', 'id, matricula', 'id')
  ]);
  const jaAssociados = new Set((usadosRes.data || []).map(r => r.funcionario_id));
  const soDigitos = s => String(s || '').replace(/\D/g, '').replace(/^0+/, '');
  const matriculaDe = {};
  (matsRes.data || []).forEach(f => matriculaDe[f.id] = soDigitos(f.matricula));
  const normNome = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  function filtrarSugestoes(p) {
    const vistos = new Set();
    const matPend = soDigitos(p.matricula);
    return (p.sugestoes || [])
      .sort((a, b) => b.similarity - a.similarity)
      .filter(s => {
        if (jaAssociados.has(s.id)) return false;
        const m = matriculaDe[s.id];
        if (m && m !== matPend) return false;
        const n = normNome(s.nome);
        if (vistos.has(n)) return false;
        vistos.add(n);
        return true;
      })
      .slice(0, 3);
  }

  // Calcula as sugestões filtradas uma única vez por linha (evita recomputar no sort e no render)
  const sugestoesCache = new Map(data.map(p => [p, filtrarSugestoes(p)]));

  // Ordenação
  if (statePend.ordem === 'match_desc') {
    data.sort((a, b) => {
      const sa = sugestoesCache.get(a);
      const sb2 = sugestoesCache.get(b);
      const maxA = sa.length > 0 ? Math.max(...sa.map(s => s.similarity)) : 0;
      const maxB = sb2.length > 0 ? Math.max(...sb2.map(s => s.similarity)) : 0;
      return maxB - maxA;
    });
  }

  window._pendRows = data;
  window._pendSugCache = sugestoesCache;
  if (!statePend.page) statePend.page = 1;
  renderTabelaPendentes();
}

function renderPaginacaoPendentes(total) {
  const info = $('pend-page-info');
  const controls = $('pend-page-controls');
  if (!info || !controls) return;
  const pageSize = statePend.pageSize || 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  if (statePend.page > totalPages) statePend.page = totalPages;
  const page = statePend.page || 1;
  const ini = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const fim = Math.min(page * pageSize, total);
  info.textContent = total === 0
    ? 'Nenhum registro'
    : `Mostrando ${ini}-${fim} de ${total.toLocaleString('pt-BR')}`;

  const btn = (label, p, dis, active = false) =>
    `<button class="page-btn ${active ? 'active' : ''}" ${dis ? 'disabled' : ''} data-page="${p}">${label}</button>`;
  let html = btn('«', page - 1, page === 1);
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) html += btn(i, i, false, i === page);
  html += btn('»', page + 1, page === totalPages);
  controls.innerHTML = html;
  $$('#pend-page-controls .page-btn').forEach((b) => {
    b.onclick = () => {
      if (b.disabled) return;
      statePend.page = Number(b.dataset.page);
      renderTabelaPendentes();
    };
  });
}

function renderTabelaPendentes() {
  const data = window._pendRows || [];
  const sugestoesCache = window._pendSugCache;
  renderPaginacaoPendentes(data.length);

  if (data.length === 0) {
    $('pend-tbody').innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum registro</td></tr>';
    return;
  }

  const pageSize = statePend.pageSize || 20;
  const start = ((statePend.page || 1) - 1) * pageSize;
  const pagina = data.slice(start, start + pageSize);

  $('pend-tbody').innerHTML = pagina.map(p => {
    const sugs = sugestoesCache?.get(p) || [];
    const sugHtml = sugs.length === 0
      ? (p.status === 'pendente'
          ? '<div style="font-size:12px;background:var(--gov-blue-light);color:var(--gov-blue-dark);padding:6px 8px;border-radius:4px"><i class="ti ti-user-plus"></i> Sem correspondência no sistema — cadastre como <strong>novo servidor</strong></div>'
          : '<small style="color:var(--color-text-muted)">Nenhuma sugestão automática</small>')
      : sugs.map(s => `<div style="font-size:12px;padding:4px 0; border-bottom: 1px dashed #E5E7EB; margin-bottom: 2px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span><strong>${(s.similarity*100).toFixed(0)}%</strong> · ${htmlEscape(s.nome)}</span>
            ${p.status === 'pendente' ? `<button type="button" class="btn-link" style="font-size:11px" onclick="window.associarPendente(${p.id}, ${s.id})">vincular →</button>` : ''}
          </div>
          <div style="font-size: 11px; color: var(--color-text-sec); margin-top: 2px;">
            ${htmlEscape(s.funcao || 'Sem função')} | Lotação: ${htmlEscape(s.lotacao_nome || 'N/A')}
          </div>
        </div>`).join('');
    const statusBadge = {
      'pendente':        '<span style="background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">PENDENTE</span>',
      'casado':          '<span style="background:#D1FAE5;color:#065F46;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">VINCULADO</span>',
      'novo_cadastrado': '<span style="background:#DBEAFE;color:#1E40AF;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">NOVO</span>',
      'descartado':      '<span style="background:#E5E7EB;color:#4B5563;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">DESCARTADO</span>',
    }[p.status];
    const acoes = p.status === 'pendente' ? `
      <button class="${sugs.length === 0 ? 'btn-primary' : 'btn-secondary'}" style="font-size:11px;padding:4px 8px" onclick="abrirCadastrarPendente(${p.id})"><i class="ti ti-plus"></i> Novo</button>
      <button class="btn-icon" title="Descartar" onclick="descartarPendente(${p.id})"><i class="ti ti-x"></i></button>
    ` : `<small style="color:var(--color-text-muted)">Resolvido</small>`;
    return `<tr>
      <td style="font-family:monospace">${htmlEscape(p.matricula)}</td>
      <td style="font-weight:500;color:var(--gov-blue-dark)">${htmlEscape(p.nome)}</td>
      <td style="font-size:12px">${fmtDt(p.data_admissao)}</td>
      <td style="font-size:12px;color:var(--color-text-sec)">
        <div>${htmlEscape(p.lotacao_origem || '—')}</div>
        <div style="font-weight:600;margin-top:2px">${htmlEscape(p.cargo_origem || '—')}</div>
      </td>
      <td>${sugHtml}</td>
      <td>${statusBadge}</td>
      <td style="text-align:center"><div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">${acoes}</div></td>
    </tr>`;
  }).join('');
}

async function carregarAuditoria() {
  $('tbody-sem-matricula').innerHTML = '<tr><td colspan="2" class="empty-state"><span class="spinner"></span> Carregando...</td></tr>';
  $('tbody-duplicados').innerHTML = '<tr><td colspan="2" class="empty-state"><span class="spinner"></span> Carregando...</td></tr>';

  // Buscar todos os funcionários da view consolidada (v_funcionarios_atual traz a coluna vinculo!)
  const data = await handleErr(await sb.from('v_funcionarios_atual').select('*').order('nome'), 'auditoria') || [];
  
  if (data.length === 0) return;

  // 1. Sem matrícula (Ignorando terceirizados e celetistas, pois é esperado que não tenham matrícula do município)
  const semMatricula = data.filter(f => {
    const isSemMatricula = !f.matricula || f.matricula.trim() === '';
    const vinc = (f.vinculo || '').toLowerCase();
    const isTerceirOuCel = vinc.includes('terceirizado') || vinc.includes('celetista');
    return isSemMatricula && !isTerceirOuCel;
  });
  $('badge-sem-matricula').textContent = semMatricula.length;
  if (semMatricula.length === 0) {
    $('tbody-sem-matricula').innerHTML = '<tr><td colspan="2" class="empty-state" style="color:var(--gov-green);font-weight:600">Tudo certo! Nenhum servidor sem matrícula.</td></tr>';
  } else {
    $('tbody-sem-matricula').innerHTML = semMatricula.map(f => `
      <tr>
        <td style="font-weight:500;color:var(--gov-blue-dark)">${htmlEscape(f.nome)}</td>
        <td>${f.lotacao_nome ? htmlEscape(f.lotacao_nome) : '<span style="color:var(--gov-red)">Sem Lotação</span>'}</td>
      </tr>
    `).join('');
  }

  // 2. Duplicidades
  const mapNomes = {};
  data.forEach(f => {
    if (!f.nome) return;
    const n = f.nome.trim().toUpperCase();
    if (!mapNomes[n]) mapNomes[n] = [];
    mapNomes[n].push(f);
  });

  const duplicados = Object.keys(mapNomes)
    .map(nome => mapNomes[nome])
    .filter(grupo => grupo.length > 1);

  let totalDuplicados = 0;
  if (duplicados.length === 0) {
    $('tbody-duplicados').innerHTML = '<tr><td colspan="2" class="empty-state" style="color:var(--gov-green);font-weight:600">Tudo certo! Nenhuma duplicidade de nome encontrada.</td></tr>';
    $('badge-duplicados').textContent = '0';
  } else {
    let html = '';
    duplicados.forEach(grupo => {
      totalDuplicados += grupo.length;
      const lotacoesHtml = grupo.map(f => `
        <div style="background:var(--gov-bg-light); border:1px solid var(--gov-border); border-radius:4px; padding:6px 10px; margin-bottom:6px;">
          <div style="font-size:11px; color:var(--color-text-sec); margin-bottom:2px;">Matrícula: <strong>${htmlEscape(f.matricula || 'N/A')}</strong></div>
          <div style="font-weight:500; color:var(--gov-blue-dark);"><i class="ti ti-map-pin"></i> ${f.lotacao_nome ? htmlEscape(f.lotacao_nome) : '<span style="color:var(--gov-red)">Sem Lotação</span>'}</div>
        </div>
      `).join('');
      
      html += `
        <tr>
          <td style="font-weight:600;color:var(--gov-red);vertical-align:top;padding-top:12px;">${htmlEscape(grupo[0].nome)}</td>
          <td style="vertical-align:top">${lotacoesHtml}</td>
        </tr>
      `;
    });
    $('tbody-duplicados').innerHTML = html;
    $('badge-duplicados').textContent = totalDuplicados + ' registros';
  }
}

document.addEventListener('input', debounce((e) => {
  if (e.target.id === 'pend-busca') { statePend.busca = e.target.value.trim(); statePend.page = 1; carregarPendentes(); }
}, 300));
document.addEventListener('change', (e) => {
  if (e.target.id === 'pend-status-filtro') { statePend.status = e.target.value; statePend.page = 1; carregarPendentes(); }
  if (e.target.id === 'pend-ordem') { statePend.ordem = e.target.value; statePend.page = 1; carregarPendentes(); }
});

window.associarPendente = async (pendId, funcId) => {
  if (!confirm('Confirmar associação? Isso vai atualizar matrícula e data de admissão do servidor selecionado, e registrar no histórico.')) return;
  
  try {
    console.log(`Associando pendente ${pendId} ao funcionario ${funcId}`);
    
    const { error } = await sb.rpc('fn_associar_pendente', { 
      p_pendente_id: pendId, 
      p_funcionario_id: funcId 
    });
    
    if (error) throw error;
    await registrarLog('ASSOCIAÇÃO DE MATRÍCULA', funcId, 'Servidor(a)', { pendente_id: pendId });
    showToast('Associado com sucesso. Histórico atualizado!', 'success');
    renderPendentes();
  } catch (e) {
    console.error("Erro ao associar:", e);
    showToast('Erro: ' + (e.message || e), 'error');
    alert('Ocorreu um erro ao associar. ' + (e.message || e));
  }
};

window.descartarPendente = async (pendId) => {
  const motivo = prompt('Motivo do descarte (opcional):');
  if (motivo === null) return;
  const { error } = await sb.rpc('fn_descartar_pendente', { p_pendente_id: pendId, p_motivo: motivo || null });
  if (error) return showToast('Erro: ' + error.message, 'error');
  await registrarLog('DESCARTE DE PENDÊNCIA', null, `Pendência ID ${pendId}`, { motivo: motivo || null });
  showToast('Descartado', 'success');
  renderPendentes();
};

window.abrirCadastrarPendente = async (pendId) => {
  const p = await handleErr(await sb.from('funcionarios_folha_pendentes').select('*').eq('id', pendId).single(), 'pend');
  if (!p) return;
  $('cad-pend-id').value = pendId;
  $('cad-pend-info').innerHTML = `
    <strong>${htmlEscape(p.nome)}</strong><br>
    <small>Matrícula: ${htmlEscape(p.matricula)} · Admissão: ${fmtDt(p.data_admissao)}</small><br>
    <small>Folha: ${htmlEscape(p.lotacao_origem || '—')} · ${htmlEscape(p.cargo_origem || '—')}</small>`;
  // Popula selects
  $('cad-pend-lotacao').innerHTML = '<option value="">Selecione…</option>' +
    state.lotacoes.filter(l => l.funcionarios_direto !== null).sort((a,b) => a.nome.localeCompare(b.nome))
      .map(l => `<option value="${l.id}">${htmlEscape(l.nome)} [${l.tipo}]</option>`).join('');
  $('cad-pend-vinculo').innerHTML = state.vinculos.map(v => `<option value="${v.id}">${htmlEscape(v.categoria)}</option>`).join('');
  $('cad-pend-turno').innerHTML = '<option value="">—</option>' + state.turnos.map(t => `<option value="${t.id}">${htmlEscape(t.nome)}</option>`).join('');

  // Pré-preenche a partir dos dados da folha
  const semAc = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const lotFolha = semAc(p.lotacao_origem);
  if (lotFolha) {
    const candidata = state.lotacoes.find(l => {
      const n = semAc(l.nome);
      return n === lotFolha || n.includes(lotFolha) || lotFolha.includes(n);
    });
    if (candidata) $('cad-pend-lotacao').value = candidata.id;
  }
  const cargoFolha = semAc(p.cargo_origem);
  const vincPor = (busca) => state.vinculos.find(v => semAc(v.categoria).includes(busca))?.id;
  let vincSugerido = null;
  if (cargoFolha === 'SERVICO PRESTADO') vincSugerido = vincPor('PRESTADO');
  else if (cargoFolha.startsWith('TEC MUN NIVEL SUPERIOR')) vincSugerido = vincPor('EFETIVO');
  if (vincSugerido) $('cad-pend-vinculo').value = vincSugerido;
  // função sugerida: cargo da folha em capitalização de título
  $('cad-pend-funcao').value = (p.cargo_origem || '').toLowerCase()
    .replace(/(^|\s)([a-zà-ú])/g, (m, sp, c) => sp + c.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E|Em|Para|A|O)\b/g, m => m.toLowerCase());
  openModal('modal-cadastrar-pendente');
};

// ╔══════════════════════════════════════════════════════════════╗
// ║                  GESTÃO DE LOTAÇÕES                           ║
// ╚══════════════════════════════════════════════════════════════╝
const stateLot = { busca: '' };

async function renderLotacoes() {
  const data = await handleErr(await sb.rpc('fn_organograma_completo'), 'organograma') || [];
  const byId = Object.fromEntries(data.map(x => [x.id, { ...x, filhos: [] }]));
  const raizes = [];
  for (const n of Object.values(byId)) {
    if (n.parent_id && byId[n.parent_id]) byId[n.parent_id].filhos.push(n);
    else raizes.push(n);
  }
  Object.values(byId).forEach(n => n.filhos.sort((a,b)=>a.nome.localeCompare(b.nome)));
  const secoes = classificarNiveisSemcas(raizes);
  function render(n, depth) {
    const tem = n.filhos.length > 0;
    const t = n.funcionarios_total;
    const podeInativar = (t === 0) && !tem;
    return `<div class="org-node" data-id="${n.id}" data-nome="${htmlEscape(n.nome).replace(/"/g,'&quot;')}" data-filhos="${tem}" style="padding-left:${8+depth*16}px">
      <span class="toggle ${tem?'':'empty'}"><i class="ti ti-chevron-right"></i></span>
      <span class="tipo-tag" style="font-size:9px;padding:2px 6px;background:var(--gov-bg-light);color:var(--color-text-sec);border-radius:4px;text-transform:uppercase;font-weight:600">${n.tipo}</span>
      <span style="flex:1;font-weight:500;color:var(--gov-blue-dark)">${htmlEscape(n.nome)}</span>
      <span class="badge-count ${t===0?'zero':''}" style="background:${t===0?'#ddd':'var(--gov-blue-primary)'};color:${t===0?'#888':'#fff'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${t}</span>
      <div class="table-actions" style="display:flex;gap:4px;margin-left:6px" onclick="event.stopPropagation()">
        <button class="btn-icon" title="Adicionar filho" onclick="abrirNovaLotacao(${n.id})"><i class="ti ti-plus"></i></button>
        <button class="btn-icon" title="Editar" onclick="abrirEditarLotacao(${n.id})"><i class="ti ti-pencil"></i></button>
        <button class="btn-icon" title="Mover" onclick="abrirMoverLotacao(${n.id})"><i class="ti ti-arrow-move-right"></i></button>
        <button class="btn-icon" title="Ver servidores" aria-label="Ver servidores da lotação" onclick="verServidoresPorLotacao(${n.id})"><i class="ti ti-eye"></i></button>
        ${podeInativar ? `<button class="btn-icon" title="Inativar" onclick="inativarLotacao(${n.id})"><i class="ti ti-trash"></i></button>` : ''}
      </div>
    </div>` + (tem ? `<div class="org-children" data-parent="${n.id}">${n.filhos.map(c => render(c, depth+1)).join('')}</div>` : '');
  }
  $('lot-tree').innerHTML = secoes
    .filter(s => s.itens.length > 0)
    .map(s => `
      <div class="org-nivel-header" style="${ORG_NIVEL_HEADER_STYLE}">
        <span>${htmlEscape(s.titulo)}</span>
        ${s.raizId ? `<button class="btn-icon" title="Adicionar lotação neste nível" onclick="abrirNovaLotacao(${s.raizId})"><i class="ti ti-plus"></i></button>` : ''}
      </div>
      ${s.itens.map(r => render(r, 0)).join('')}`)
    .join('');
  $$('#lot-tree .org-node').forEach(node => {
    node.onclick = (e) => {
      if (e.target.closest('button')) return;
      if (node.dataset.filhos !== 'true') return;
      const kids = document.querySelector(`#lot-tree .org-children[data-parent="${node.dataset.id}"]`);
      const tog = node.querySelector('.toggle i');
      if (!kids) return;
      const open = kids.classList.toggle('open');
      tog.className = open ? 'ti ti-chevron-down' : 'ti ti-chevron-right';
    };
  });
}
window.lotExpandirTudo = () => { $$('#lot-tree .org-children').forEach(el => el.classList.add('open')); };
window.lotRecolherTudo = () => { $$('#lot-tree .org-children').forEach(el => el.classList.remove('open')); };

// ── Filtro da árvore de lotações (o campo existia sem função) ──
$('lot-busca').addEventListener('input', debounce(() => {
  const q = ($('lot-busca').value || '').trim().toLowerCase();
  const tree = $('lot-tree');
  const nodes = [...tree.querySelectorAll('.org-node')];
  const headers = [...tree.querySelectorAll('.org-nivel-header')];
  if (!q) {
    nodes.forEach(n => n.style.display = '');
    headers.forEach(h => h.style.display = '');
    return;
  }
  nodes.forEach(n => n.style.display = 'none');
  for (const n of nodes) {
    if (!(n.dataset.nome || '').toLowerCase().includes(q)) continue;
    n.style.display = '';
    // mostra e expande a cadeia de ancestrais
    let cont = n.closest('.org-children');
    while (cont) {
      cont.classList.add('open');
      const pai = tree.querySelector(`.org-node[data-id="${cont.dataset.parent}"]`);
      if (pai) pai.style.display = '';
      cont = pai ? pai.closest('.org-children') : null;
    }
  }
  // esconde cabeçalhos de nível sem resultados
  headers.forEach(h => {
    let el = h.nextElementSibling, tem = false;
    while (el && !el.classList.contains('org-nivel-header')) {
      if (el.classList.contains('org-node') && el.style.display !== 'none') { tem = true; break; }
      if (el.classList.contains('org-children') && [...el.querySelectorAll('.org-node')].some(x => x.style.display !== 'none')) { tem = true; break; }
      el = el.nextElementSibling;
    }
    h.style.display = tem ? '' : 'none';
  });
}, 200));

window.abrirNovaLotacao = (parentId) => {
  $('nl-id').value = '';
  $('nl-parent').value = parentId || '';
  $('nl-nome').value = '';
  $('nl-tipo').value = 'coordenacao';
  $('nl-marcador').value = '';
  $('nl-parent-info').textContent = parentId
    ? (state.lotacoes.find(l => l.id == parentId)?.nome || '?')
    : 'Raiz (sem pai)';
  openModal('modal-lotacao');
  setTimeout(() => $('nl-nome').focus(), 100);
};
window.abrirEditarLotacao = (id) => {
  const lot = state.lotacoes.find(l => l.id == id);
  if (!lot) return;
  $('nl-id').value = id;
  $('nl-parent').value = lot.parent_id || '';
  $('nl-parent-info').textContent = lot.parent_id ? (state.lotacoes.find(l => l.id == lot.parent_id)?.nome || '?') : 'Raiz';
  $('nl-nome').value = lot.nome;
  $('nl-tipo').value = lot.tipo;
  $('nl-marcador').value = lot.marcador || '';
  openModal('modal-lotacao');
};
window.salvarLotacao = async () => {
  const id = $('nl-id').value;
  const parent = $('nl-parent').value ? Number($('nl-parent').value) : null;
  const params = {
    p_nome: $('nl-nome').value.trim(),
    p_tipo: $('nl-tipo').value,
    p_marcador: $('nl-marcador').value.trim() || null,
  };
  let r;
  if (id) {
    r = await sb.rpc('fn_editar_lotacao', { p_lotacao_id: Number(id), ...params });
  } else {
    r = await sb.rpc('fn_criar_lotacao', { ...params, p_parent_id: parent });
  }
  if (r.error) return showToast('Erro: ' + r.error.message, 'error');
  await registrarLog(id ? 'EDIÇÃO DE LOTAÇÃO' : 'CADASTRO DE LOTAÇÃO', null, params.p_nome, {
    lotacao_id: id ? Number(id) : null,
    parent_id: parent,
    tipo: params.p_tipo
  });
  showToast(id ? 'Lotação atualizada' : 'Lotação criada', 'success');
  closeModal('modal-lotacao');
  await recarregarLotacoes();
  renderLotacoes();
};

window.abrirMoverLotacao = (id) => {
  const lot = state.lotacoes.find(l => l.id == id);
  if (!lot) return;
  $('mov-id').value = id;
  $('mov-info').innerHTML = `<strong>${htmlEscape(lot.nome)}</strong><br><small>Pai atual: ${htmlEscape(state.lotacoes.find(x => x.id == lot.parent_id)?.nome || 'Raiz')}</small>`;
  $('mov-novo-parent').innerHTML = '<option value="">Raiz (sem pai)</option>' +
    state.lotacoes.filter(l => l.id != id).sort((a,b)=>a.nome.localeCompare(b.nome))
      .map(l => `<option value="${l.id}">${htmlEscape(l.nome)} [${l.tipo}]</option>`).join('');
  openModal('modal-mover-lotacao');
};
window.confirmarMoverLotacao = async () => {
  const id = Number($('mov-id').value);
  const novoParent = $('mov-novo-parent').value ? Number($('mov-novo-parent').value) : null;
  const { error } = await sb.rpc('fn_mover_lotacao', { p_lotacao_id: id, p_novo_parent: novoParent });
  if (error) return showToast('Erro: ' + error.message, 'error');
  await registrarLog('MOVIMENTAÇÃO DE LOTAÇÃO', null, state.lotacoes.find(l => l.id == id)?.nome || `Lotação ID ${id}`, {
    lotacao_id: id,
    novo_parent_id: novoParent
  });
  showToast('Lotação movida', 'success');
  closeModal('modal-mover-lotacao');
  await recarregarLotacoes();
  renderLotacoes();
};

window.inativarLotacao = async (id) => {
  if (!confirm('Confirma inativar essa lotação?')) return;
  const { error } = await sb.rpc('fn_inativar_lotacao', { p_lotacao_id: id });
  if (error) return showToast('Erro: ' + error.message, 'error');
  await registrarLog('INATIVAÇÃO DE LOTAÇÃO', null, state.lotacoes.find(l => l.id == id)?.nome || `Lotação ID ${id}`, { lotacao_id: id });
  showToast('Lotação inativada', 'success');
  await recarregarLotacoes();
  renderLotacoes();
};

async function recarregarLotacoes() {
  const { data } = await sb.from('v_lotacoes_com_count').select('*').range(0, 9999).order('nome');
  if (data) state.lotacoes = data.filter(l => l.ativo !== false);
}

// === Submit modais ===
document.addEventListener('click', (e) => {
  if (e.target.closest('#btn-salvar-ferias'))         salvarFerias();
  if (e.target.closest('#btn-salvar-lotacao'))        window.salvarLotacao();
  if (e.target.closest('#btn-confirmar-mover'))       window.confirmarMoverLotacao();
  if (e.target.closest('#btn-cadastrar-pendente'))    salvarCadastrarPendente();
});

const FERIAS_TIPOS = { regular: 'Regulamentar', premio: 'Licença-Prêmio', licenca: 'Licença', abono: 'Abono' };

async function salvarFerias() {
  const funcId = Number($('fer-func-id').value);
  if (!funcId) return showToast('Selecione um servidor', 'warning');
  const inicio = $('fer-inicio').value, fim = $('fer-fim').value;
  if (!inicio || !fim) return showToast('Datas obrigatórias', 'warning');
  if (fim < inicio) return showToast('A data de término deve ser depois do início', 'warning');
  const btn = $('btn-salvar-ferias'); btn.disabled = true;
  const { error } = await sb.from('funcionario_ferias').insert([{
    funcionario_id: funcId,
    data_inicio: inicio,
    data_fim:    fim,
    tipo:        FERIAS_TIPOS[$('fer-tipo').value] || 'Regulamentar',
    observacao:  $('fer-obs').value.trim() || null,
    ativo: true
  }]);
  btn.disabled = false;
  if (error) return showToast('Erro: ' + error.message, 'error');
  await registrarLog('FÉRIAS AGENDADA', funcId, $('fer-search').value || 'Servidor(a)', { inicio, fim });
  showToast('Férias agendadas', 'success');
  closeModal('modal-ferias');
  renderFerias();
}

async function salvarCadastrarPendente() {
  const pendId = Number($('cad-pend-id').value);
  const lotId = $('cad-pend-lotacao').value ? Number($('cad-pend-lotacao').value) : null;
  const vincId = $('cad-pend-vinculo').value ? Number($('cad-pend-vinculo').value) : null;
  if (!lotId || !vincId) return showToast('Lotação e vínculo são obrigatórios', 'warning');
  const { error } = await sb.rpc('fn_resolver_pendente_novo', {
    p_pendente_id: pendId,
    p_lotacao_id:  lotId,
    p_vinculo_id:  vincId,
    p_funcao:      $('cad-pend-funcao').value.trim() || null,
    p_turno_id:    $('cad-pend-turno').value ? Number($('cad-pend-turno').value) : null,
  });
  if (error) return showToast('Erro: ' + error.message, 'error');
  await registrarLog('CADASTRO VIA PENDÊNCIA', null, `Pendência ID ${pendId}`, {
    lotacao_id: lotId,
    vinculo_id: vincId
  });
  showToast('Servidor cadastrado', 'success');
  closeModal('modal-cadastrar-pendente');
  renderPendentes();
}

// ╔══════════════════════════════════════════════════════════════╗
// ║                         LICENÇAS                              ║
// ╚══════════════════════════════════════════════════════════════╝
rotas.licencas = { titulo: 'Licenças e Afastamentos', bread: 'Licenças', render: renderLicencas };

// Janela de aviso: licenças que vencem em até N dias (ou já vencidas e ainda ativas)
const LIC_AVISO_DIAS = 30;
const LIC_URGENTE_DIAS = 7;

// Filtro ativo pelo clique nos cards de KPI (soft-match, alinhado à view v_licencas_kpis)
window._licKpiFiltro = '';
window._licVencFiltro = ''; // '' | 'proximas' | 'vencidas'

function diasAteData(dataStr) {
  if (!dataStr) return null;
  const fim = new Date(dataStr + 'T00:00:00');
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((fim - hoje) / 86400000);
}

function classificarLicencasVencimento(lista) {
  const vencidas = [];
  const urgentes = [];
  const proximas = [];
  for (const l of (lista || [])) {
    if (!l.data_final) continue;
    const d = diasAteData(l.data_final);
    if (d == null) continue;
    if (d < 0) vencidas.push({ ...l, dias_restantes: d });
    else if (d <= LIC_URGENTE_DIAS) urgentes.push({ ...l, dias_restantes: d });
    else if (d <= LIC_AVISO_DIAS) proximas.push({ ...l, dias_restantes: d });
  }
  const sortAsc = (a, b) => a.dias_restantes - b.dias_restantes;
  vencidas.sort(sortAsc);
  urgentes.sort(sortAsc);
  proximas.sort(sortAsc);
  return { vencidas, urgentes, proximas, total: vencidas.length + urgentes.length + proximas.length };
}

function montarHtmlAlertaLicenca(info, { compacto = false } = {}) {
  if (!info || info.total === 0) return '';
  const urgente = info.vencidas.length > 0 || info.urgentes.length > 0;
  const partes = [];
  if (info.vencidas.length) {
    partes.push(`<strong>${info.vencidas.length}</strong> vencida(s) e ainda ativa(s)`);
  }
  if (info.urgentes.length) {
    partes.push(`<strong>${info.urgentes.length}</strong> vencendo em até ${LIC_URGENTE_DIAS} dias`);
  }
  if (info.proximas.length) {
    partes.push(`<strong>${info.proximas.length}</strong> vencendo em até ${LIC_AVISO_DIAS} dias`);
  }

  const exemplos = [...info.vencidas, ...info.urgentes, ...info.proximas]
    .slice(0, compacto ? 2 : 4)
    .map(l => {
      const d = l.dias_restantes;
      const rotulo = d < 0
        ? `vencida há ${Math.abs(d)} dia(s)`
        : d === 0 ? 'vence hoje' : `vence em ${d} dia(s)`;
      return `${htmlEscape(l.nome)} (${rotulo})`;
    })
    .join(' · ');

  const filtroAlvo = info.vencidas.length && !info.urgentes.length && !info.proximas.length
    ? 'vencidas'
    : 'proximas';

  return `
    <div class="alerta-licenca${urgente ? ' urgente' : ''}" role="status">
      <i class="ti ti-alert-triangle"></i>
      <div class="alerta-licenca-body">
        <p class="alerta-licenca-title">${urgente ? 'Atenção: licenças com vencimento crítico' : 'Licenças próximas do vencimento'}</p>
        <p class="alerta-licenca-msg">${partes.join(' · ')}.${exemplos ? ` Ex.: ${exemplos}.` : ''}</p>
        <div class="alerta-licenca-actions">
          <button type="button" class="btn-link-lic" onclick="abrirLicencasComAlerta('${filtroAlvo}')">Ver em Licenças</button>
          ${!compacto ? `<button type="button" class="btn-link-lic" onclick="abrirLicencasComAlerta('vencidas')" style="${info.vencidas.length ? '' : 'display:none'}">Só vencidas</button>` : ''}
        </div>
      </div>
    </div>`;
}

async function atualizarAlertasLicenca() {
  try {
    const { data } = await sb.from('v_licencas_atuais')
      .select('funcionario_id, nome, matricula, tipo_afastamento, data_final')
      .not('data_final', 'is', null);
    const info = classificarLicencasVencimento(data || []);
    window._licAlertasCache = info;

    const badge = $('badge-licencas');
    if (badge) {
      if (info.total > 0) {
        badge.textContent = info.total;
        badge.style.display = '';
        badge.title = `${info.total} licença(s) próxima(s) do vencimento ou vencida(s)`;
      } else {
        badge.style.display = 'none';
      }
    }

    const htmlPainel = montarHtmlAlertaLicenca(info, { compacto: true });
    const elPainel = $('alerta-licencas-painel');
    if (elPainel) {
      elPainel.innerHTML = htmlPainel;
      elPainel.hidden = !htmlPainel;
    }

    const htmlPage = montarHtmlAlertaLicenca(info, { compacto: false });
    const elPage = $('alerta-licencas-page');
    if (elPage) {
      elPage.innerHTML = htmlPage;
      elPage.hidden = !htmlPage;
    }
  } catch (e) {
    console.warn('Alertas de licença:', e);
  }
}

window.abrirLicencasComAlerta = (filtro) => {
  window._licVencFiltro = filtro || 'proximas';
  window._licKpiFiltro = '';
  if (location.hash === '#licencas') {
    renderLicencas();
  } else {
    location.hash = '#licencas';
  }
};

function normalizarTextoLicenca(txt) {
  return (txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tipoLicencaCorrespondeKpi(tipo, kpiKey) {
  if (!kpiKey) return true;
  const t = normalizarTextoLicenca(tipo);
  if (kpiKey === 'premio') return t.includes('premio');
  if (kpiKey === 'tratamento_saude') return t.includes('tratamento de saude') || t.includes('medica');
  if (kpiKey === 'capacitacao') return t.includes('capacitacao');
  if (kpiKey === 'interesse_particular') return t.includes('interesse particular') || t.includes('interesses particulares');
  if (kpiKey === 'amamentacao') return t.includes('amamenta');
  return true;
}

function atualizarDestaqueCardsLicenca() {
  $$('#licencas-kpis .stat.clickable').forEach(el => {
    el.classList.toggle('active', (el.dataset.kpi || '') === (window._licKpiFiltro || ''));
  });
}

window.filtrarLicencasPorKpi = (kpiKey) => {
  // Clique no mesmo card ativo limpa o filtro
  window._licKpiFiltro = (window._licKpiFiltro === kpiKey) ? '' : (kpiKey || '');
  window._licVencFiltro = '';
  if ($('lic-tipo-filtro')) $('lic-tipo-filtro').value = '';
  atualizarDestaqueCardsLicenca();
  if (window._licencasCache) renderTabelaLicencas(window._licencasCache);
};

async function renderLicencas() {
  atualizarAlertasLicenca();
  const kpis = await handleErr(await sb.from('v_licencas_kpis').select('*').single(), 'KPIs licencas');
  if (kpis) {
    const cards = [
      ['Total Afastados',     kpis.total_afastados,     'No momento',                 'var(--gov-orange)',      ''],
      ['Licença Prêmio',      kpis.premio,              'Concedidas',                 'var(--gov-blue-primary)', 'premio'],
      ['Tratamento de Saúde', kpis.tratamento_saude,    'Licença médica',             'var(--gov-red)',          'tratamento_saude'],
      ['Capacitação',         kpis.capacitacao,         'Estudo / qualificação',      'var(--gov-blue-dark)',    'capacitacao'],
      ['Interesse Particular',kpis.interesse_particular,'Sem vencimentos',            '#534AB7',                 'interesse_particular'],
      ['Amamentação',         kpis.amamentacao,         'Mães lactantes',             'var(--gov-green)',        'amamentacao'],
    ];
    $('licencas-kpis').innerHTML = cards.map(([lbl, val, sub, cor, kpi]) => `
      <div class="stat clickable${(window._licKpiFiltro || '') === kpi ? ' active' : ''}" style="border-left-color:${cor}" data-kpi="${kpi}" onclick="filtrarLicencasPorKpi('${kpi}')" title="Clique para filtrar">
        <div class="stat-lbl">${lbl}</div>
        <div class="stat-val">${(val||0).toLocaleString('pt-BR')}</div>
        <div class="stat-sub">${sub}</div>
      </div>`).join('');
  }
  
  carregarTabelaLicencas();
}

function isLotacaoLicencasEsp(nome) {
  return /licen[cç]as\s+e\s+afastamentos/i.test(nome || '');
}

async function carregarTabelaLicencas() {
  const { data } = await sb.from('v_licencas_atuais').select('*').order('nome');
  if (!data) return;

  // Complementa com lotação atual (para RH definir lotação original quando ainda estiver em Licenças)
  const ids = [...new Set(data.map(l => l.funcionario_id).filter(Boolean))];
  let lotMap = {};
  if (ids.length) {
    const { data: atuais } = await sb.from('v_funcionarios_atual')
      .select('funcionario_id, lotacao_atual_id, lotacao_id, lotacao_nome, caminho_lotacao')
      .in('funcionario_id', ids);
    lotMap = Object.fromEntries((atuais || []).map(a => [a.funcionario_id, a]));
  }

  const enriquecida = data.map(l => {
    const a = lotMap[l.funcionario_id] || {};
    const lotNome = a.caminho_lotacao || a.lotacao_nome || l.lotacao_nome || '';
    return {
      ...l,
      lotacao_id: a.lotacao_atual_id ?? a.lotacao_id ?? null,
      lotacao_nome: lotNome,
      precisa_definir_lotacao: !lotNome || isLotacaoLicencasEsp(lotNome)
    };
  });

  window._licencasCache = enriquecida;
  // Popula o filtro de tipo com os tipos realmente presentes (filtragem inteligente)
  const tipos = [...new Set(enriquecida.map(l => (l.tipo_afastamento || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const sel = $('lic-tipo-filtro');
  if (sel) {
    const atual = sel.value;
    sel.innerHTML = '<option value="">Todos os tipos</option>' +
      tipos.map(t => `<option value="${htmlEscape(t)}">${htmlEscape(t)}</option>`).join('');
    if (tipos.includes(atual)) sel.value = atual;
  }
  renderTabelaLicencas(enriquecida);
}

function renderTabelaLicencas(lista) {
    const termo = ($('lic-search')?.value || '').toLowerCase().trim();
    const tipoFiltro = $('lic-tipo-filtro')?.value || '';
    const periodoFiltro = $('lic-periodo-filtro')?.value || '';
    const kpiFiltro = window._licKpiFiltro || '';
    const vencFiltro = window._licVencFiltro || '';
    const data = lista.filter(l => {
      if (kpiFiltro && !tipoLicencaCorrespondeKpi(l.tipo_afastamento, kpiFiltro)) return false;
      if (tipoFiltro && (l.tipo_afastamento || '').trim() !== tipoFiltro) return false;
      if (periodoFiltro === 'determinado' && !l.data_final) return false;
      if (periodoFiltro === 'indeterminado' && l.data_final) return false;
      if (vencFiltro) {
        const d = diasAteData(l.data_final);
        if (d == null) return false;
        if (vencFiltro === 'vencidas' && d >= 0) return false;
        if (vencFiltro === 'proximas' && !(d < 0 || d <= LIC_AVISO_DIAS)) return false;
      }
      if (termo) {
        const alvo = `${l.nome || ''} ${l.matricula || ''} ${l.lotacao_nome || ''}`.toLowerCase();
        if (!termo.split(/\s+/).every(p => alvo.includes(p))) return false;
      }
      return true;
    });
    // Pendentes de lotação / vencimento primeiro
    data.sort((a, b) => {
      const da = diasAteData(a.data_final);
      const db = diasAteData(b.data_final);
      const prioA = (a.precisa_definir_lotacao ? 2 : 0) + (da != null && da <= LIC_AVISO_DIAS ? 1 : 0);
      const prioB = (b.precisa_definir_lotacao ? 2 : 0) + (db != null && db <= LIC_AVISO_DIAS ? 1 : 0);
      if (prioB !== prioA) return prioB - prioA;
      if (da != null && db != null && da !== db) return da - db;
      return (a.nome || '').localeCompare(b.nome || '');
    });
    const pendentes = lista.filter(l => l.precisa_definir_lotacao).length;
    const cnt = $('lic-count');
    if (cnt) {
      let extra = '';
      if (vencFiltro) {
        extra += ` · <span style="color:var(--gov-orange);font-weight:700">filtro: ${vencFiltro === 'vencidas' ? 'vencidas' : 'próximas do vencimento'}</span>`;
      }
      if (pendentes) extra += ` · <span style="color:var(--gov-orange);font-weight:700">${pendentes} pendente(s) de lotação</span>`;
      cnt.innerHTML = `<strong>${data.length}</strong> de ${lista.length} afastado(s)` + extra;
    }
    if (data.length === 0) {
      $('tbody-licencas').innerHTML = `<tr><td colspan="6"><div class="empty-state">${lista.length === 0 ? 'Nenhum afastamento encontrado' : 'Nenhum afastamento corresponde aos filtros'}</div></td></tr>`;
      return;
    }
    $('tbody-licencas').innerHTML = data.map(l => {
      const dias = diasAteData(l.data_final);
      let vencHtml = '';
      let rowBg = l.precisa_definir_lotacao ? 'background:#fff8f0' : '';
      if (dias != null && dias < 0) {
        vencHtml = `<div style="font-size:11px;color:var(--gov-red);font-weight:700"><i class="ti ti-alert-triangle"></i> Vencida há ${Math.abs(dias)} dia(s)</div>`;
        rowBg = rowBg || 'background:#fff5f5';
      } else if (dias != null && dias <= LIC_URGENTE_DIAS) {
        vencHtml = `<div style="font-size:11px;color:var(--gov-red);font-weight:700"><i class="ti ti-clock"></i> ${dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia(s)`}</div>`;
        rowBg = rowBg || 'background:#fff5f5';
      } else if (dias != null && dias <= LIC_AVISO_DIAS) {
        vencHtml = `<div style="font-size:11px;color:var(--gov-orange);font-weight:600"><i class="ti ti-clock"></i> Vence em ${dias} dia(s)</div>`;
        rowBg = rowBg || 'background:#fffaf3';
      }
      return `
      <tr${rowBg ? ` style="${rowBg}"` : ''}>
        <td>
          <div style="font-weight:600;color:var(--gov-blue-dark)">${htmlEscape(l.nome)}</div>
          <div style="font-size:12px;color:var(--color-text-sec)">Mat: ${htmlEscape(l.matricula||'S/M')}</div>
        </td>
        <td>
          <span class="badge" style="background:#fff9e6;color:var(--gov-orange)"><i class="ti ti-activity"></i> ${htmlEscape(l.tipo_afastamento)}</span>
        </td>
        <td>
          ${l.precisa_definir_lotacao
            ? `<div style="font-size:12px;color:var(--gov-orange);font-weight:700"><i class="ti ti-alert-circle"></i> Pendente de lotação</div>
               <div style="font-size:11px;color:var(--color-text-muted)">${htmlEscape(l.lotacao_nome || 'Sem lotação original')}</div>`
            : `<div style="font-size:12px">${htmlEscape(l.lotacao_nome || '—')}</div>`}
        </td>
        <td>
          <div style="font-size:12px">${l.data_inicial ? l.data_inicial.split('-').reverse().join('/') : 'Indeterminado'}</div>
          <div style="font-size:12px">${l.data_final ? l.data_final.split('-').reverse().join('/') : 'Indeterminado'}</div>
          ${vencHtml}
        </td>
        <td>
          <div style="font-size:12px">Portaria: ${htmlEscape(l.portaria||'-')}</div>
          <div style="font-size:12px">SEI: ${htmlEscape(l.num_sei||'-')}</div>
        </td>
        <td>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start">
            <span style="color:var(--gov-orange);font-weight:600;font-size:12px"><i class="ti ti-clock"></i> Afastado</span>
            ${l.precisa_definir_lotacao
              ? `<button class="btn-primary" style="padding:6px 10px;font-size:12px" onclick="definirLotacaoLicenca(${l.funcionario_id})" title="RH: informar a lotação original do servidor">
                   <i class="ti ti-building"></i> Definir lotação
                 </button>`
              : `<button class="btn-secondary" style="padding:6px 10px;font-size:12px" onclick="enviarLicencaParaSemLotacao(${l.funcionario_id}, ${l.licenca_id || 'null'})" title="Remove a lotação atual; o servidor vai para Sem Lotação e o histórico guarda de onde veio">
                   <i class="ti ti-map-off"></i> Sem Lotação
                 </button>`}
            ${l.licenca_id
              ? `<button class="btn-icon" onclick="abrirEditarTipoLicenca(${l.licenca_id})" title="Editar esta licença">
                   <i class="ti ti-edit"></i> Editar
                 </button>`
              : ''}
            <button class="btn-icon" onclick="retornarAtiva(${l.licenca_id || 'null'}, ${l.funcionario_id})" title="Encerrar e Retornar à Ativa">
              <i class="ti ti-arrow-back-up"></i> Retornar à Ativa
            </button>
            <button class="btn-icon" onclick="verHistorico(${l.funcionario_id})" title="Ver histórico de lotações">
              <i class="ti ti-history"></i> Histórico
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
}

window.definirLotacaoLicenca = async (funcionario_id) => {
  // Usa a mesma árvore da Gestão de Lotações e permite servidor sem lotação ativa
  await abrirTransferencia(funcionario_id, { fromLicencas: true });
};

/** Remove lotação ativa → servidor vai para Sem Lotação; histórico guarda de onde veio e a data. */
window.enviarLicencaParaSemLotacao = async (funcionario_id, licenca_id) => {
  const lic = (window._licencasCache || []).find((l) => Number(l.funcionario_id) === Number(funcionario_id));
  const nome = lic?.nome || 'Servidor(a)';
  const lotNome = lic?.lotacao_nome || 'lotação atual';
  if (!confirm(
    `Enviar “${nome}” para Sem Lotação?\n\n` +
    `A lotação “${lotNome}” será encerrada e ficará no histórico com a data de hoje.\n` +
    `A licença/afastamento continua registrada.`
  )) return;

  try {
    const { data: atuais, error: e1 } = await sb.from('funcionario_lotacao')
      .select('id, lotacao_id, funcao, observacao, data_inicio')
      .eq('funcionario_id', funcionario_id)
      .eq('ativo', true);
    if (e1) throw e1;
    if (!atuais?.length) {
      showToast('Este servidor já está sem lotação ativa.', 'info');
      atualizarBadgesSemLotacaoExonerados();
      return;
    }

    const hoje = new Date().toISOString().slice(0, 10);
    const lotMap = Object.fromEntries((state.lotacoes || []).map((l) => [l.id, l.nome]));

    for (const fl of atuais) {
      const deOnde = lotMap[fl.lotacao_id] || 'lotação';
      const obsBase = (fl.observacao || '').trim();
      const obsNova = [
        obsBase,
        `Encerrado em ${hoje.split('-').reverse().join('/')}: enviado para Sem Lotação (via Licenças). Origem: ${deOnde}.`
      ].filter(Boolean).join(' | ');

      const { error } = await sb.from('funcionario_lotacao').update({
        ativo: false,
        data_fim: hoje,
        observacao: obsNova
      }).eq('id', fl.id);
      if (error) throw error;
    }

    await registrarLog('ENVIO PARA SEM LOTAÇÃO', funcionario_id, nome, {
      licenca_id: licenca_id || null,
      lotacao_anterior: lotNome,
      data: hoje,
      origem: 'licencas'
    });

    showToast(`${nome} foi para Sem Lotação. O histórico guarda de onde veio.`, 'success');
    gsInvalidarCache();
    invalidarCacheFiltros();
    atualizarBadgesSemLotacaoExonerados();
    if (state.rotaAtual === 'licencas') carregarTabelaLicencas();
    if (state.rotaAtual === 'sem-lotacao') renderSemLotacao();
  } catch (e) {
    showToast(e.message || String(e), 'error');
  }
};

$('lic-search')?.addEventListener('input', debounce(() => {
  if (window._licencasCache) renderTabelaLicencas(window._licencasCache);
}, 200));
$('lic-tipo-filtro')?.addEventListener('change', () => {
  // Select de tipo exato prevalece sobre o filtro do card
  window._licKpiFiltro = '';
  window._licVencFiltro = '';
  atualizarDestaqueCardsLicenca();
  if (window._licencasCache) renderTabelaLicencas(window._licencasCache);
});
$('lic-periodo-filtro')?.addEventListener('change', () => {
  if (window._licencasCache) renderTabelaLicencas(window._licencasCache);
});
$('lic-limpar')?.addEventListener('click', () => {
  if ($('lic-search')) $('lic-search').value = '';
  if ($('lic-tipo-filtro')) $('lic-tipo-filtro').value = '';
  if ($('lic-periodo-filtro')) $('lic-periodo-filtro').value = '';
  window._licKpiFiltro = '';
  window._licVencFiltro = '';
  atualizarDestaqueCardsLicenca();
  if (window._licencasCache) renderTabelaLicencas(window._licencasCache);
});

window.retornarAtiva = async (licenca_id, funcionario_id) => {
  if (!confirm('Deseja encerrar este afastamento e retornar o servidor à ativa?')) return;
  
  const hoje = new Date().toISOString().split('T')[0];
  let query = sb.from('funcionario_licencas')
    .update({ ativo: false, data_final: hoje })
    .eq('ativo', true);
  query = licenca_id ? query.eq('id', licenca_id) : query.eq('funcionario_id', funcionario_id);
  const { error } = await query;
    
  if (error) {
    return showToast('Erro ao encerrar afastamento: ' + error.message, 'error');
  }
  
  const licenca = (window._licencasCache || []).find(l => Number(l.licenca_id) === Number(licenca_id));
  await registrarLog('ENCERRAMENTO DE LICENÇA', funcionario_id, licenca?.nome || 'Servidor(a)', {
    licenca_id: licenca_id || null,
    data_final: hoje
  });
  showToast('Afastamento encerrado! O servidor permanece na lotação original.', 'success');
  carregarTabelaLicencas();
  carregarFuncionarios();
};

const TIPOS_LICENCA_OFICIAIS = [
  'Licença Prêmio',
  'Licença para tratamento de saúde',
  'Licença capacitação',
  'Licença para tratar de interesse particular',
  'Licença amamentação'
];

window.abrirEditarTipoLicenca = (licenca_id) => {
  const licenca = (window._licencasCache || []).find(l => Number(l.licenca_id) === Number(licenca_id));
  if (!licenca) return showToast('Registro de licença não encontrado. Atualize a página e tente novamente.', 'warning');

  const atual = (licenca.tipo_afastamento || '').trim();
  $('edit-licenca-id').value = licenca_id;
  $('edit-licenca-servidor').innerHTML = `<strong>${htmlEscape(licenca.nome || 'Servidor')}</strong><br><small>Mat: ${htmlEscape(licenca.matricula || 'S/M')}</small>`;
  if (TIPOS_LICENCA_OFICIAIS.includes(atual)) {
    $('edit-licenca-tipo').value = atual;
    $('edit-licenca-outro').value = '';
    $('edit-licenca-outro-group').style.display = 'none';
  } else {
    $('edit-licenca-tipo').value = 'Outros';
    $('edit-licenca-outro').value = atual;
    $('edit-licenca-outro-group').style.display = '';
  }
  $('edit-licenca-inicio').value = licenca.data_inicial || '';
  $('edit-licenca-fim').value = licenca.data_final || '';
  $('edit-licenca-portaria').value = licenca.portaria || '';
  $('edit-licenca-sei').value = licenca.num_sei || '';
  $('edit-licenca-obs').value = licenca.observacao || '';
  openModal('modal-editar-tipo-licenca');
};

$('edit-licenca-tipo')?.addEventListener('change', () => {
  $('edit-licenca-outro-group').style.display = $('edit-licenca-tipo').value === 'Outros' ? '' : 'none';
});

$('btn-salvar-tipo-licenca')?.addEventListener('click', async () => {
  const licencaId = Number($('edit-licenca-id').value);
  const licenca = (window._licencasCache || []).find(l => Number(l.licenca_id) === licencaId);
  if (!licencaId || !licenca) return showToast('Registro de licença inválido.', 'error');

  let tipoNovo = $('edit-licenca-tipo').value;
  if (tipoNovo === 'Outros') tipoNovo = $('edit-licenca-outro').value.trim().replace(/\s+/g, ' ');
  if (!tipoNovo) return showToast('Informe o tipo correto da licença.', 'warning');
  const inicio = $('edit-licenca-inicio').value;
  if (!inicio) return showToast('Informe a data inicial.', 'warning');

  const payload = {
    tipo_afastamento: tipoNovo,
    data_inicial: inicio,
    data_final: $('edit-licenca-fim').value || null,
    portaria: $('edit-licenca-portaria').value.trim() || null,
    num_sei: $('edit-licenca-sei').value.trim() || null,
    observacao: $('edit-licenca-obs').value.trim() || null
  };

  const btn = $('btn-salvar-tipo-licenca');
  btn.disabled = true;
  const { data, error } = await sb.from('funcionario_licencas')
    .update(payload)
    .eq('id', licencaId)
    .eq('ativo', true)
    .select('id')
    .single();
  btn.disabled = false;
  if (error || !data) return showToast('Erro ao editar licença: ' + (error?.message || 'registro não atualizado'), 'error');

  await registrarLog('EDIÇÃO DE LICENÇA', Number(licenca.funcionario_id), licenca.nome || 'Servidor(a)', {
    licenca_id: licencaId,
    tipo_anterior: (licenca.tipo_afastamento || '').trim(),
    ...payload
  });
  closeModal('modal-editar-tipo-licenca');
  showToast('Licença atualizada com sucesso.', 'success');
  renderLicencas();
});

window.abrirModalLicenca = async (id = null) => {
  $('lic-func-id').value = id || '';
  $('lic-tipo').value = 'Licença Prêmio';
  $('lic-tipo-outro').value = '';
  $('lic-tipo-outro-group').style.display = 'none';
  $('lic-inicio').value = '';
  $('lic-fim').value = '';
  $('lic-portaria').value = '';
  $('lic-sei').value = '';
  $('lic-obs').value = '';

  const divFunc = $('lic-func-container');

  if (id) {
    const func = await sb.from('funcionarios').select('nome').eq('id', id).single().then(r => r.data);
    divFunc.innerHTML = `<label class="form-label">Servidor</label><input type="text" id="lic-func-nome" class="form-control" disabled value="${func ? htmlEscape(func.nome) : ''}">`;
  } else {
    divFunc.innerHTML = `<label class="form-label">Servidor *</label><input type="text" class="form-control" placeholder="Carregando servidores..." disabled>`;
    
    // Fetch data asynchronously
    fetchTudo('v_funcionarios_atual', 'funcionario_id, nome, matricula', 'nome').then(({ data }) => {
      window._licAutocompleteData = data || [];
      divFunc.innerHTML = `
        <label class="form-label">Servidor *</label>
        <div style="position:relative">
          <input type="text" id="lic-func-search" class="form-control" placeholder="Digite nome ou matrícula..." oninput="filtrarLicAutocomplete(this.value)" autocomplete="off">
          <div id="lic-func-sugestoes" style="display:none; position:absolute; top:100%; left:0; right:0; max-height:200px; overflow-y:auto; background:#fff; border:1px solid var(--gov-border); z-index:999; border-radius:4px; box-shadow:var(--shadow-md)"></div>
        </div>
      `;
    });
  }
  openModal('modal-licenca');
};

window.filtrarLicAutocomplete = (val) => {
  const box = $('lic-func-sugestoes');
  $('lic-func-id').value = '';
  if(!val || val.length < 2) { box.style.display = 'none'; return; }
  
  const palavras = val.toLowerCase().trim().split(/\s+/);
  const filtrados = window._licAutocompleteData.filter(f => {
    const nome = f.nome.toLowerCase();
    const mat = (f.matricula && String(f.matricula).toLowerCase()) || '';
    return palavras.every(p => nome.includes(p) || mat.includes(p));
  }).slice(0, 30);
  
  if(filtrados.length === 0) {
    box.innerHTML = '<div style="padding:10px; color:var(--color-text-muted); font-size:12px">Nenhum servidor encontrado</div>';
  } else {
    box.innerHTML = filtrados.map(f => `
      <div style="padding:10px; border-bottom:1px solid var(--gov-border); cursor:pointer; font-size:13px; line-height:1.4" 
           onmouseover="this.style.background='var(--gov-blue-light)'" 
           onmouseout="this.style.background='#fff'"
           onclick="selecionarLicAutocomplete(${f.funcionario_id}, '${htmlEscape(f.nome).replace(/'/g,"\\'")} - Mat: ${htmlEscape(String(f.matricula || 'S/M')).replace(/'/g,"\\'")}')">
        <div style="font-weight:600; color:var(--gov-blue-dark)">${htmlEscape(f.nome)}</div>
        <div style="font-size:11px; color:var(--color-text-muted)">Matrícula: ${f.matricula || 'S/M'}</div>
      </div>
    `).join('');
  }
  box.style.display = 'block';
};

window.selecionarLicAutocomplete = (id, label) => {
  $('lic-func-id').value = id;
  $('lic-func-search').value = label;
  $('lic-func-sugestoes').style.display = 'none';
};

// Toggle do campo "Especificar (Outros)" no modal de licença
$('lic-tipo').addEventListener('change', () => {
  $('lic-tipo-outro-group').style.display = $('lic-tipo').value === 'Outros' ? '' : 'none';
});

$('btn-salvar-licenca').onclick = async () => {
  let fId = $('lic-func-id').value;
  if(!fId) return showToast('Selecione um servidor na lista', 'warning');

  let tipo = $('lic-tipo').value;
  if (tipo === 'Outros') {
    const esp = $('lic-tipo-outro').value.trim();
    if (!esp) return showToast('Especifique o tipo de afastamento (opção Outros).', 'warning');
    tipo = esp;
  }
  if (!$('lic-inicio').value) return showToast('Informe a data inicial do afastamento.', 'warning');

  const nome = $('lic-func-search')?.value || $('lic-func-nome')?.value || 'Servidor(a)';
  const btn = $('btn-salvar-licenca');
  btn.disabled = true;
  const res = await salvarAfastamento({
    funcId: fId,
    nome,
    tipo,
    inicio: $('lic-inicio').value,
    fim: $('lic-fim').value,
    portaria: $('lic-portaria').value,
    sei: $('lic-sei').value,
    obs: $('lic-obs').value
  });
  btn.disabled = false;
  if (!res.ok) return showToast(res.msg, 'error');
  showToast('Licença registrada! O servidor permanece na lotação original e consta em Licenças.', 'success');
  closeModal('modal-licenca');
  carregarFuncionarios();
  if (state.rotaAtual === 'licencas') renderLicencas();
};

// ==========================================
// MÓDULO CEDIDOS E RECEBIDOS
// ==========================================
rotas.cedidos = { titulo: 'Cedidos e Recebidos', bread: 'Cessão e Recebimento', render: renderCedidos };

const _cedFiltros = { busca: '', tipo: '', orgao: '' };

async function renderCedidos() {
  const kpis = await handleErr(await sb.from('v_cedencias_kpis').select('*').single(), 'KPIs cedidos');
  if (kpis) {
    $('cedidos-kpis').innerHTML = [
      ['Total Registrados',    kpis.total_registros || 0, 'Cessões e recebimentos', 'var(--gov-blue-primary)'],
      ['Cedidos (Saíram)',     kpis.total_cedidos || 0,   'Servidores em outros órgãos', 'var(--gov-yellow)'],
      ['Recebidos (Entraram)', kpis.total_recebidos || 0, 'Vindos de outros órgãos', 'var(--gov-green)'],
    ].map(([lbl, val, sub, cor]) => `
      <div class="stat" style="border-left-color:${cor}">
        <div class="stat-lbl">${lbl}</div>
        <div class="stat-val">${(val||0).toLocaleString('pt-BR')}</div>
        <div class="stat-sub">${sub}</div>
      </div>`).join('');
  }
  carregarTabelaCedidos();
}

async function carregarTabelaCedidos() {
  const { data } = await sb.from('v_cedencias_atuais').select('*').order('created_at', { ascending: false });
  window._cedidosCache = data || [];
  // Popula o dropdown de órgãos com os valores realmente existentes (filtragem inteligente)
  const orgaos = [...new Set((data || []).map(c => (c.orgao_destino_origem || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const sel = $('ced-orgao');
  if (sel) {
    const atual = sel.value;
    sel.innerHTML = '<option value="">Todos os órgãos</option>' +
      orgaos.map(o => `<option value="${htmlEscape(o)}">${htmlEscape(o)}</option>`).join('');
    if (orgaos.includes(atual)) sel.value = atual;
  }
  renderTabelaCedidos();
}

function renderTabelaCedidos() {
  const lista = window._cedidosCache || [];
  const termo = _cedFiltros.busca.toLowerCase().trim();
  const data = lista.filter(c => {
    if (_cedFiltros.tipo && c.tipo !== _cedFiltros.tipo) return false;
    if (_cedFiltros.orgao && (c.orgao_destino_origem || '').trim() !== _cedFiltros.orgao) return false;
    if (termo) {
      const alvo = `${c.nome || ''} ${c.matricula || ''} ${c.orgao_destino_origem || ''}`.toLowerCase();
      if (!termo.split(/\s+/).every(p => alvo.includes(p))) return false;
    }
    return true;
  });

  const cnt = $('ced-count');
  if (cnt) cnt.innerHTML = `<strong>${data.length}</strong> de ${lista.length} registro(s)`;

  if (data.length === 0) {
    $('tbody-cedidos').innerHTML = `<tr><td colspan="6" class="empty-state">${lista.length === 0 ? 'Nenhum registro encontrado.' : 'Nenhum registro corresponde aos filtros.'}</td></tr>`;
    return;
  }
  $('tbody-cedidos').innerHTML = data.map(c => `
      <tr>
        <td>
          <div style="font-weight:600;color:var(--gov-blue-dark)">${htmlEscape(c.nome)}</div>
          <div style="font-size:12px;color:var(--color-text-sec)">Mat: ${htmlEscape(c.matricula||'S/M')}</div>
        </td>
        <td>
          <span class="badge" style="background:${c.tipo === 'CEDIDO' ? '#fff4d6' : '#dcf0e3'}; color:${c.tipo === 'CEDIDO' ? '#8a6d00' : 'var(--gov-green)'}">
            <i class="ti ${c.tipo === 'CEDIDO' ? 'ti-arrow-up-right' : 'ti-arrow-down-left'}"></i> ${htmlEscape(c.tipo)}
          </span>
        </td>
        <td>
          <div style="font-weight:500">${htmlEscape(c.orgao_destino_origem)}</div>
          <div style="font-size:11px;color:var(--color-text-muted);font-style:italic">${htmlEscape(c.observacao||'')}</div>
        </td>
        <td>
          <div style="font-size:12px;font-weight:600">${htmlEscape(c.lotacao_nome||'S/Lotação')}</div>
          <div style="font-size:11px;color:var(--color-text-sec)">${htmlEscape(c.vinculo||'-')}</div>
        </td>
        <td style="font-size:12px;color:var(--color-text-muted)">${c.data_inicio ? fmtDt(c.data_inicio) : fmtDt(c.created_at)}</td>
        <td style="text-align:center">
          <button class="btn-icon" style="color:var(--gov-blue-primary)" title="Editar" onclick="editarCedencia(${c.id})"><i class="ti ti-pencil"></i></button>
          <button class="btn-icon" style="color:var(--gov-red)" title="Excluir" onclick="excluirCedencia(${c.id})"><i class="ti ti-trash"></i></button>
        </td>
      </tr>
    `).join('');
}

// Filtros de Cedidos (event listeners)
$('ced-busca')?.addEventListener('input', debounce(() => { _cedFiltros.busca = $('ced-busca').value; renderTabelaCedidos(); }, 200));
$('ced-tipo')?.addEventListener('change', () => { _cedFiltros.tipo = $('ced-tipo').value; renderTabelaCedidos(); });
$('ced-orgao')?.addEventListener('change', () => { _cedFiltros.orgao = $('ced-orgao').value; renderTabelaCedidos(); });
$('ced-limpar')?.addEventListener('click', () => {
  _cedFiltros.busca = ''; _cedFiltros.tipo = ''; _cedFiltros.orgao = '';
  if ($('ced-busca')) $('ced-busca').value = '';
  if ($('ced-tipo')) $('ced-tipo').value = '';
  if ($('ced-orgao')) $('ced-orgao').value = '';
  renderTabelaCedidos();
});

function cedidoPopularLotacoes(selectedId) {
  const sel = $('cedido-lotacao');
  if (!sel) return;
  const lots = [...(state.lotacoes || [])].filter((l) => l.ativo !== false)
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  sel.innerHTML = '<option value="">Selecione a lotação…</option>' +
    lots.map((l) => `<option value="${l.id}">${htmlEscape(l.nome)}</option>`).join('');
  if (selectedId) sel.value = String(selectedId);
}

window.cedidoAtualizarCamposTipo = function cedidoAtualizarCamposTipo() {
  const tipo = $('cedido-tipo')?.value || 'CEDIDO';
  const lbl = $('cedido-orgao-label');
  const hint = $('cedido-orgao-hint');
  const lotLbl = $('cedido-lotacao-label');
  if (lbl) lbl.textContent = tipo === 'CEDIDO' ? 'Órgão de destino *' : 'Órgão de origem *';
  if (hint) {
    hint.textContent = tipo === 'CEDIDO'
      ? 'Para onde o servidor vai (outra secretaria/órgão).'
      : 'De onde o servidor veio (outra secretaria/órgão).';
  }
  if (lotLbl) {
    lotLbl.textContent = tipo === 'RECEBIDO'
      ? 'Lotação no organograma SEMCAS *'
      : 'Lotação no organograma (opcional)';
  }
  if ($('cedido-orgao')) {
    $('cedido-orgao').placeholder = tipo === 'CEDIDO'
      ? 'Ex: SEMUS, SEMGOV, MINISTÉRIO PÚBLICO'
      : 'Ex: SETUR, SEMSA, COLISEU';
  }
};

window.editarCedencia = async (id) => {
  const { data } = await sb.from('funcionario_cedencias').select('*, funcionarios(nome, matricula)').eq('id', id).single();
  if (!data) return;
  await abrirModalCedido();
  window._cedAbrirToken = (window._cedAbrirToken || 0) + 1;
  $('cedido-func-id').value = data.funcionario_id;
  $('cedido-func-nome-container').innerHTML = `<label class="form-label">Servidor *</label><input type="text" class="form-control" value="${htmlEscape(data.funcionarios?.nome || '')}" disabled>`;
  $('cedido-tipo').value = data.tipo;
  $('cedido-orgao').value = data.orgao_destino_origem || '';
  $('cedido-obs').value = data.observacao || '';
  cedidoAtualizarCamposTipo();

  // Lotação atual do servidor no organograma
  let lotAtualId = '';
  try {
    const { data: fl } = await sb.from('funcionario_lotacao')
      .select('lotacao_id')
      .eq('funcionario_id', data.funcionario_id)
      .eq('ativo', true)
      .limit(1)
      .maybeSingle();
    lotAtualId = fl?.lotacao_id || '';
  } catch (_) { /* ok */ }
  cedidoPopularLotacoes(lotAtualId);

  let hid = $('cedencia-id-editar');
  if (!hid) {
    hid = document.createElement('input');
    hid.type = 'hidden';
    hid.id = 'cedencia-id-editar';
    $('cedido-func-nome-container').appendChild(hid);
  }
  hid.value = id;
};

window.excluirCedencia = async (id) => {
  if (confirm('Tem certeza que deseja excluir este registro de cedência?')) {
    const cedencia = (window._cedidosCache || []).find(c => Number(c.id) === Number(id));
    const { error } = await sb.from('funcionario_cedencias').delete().eq('id', id);
    if (error) return showToast('Erro ao excluir: ' + error.message, 'error');
    await registrarLog('EXCLUSÃO DE CEDÊNCIA', cedencia?.funcionario_id || null, cedencia?.nome || `Cedência ID ${id}`, {
      cedencia_id: id,
      tipo: cedencia?.tipo,
      orgao: cedencia?.orgao_destino_origem
    });
    showToast('Registro excluído com sucesso.', 'success');
    renderCedidos();
  }
};

window.abrirModalCedido = async () => {
  $('cedido-func-id').value = '';
  $('cedido-orgao').value = '';
  $('cedido-obs').value = '';
  if ($('cedido-tipo')) $('cedido-tipo').value = 'CEDIDO';
  if (!state.lotacoes?.length) await carregarLotacoesParaArvore();
  cedidoPopularLotacoes('');
  cedidoAtualizarCamposTipo();

  const divFunc = $('cedido-func-nome-container');
  divFunc.innerHTML = `<label class="form-label">Servidor *</label><input type="text" class="form-control" placeholder="Carregando servidores..." disabled>`;

  const tk = window._cedAbrirToken = (window._cedAbrirToken || 0) + 1;
  fetchTudo('v_funcionarios_atual', 'funcionario_id, nome, matricula', 'nome').then(({ data }) => {
    if (tk !== window._cedAbrirToken) return;
    window._cedAutocompleteData = data || [];
    divFunc.innerHTML = `
      <label class="form-label">Servidor *</label>
      <div style="position:relative">
        <input type="text" id="cedido-func-search" class="form-control" placeholder="Digite nome ou matrícula..." oninput="filtrarCedAutocomplete(this.value)" autocomplete="off">
        <div id="cedido-func-sugestoes" style="display:none; position:absolute; top:100%; left:0; right:0; max-height:200px; overflow-y:auto; background:#fff; border:1px solid var(--gov-border); z-index:999; border-radius:4px; box-shadow:var(--shadow-md)"></div>
      </div>
    `;
  });

  openModal('modal-cedido');
};

window.filtrarCedAutocomplete = (val) => {
  const box = $('cedido-func-sugestoes');
  $('cedido-func-id').value = '';
  if (!val || val.length < 2) { box.style.display = 'none'; return; }
  const palavras = val.toLowerCase().trim().split(/\s+/);
  const filtrados = window._cedAutocompleteData.filter(f => {
    const nome = f.nome.toLowerCase();
    const mat = (f.matricula && String(f.matricula).toLowerCase()) || '';
    return palavras.every(p => nome.includes(p) || mat.includes(p));
  }).slice(0, 30);
  if (filtrados.length === 0) {
    box.innerHTML = '<div style="padding:10px; color:var(--color-text-muted); font-size:12px">Nenhum servidor encontrado</div>';
  } else {
    box.innerHTML = filtrados.map(f => `
      <div style="padding:10px; border-bottom:1px solid var(--gov-border); cursor:pointer; font-size:13px; line-height:1.4" 
           onmouseover="this.style.background='var(--gov-blue-light)'" onmouseout="this.style.background='#fff'"
           onclick="selecionarCedAutocomplete(${f.funcionario_id}, '${htmlEscape(f.nome).replace(/'/g, "\\'")} - Mat: ${htmlEscape(String(f.matricula || 'S/M')).replace(/'/g, "\\'")}')">
        <div style="font-weight:600; color:var(--gov-blue-dark)">${htmlEscape(f.nome)}</div>
        <div style="font-size:11px; color:var(--color-text-muted)">Matrícula: ${f.matricula || 'S/M'}</div>
      </div>
    `).join('');
  }
  box.style.display = 'block';
};

window.selecionarCedAutocomplete = (id, label) => {
  $('cedido-func-id').value = id;
  $('cedido-func-search').value = label;
  $('cedido-func-sugestoes').style.display = 'none';
};

window.salvarCedencia = async () => {
  const fId = $('cedido-func-id').value;
  if (!fId) return showToast('Selecione um servidor na lista', 'warning');
  const tipo = $('cedido-tipo').value;
  const orgao = ($('cedido-orgao').value || '').trim();
  if (!orgao) return showToast('Preencha o órgão de origem/destino', 'warning');
  const lotacaoId = $('cedido-lotacao')?.value ? Number($('cedido-lotacao').value) : null;
  if (tipo === 'RECEBIDO' && !lotacaoId) {
    return showToast('Selecione a lotação SEMCAS no organograma para o RECEBIDO.', 'warning');
  }

  const btn = $('btn-salvar-cedencia');
  btn.disabled = true;

  const payload = {
    tipo,
    orgao_destino_origem: orgao,
    observacao: $('cedido-obs').value || null,
  };

  const editId = $('cedencia-id-editar')?.value;
  let error;

  if (editId) {
    const res = await sb.from('funcionario_cedencias').update(payload).eq('id', editId);
    error = res.error;
  } else {
    payload.funcionario_id = Number(fId);
    payload.data_inicio = new Date().toISOString().split('T')[0];
    payload.ativo = true;
    const res = await sb.from('funcionario_cedencias').insert([payload]);
    error = res.error;
  }

  // Ajusta lotação no organograma
  if (!error) {
    let destLot = lotacaoId;
    if (!destLot && tipo === 'CEDIDO' && !editId) {
      const { data: lotData } = await sb.from('lotacoes')
        .select('id')
        .eq('nome', 'SERVIDORES CEDIDOS (OUTROS ÓRGÃOS)')
        .limit(1)
        .maybeSingle();
      destLot = lotData?.id || null;
    }
    if (destLot) {
      const motivoLot = tipo === 'RECEBIDO' ? `Recebido de ${orgao}` : `Cedido para ${orgao}`;
      const { error: trfError } = await sb.rpc('fn_transferir_funcionario', {
        p_funcionario_id: Number(fId),
        p_nova_lotacao_id: destLot,
        p_novo_vinculo_id: null,
        p_nova_funcao: null,
        p_novo_turno_id: null,
        p_motivo: motivoLot
      });
      if (trfError) {
        await sb.from('funcionario_lotacao')
          .update({ ativo: false, data_fim: new Date().toISOString().slice(0, 10) })
          .eq('funcionario_id', Number(fId))
          .eq('ativo', true);
        const { error: insLotErr } = await sb.from('funcionario_lotacao').insert([{
          funcionario_id: Number(fId),
          lotacao_id: destLot,
          data_inicio: new Date().toISOString().slice(0, 10),
          ativo: true,
          observacao: motivoLot
        }]);
        if (insLotErr) showToast('Cessão salva, mas lotação falhou: ' + insLotErr.message, 'warning');
      }
    }
  }

  btn.disabled = false;
  if (error) {
    showToast('Erro: ' + error.message, 'error');
  } else {
    const nomeServidor = $('cedido-func-search')?.value || $('cedido-func-nome-container')?.querySelector('input')?.value || 'Servidor(a)';
    await registrarLog(editId ? 'EDIÇÃO DE CEDÊNCIA' : 'CADASTRO DE CEDÊNCIA', Number(fId), nomeServidor, {
      cedencia_id: editId ? Number(editId) : null,
      tipo,
      orgao,
      lotacao_id: lotacaoId || null
    });
    showToast('Registro salvo com sucesso!', 'success');
    if ($('cedencia-id-editar')) $('cedencia-id-editar').remove();
    closeModal('modal-cedido');
    carregarFuncionarios();
    if (state.rotaAtual === 'cedidos' || document.getElementById('view-cedidos')?.classList.contains('active')) renderCedidos();
  }
};
