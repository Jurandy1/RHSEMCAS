
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

// ── Fotos dos servidores (Supabase Storage) ──
const FOTO_BUCKET = 'funcionarios-fotos';
const FOTO_MAX_LADO = 512;           // px — suficiente para avatar em telas retina
const FOTO_ALVO_KB = 180;            // meta ~180 KB por foto
const FOTO_TETO_KB = 280;            // teto após compressão
const FOTO_ENTRADA_MAX_MB = 12;      // aceita foto grande do celular; converte antes de enviar
const _fotoUi = {
  edit: { file: null, remove: false, pathAtual: null, stream: null, previewUrl: null, info: '' },
  add:  { file: null, remove: false, pathAtual: null, stream: null, previewUrl: null, info: '' },
};
let _fotoCacheBust = Date.now();

function urlPublicaFoto(path) {
  if (!path) return null;
  const base = sb.storage.from(FOTO_BUCKET).getPublicUrl(path).data?.publicUrl;
  if (!base) return null;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}v=${_fotoCacheBust}`;
}

function formatarTamanhoFoto(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function canvasParaJpeg(canvas, qualidade) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualidade));
}

/** Redimensiona + converte sempre para JPG, reduzindo qualidade até ~180 KB. */
async function otimizarImagemFoto(file) {
  const bmp = await createImageBitmap(file);
  let maxLado = FOTO_MAX_LADO;
  let blob = null;

  for (let tentativa = 0; tentativa < 4; tentativa++) {
    let w = bmp.width;
    let h = bmp.height;
    if (w > maxLado || h > maxLado) {
      if (w >= h) { h = Math.round(h * maxLado / w); w = maxLado; }
      else { w = Math.round(w * maxLado / h); h = maxLado; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);

    let q = 0.9;
    blob = await canvasParaJpeg(canvas, q);
    while (blob && blob.size > FOTO_ALVO_KB * 1024 && q > 0.52) {
      q -= 0.07;
      blob = await canvasParaJpeg(canvas, q);
    }
    if (blob && blob.size <= FOTO_TETO_KB * 1024) break;
    maxLado = Math.round(maxLado * 0.82);
  }

  bmp.close?.();
  if (!blob) throw new Error('Não foi possível processar a imagem.');
  return new File([blob], 'foto.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}

function validarArquivoFoto(file) {
  if (!file) return 'Nenhum arquivo selecionado.';
  if (!/^image\//.test(file.type)) return 'Selecione um arquivo de imagem (JPG, PNG ou WebP).';
  if (file.size > FOTO_ENTRADA_MAX_MB * 1024 * 1024) {
    return `A foto original deve ter no máximo ${FOTO_ENTRADA_MAX_MB} MB.`;
  }
  return null;
}

function liberarPreviewFoto(prefix) {
  const ui = _fotoUi[prefix];
  if (ui?.previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(ui.previewUrl);
    ui.previewUrl = null;
  }
}

function atualizarInfoFoto(prefix, texto) {
  const el = $(`${prefix}-foto-info`);
  if (el) el.textContent = texto || '';
  if (_fotoUi[prefix]) _fotoUi[prefix].info = texto || '';
}

function atualizarPreviewFoto(prefix, url, infoExtra = '') {
  const img = $(`${prefix}-foto-img`);
  const ph = $(`${prefix}-foto-placeholder`);
  const btnRem = $(`${prefix}-foto-remover`);
  if (!img) return;
  liberarPreviewFoto(prefix);
  if (url) {
    _fotoUi[prefix].previewUrl = url.startsWith('blob:') ? url : null;
    img.onerror = () => {
      img.hidden = true;
      img.removeAttribute('src');
      if (ph) ph.hidden = false;
      atualizarInfoFoto(prefix, 'Não foi possível carregar a foto salva.');
    };
    img.onload = () => {
      img.removeAttribute('hidden');
      img.hidden = false;
      if (ph) ph.hidden = true;
    };
    img.src = url;
    if (img.complete && img.naturalWidth > 0) {
      img.removeAttribute('hidden');
      img.hidden = false;
      if (ph) ph.hidden = true;
    }
    if (btnRem) btnRem.style.display = '';
    if (infoExtra) atualizarInfoFoto(prefix, infoExtra);
  } else {
    img.onerror = null;
    img.onload = null;
    img.hidden = true;
    img.removeAttribute('src');
    if (ph) ph.hidden = false;
    if (btnRem) btnRem.style.display = 'none';
    atualizarInfoFoto(prefix, '');
  }
}

function pararWebcamFoto(prefix) {
  const ui = _fotoUi[prefix];
  if (ui?.stream) {
    ui.stream.getTracks().forEach((t) => t.stop());
    ui.stream = null;
  }
  const video = $(`${prefix}-foto-video`);
  if (video) video.srcObject = null;
}

function fecharWebcamFoto(prefix) {
  pararWebcamFoto(prefix);
  const panel = $(`${prefix}-foto-webcam-panel`);
  if (panel) panel.hidden = true;
}

function resetFotoUi(prefix) {
  fecharWebcamFoto(prefix);
  liberarPreviewFoto(prefix);
  _fotoUi[prefix] = { file: null, remove: false, pathAtual: null, stream: null, previewUrl: null, info: '' };
  atualizarPreviewFoto(prefix, null);
  const fileIn = $(`${prefix}-foto-file`);
  if (fileIn) fileIn.value = '';
}

function carregarFotoExistenteEdicao(fotoPath) {
  fecharWebcamFoto('edit');
  liberarPreviewFoto('edit');
  _fotoUi.edit = {
    file: null,
    remove: false,
    pathAtual: fotoPath || null,
    stream: null,
    previewUrl: null,
    info: '',
  };
  if (fotoPath) {
    atualizarPreviewFoto('edit', urlPublicaFoto(fotoPath), 'Foto atual do cadastro (convertida para JPG ao salvar)');
  } else {
    atualizarPreviewFoto('edit', null);
    atualizarInfoFoto('edit', 'Nenhuma foto cadastrada');
  }
}

async function abrirWebcamFoto(prefix) {
  const panel = $(`${prefix}-foto-webcam-panel`);
  const video = $(`${prefix}-foto-video`);
  if (!panel || !video) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Webcam não disponível neste dispositivo. Use “Selecionar foto”.', 'warning');
    return;
  }
  try {
    pararWebcamFoto(prefix);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    _fotoUi[prefix].stream = stream;
    video.srcObject = stream;
    panel.hidden = false;
  } catch (_) {
    showToast('Não foi possível acessar a webcam. Use “Selecionar foto”.', 'warning');
  }
}

async function capturarWebcamFoto(prefix) {
  const video = $(`${prefix}-foto-video`);
  if (!video?.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
  if (!blob) return;
  let file = new File([blob], 'webcam.jpg', { type: 'image/jpeg' });
  try {
    file = await otimizarImagemFoto(file);
    _fotoUi[prefix].file = file;
    _fotoUi[prefix].remove = false;
    fecharWebcamFoto(prefix);
    atualizarPreviewFoto(
      prefix,
      URL.createObjectURL(file),
      `Capturada · ${formatarTamanhoFoto(file.size)} · JPG otimizado`
    );
  } catch (e) {
    showToast('Erro ao processar foto da webcam: ' + (e.message || e), 'error');
  }
  const fileIn = $(`${prefix}-foto-file`);
  if (fileIn) fileIn.value = '';
}

async function uploadFotoFuncionario(funcionarioId, file) {
  const path = `${funcionarioId}/avatar.jpg`;
  const { error } = await sb.storage.from(FOTO_BUCKET).upload(path, file, {
    upsert: true,
    contentType: 'image/jpeg',
  });
  if (error) throw error;
  _fotoCacheBust = Date.now();
  return path;
}

async function removerFotoFuncionarioStorage(path) {
  if (!path) return;
  await sb.storage.from(FOTO_BUCKET).remove([path]);
}

/** undefined = sem alteração; null = remover; string = novo path */
async function processarFotoSalvar(funcionarioId, prefix) {
  const ui = _fotoUi[prefix];
  if (!ui) return undefined;
  if (ui.remove) {
    if (ui.pathAtual) await removerFotoFuncionarioStorage(ui.pathAtual);
    return null;
  }
  if (ui.file) {
    if (ui.pathAtual) await removerFotoFuncionarioStorage(ui.pathAtual);
    return uploadFotoFuncionario(funcionarioId, ui.file);
  }
  return undefined;
}

function htmlFotoLista(path) {
  const url = path ? urlPublicaFoto(path) : null;
  if (url) {
    return `<img class="func-lista-foto" src="${htmlEscape(url)}" alt="" loading="lazy" width="40" height="40">`;
  }
  return `<span class="func-lista-foto func-lista-foto--empty" aria-hidden="true"><i class="ti ti-user"></i></span>`;
}

function bindFotoUi(prefix) {
  const fileIn = $(`${prefix}-foto-file`);
  if (!fileIn || fileIn._fotoBound) return;
  fileIn._fotoBound = true;

  fileIn.addEventListener('change', async () => {
    let file = fileIn.files?.[0];
    if (!file) return;
    const err = validarArquivoFoto(file);
    if (err) { showToast(err, 'warning'); fileIn.value = ''; return; }
    try {
      const antes = file.size;
      file = await otimizarImagemFoto(file);
      _fotoUi[prefix].file = file;
      _fotoUi[prefix].remove = false;
      const info = `Pronta para salvar · ${formatarTamanhoFoto(file.size)} (era ${formatarTamanhoFoto(antes)}) · JPG otimizado`;
      atualizarPreviewFoto(prefix, URL.createObjectURL(file), info);
    } catch (e) {
      showToast('Erro ao processar imagem: ' + (e.message || e), 'error');
      fileIn.value = '';
    }
  });

  $(`${prefix}-foto-webcam-btn`)?.addEventListener('click', () => abrirWebcamFoto(prefix));
  $(`${prefix}-foto-capturar`)?.addEventListener('click', () => capturarWebcamFoto(prefix));
  $(`${prefix}-foto-webcam-cancel`)?.addEventListener('click', () => fecharWebcamFoto(prefix));
  $(`${prefix}-foto-remover`)?.addEventListener('click', () => {
    _fotoUi[prefix].file = null;
    _fotoUi[prefix].remove = true;
    fileIn.value = '';
    atualizarPreviewFoto(prefix, null);
    atualizarInfoFoto(prefix, 'Foto será removida ao salvar');
  });
}

function initFuncionarioFotoUi() {
  bindFotoUi('edit');
  bindFotoUi('add');
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
    instalarScrollConteudo();
    initFuncionarioFotoUi();
    const { data } = await sb.from('v_pendentes_kpis').select('pendentes').single();
    if (data && $('badge-pendentes')) {
      // Menu Dados incompletos removido — badge legado ignorado
    }
    atualizarBadgesSemLotacaoExonerados();
    atualizarAlertasLicenca();
  } catch (e) {
    _appBooted = false;
    console.error('Boot failed:', e);
    showToast('Erro ao inicializar: ' + e.message, 'error');
  }
}

/** Garante rolagem da área principal (Firefox / flex). */
function instalarScrollConteudo() {
  const area = document.querySelector('.content-area');
  if (!area || area.dataset.scrollFix === '1') return;
  area.dataset.scrollFix = '1';
  if (!area.hasAttribute('tabindex')) area.setAttribute('tabindex', '-1');

  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return;
    if (document.querySelector('.modal-overlay[style*="flex"]')) return;
    let el = e.target instanceof Element ? e.target : null;
    while (el && el !== document.body) {
      if (el === area) break;
      const st = getComputedStyle(el);
      const oy = st.overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return;
      el = el.parentElement;
    }
    if (area.scrollHeight <= area.clientHeight + 1) return;
    const before = area.scrollTop;
    area.scrollTop += e.deltaY;
    if (area.scrollTop !== before) e.preventDefault();
  }, { passive: false });
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
  $('nav-giap-rastreio')?.classList.toggle('hidden', !coordenadora);
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
// Sempre ordena com desempate único — senão o range pula/duplica linhas no limite de 1000.
async function fetchTudo(tabela, colunas, ordem, opts = {}) {
  const todos = [];
  const asc = opts.asc !== false;
  const cols = String(colunas || '*');
  let tie = opts.idCol || null;
  if (!tie) {
    if (cols === '*' || /\bfuncionario_id\b/.test(cols)) tie = 'funcionario_id';
    else if (/\bid\b/.test(cols)) tie = 'id';
  }
  for (let de = 0; ; de += 1000) {
    let q = sb.from(tabela).select(colunas).order(ordem, { ascending: asc });
    if (tie && tie !== ordem) q = q.order(tie, { ascending: true });
    const { data, error } = await q.range(de, de + 999);
    if (error) {
      // Fallback se a view não tiver a coluna de desempate
      if (tie && /funcionario_id|column/i.test(error.message || '')) {
        const r2 = await sb.from(tabela).select(colunas).order(ordem, { ascending: asc }).range(de, de + 999);
        if (r2.error) return { data: todos.length ? todos : null, error: r2.error };
        todos.push(...(r2.data || []));
        if (!r2.data || r2.data.length < 1000) break;
        continue;
      }
      return { data: todos.length ? todos : null, error };
    }
    todos.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { data: todos, error: null };
}

/** Autocomplete de servidores via RPC (não depende de carregar a lista inteira no browser). */
async function buscarServidoresAutocomplete(termo, limite = 20) {
  const q = String(termo || '').trim();
  if (q.length < 2) return [];
  const data = await handleErr(await sb.rpc('fn_buscar_funcionarios', {
    p_termo: q.split(/\s+/).join('%'),
    p_vinculo_id: null,
    p_lotacao_id: null,
    p_funcao: null,
    p_turno_id: null,
    p_limite: limite,
    p_offset: 0,
    p_order_by: 'nome',
    p_order_dir: 'asc'
  }), 'autocomplete servidores');
  return data || [];
}

async function fetchInChunks(tabela, colunas, idCol, ids, chunkSize = 200) {
  const out = [];
  const uniq = [...new Set((ids || []).filter((x) => x != null))];
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const { data, error } = await sb.from(tabela).select(colunas).in(idCol, chunk);
    if (error) throw error;
    if (data?.length) out.push(...data);
  }
  return out;
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
  $$('.sortable:not(.fer-sortable)').forEach(th => {
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
      .select('funcionario_id, vinculo, funcao, lotacao_id, lotacao_nome, turno')
      .order('nome')
      .order('funcionario_id')
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
  if (id === 'modal-edit') fecharWebcamFoto('edit');
  if (id === 'modal-add-funcionario') fecharWebcamFoto('add');
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
  'terceirizados':{ titulo: 'Terceirizados',         bread: 'Terceirizados',  render: renderTerceirizados },
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
  if (rota === 'giap-rastreio' && !usuarioEhCoordenador()) {
    location.hash = '#painel';
    showToast('Apenas a coordenadora pode acessar a Auditoria de Saídas GIAP.', 'warning');
    return;
  }
  if (rota === 'pendentes') {
    location.hash = '#painel';
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

  const area = document.querySelector('.content-area');
  if (area) area.scrollTop = 0;

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
  $('table-body').innerHTML = `<tr><td colspan="9" class="empty-state"><span class="spinner"></span> Carregando…</td></tr>`;
  const resultado = await buscarFuncionariosRpc({ paginar: true });
  if (!resultado) return;
  const { rows: data, total } = resultado;
  state.total = total;

  if (data.length === 0) {
    $('table-body').innerHTML = `<tr><td colspan="9"><div class="empty-state">Nenhum funcionário encontrado</div></td></tr>`;
  } else {
    const ids = data.map(d => d.funcionario_id);
    const { data: extras } = await sb.from('funcionarios').select('id, matricula, data_admissao, foto_url').in('id', ids);
    const mapEx = Object.fromEntries((extras || []).map(x => [x.id, x]));
    const fmtDt = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

    $('table-body').innerHTML = data.map(f => {
      const ex = mapEx[f.funcionario_id] || {};
      return `
      <tr>
        <td style="font-family:monospace;font-size:12px;color:var(--color-text-sec)">${htmlEscape(ex.matricula || '—')}</td>
        <td>${htmlFotoLista(ex.foto_url)}</td>
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
  let matricula = '';
  const { data } = await sb.from('funcionarios').select('nome, matricula').eq('id', fid).maybeSingle();
  if (data?.nome) nome = data.nome;
  if (data?.matricula) matricula = String(data.matricula).trim();

  $('rem-func-id').value = String(fid);
  $('rem-func-nome').textContent = nome;
  // Sugere demissão se não tem matrícula; senão exoneração
  if (matricula) {
    $('rem-tipo-exo').checked = true;
  } else {
    $('rem-tipo-dem').checked = true;
  }
  if ($('rem-motivo')) $('rem-motivo').value = '';
  $('rem-data-exo').value = new Date().toISOString().slice(0, 10);
  atualizarCamposRemover();
  openModal('modal-remover-servidor');
};

function remTipoSaidaSelecionado() {
  return document.querySelector('input[name="rem-tipo"]:checked')?.value || '';
}

function atualizarCamposRemover() {
  const tipo = remTipoSaidaSelecionado();
  const saida = tipo && tipo !== 'cadastro_errado';
  if ($('rem-saida-campos')) $('rem-saida-campos').style.display = saida ? '' : 'none';
  const obrig = tipo === 'OUTROS';
  if ($('rem-motivo-obrig')) $('rem-motivo-obrig').style.display = obrig ? '' : 'none';
  const btn = $('btn-confirmar-remover');
  if (!btn) return;
  const labels = {
    EXONERACAO: 'Confirmar exoneração',
    DEMISSAO_TERCEIRIZADO: 'Confirmar demissão',
    FALECIMENTO: 'Confirmar falecimento',
    OUTROS: 'Confirmar saída',
    cadastro_errado: 'Excluir cadastro errado'
  };
  btn.textContent = labels[tipo] || 'Confirmar';
}

['rem-tipo-exo', 'rem-tipo-dem', 'rem-tipo-fal', 'rem-tipo-out', 'rem-tipo-errado'].forEach((id) => {
  $(id)?.addEventListener('change', atualizarCamposRemover);
});

$('btn-confirmar-remover')?.addEventListener('click', async () => {
  const id = Number($('rem-func-id').value);
  const nome = $('rem-func-nome')?.textContent || 'Servidor(a)';
  if (!id) return;

  const tipo = remTipoSaidaSelecionado();
  const btn = $('btn-confirmar-remover');
  btn.disabled = true;

  try {
    if (tipo === 'cadastro_errado') {
      if (!confirm('Confirma exclusão definitiva por cadastro errado? Esta ação não pode ser desfeita.')) {
        btn.disabled = false;
        return;
      }
      const { data: funcRow } = await sb.from('funcionarios').select('foto_url').eq('id', id).maybeSingle();
      const res = await sb.rpc('fn_excluir_funcionario', { p_id: id });
      if (res.error) throw res.error;
      if (funcRow?.foto_url) await removerFotoFuncionarioStorage(funcRow.foto_url);
      await registrarLog('EXCLUSÃO DE SERVIDOR (CADASTRO ERRADO)', id, nome, {});
      showToast('Cadastro errado excluído.', 'success');
    } else {
      const dataExo = $('rem-data-exo').value;
      const motivo = ($('rem-motivo')?.value || '').trim();
      if (!dataExo) {
        showToast('Informe a data da saída.', 'warning');
        btn.disabled = false;
        return;
      }
      if (tipo === 'OUTROS' && !motivo) {
        showToast('Informe o motivo quando o tipo for Outros.', 'warning');
        btn.disabled = false;
        return;
      }
      const { error } = await sb.rpc('fn_exonerar_funcionario', {
        p_funcionario_id: id,
        p_data_exoneracao: dataExo,
        p_motivo: motivo || null,
        p_tipo_saida: tipo
      });
      if (error) throw error;
      const logTipo = {
        EXONERACAO: 'EXONERAÇÃO DE SERVIDOR',
        DEMISSAO_TERCEIRIZADO: 'DEMISSÃO TERCEIRIZADO/CLT',
        FALECIMENTO: 'FALECIMENTO DE SERVIDOR',
        OUTROS: 'SAÍDA POR OUTROS MOTIVOS'
      };
      await registrarLog(logTipo[tipo] || 'SAÍDA DE SERVIDOR', id, nome, {
        data_exoneracao: dataExo,
        tipo_saida: tipo,
        motivo: motivo || null
      });
      const toastOk = {
        EXONERACAO: 'Servidor marcado como exonerado.',
        DEMISSAO_TERCEIRIZADO: 'Demissão de terceirizado/CLT registrada.',
        FALECIMENTO: 'Falecimento registrado.',
        OUTROS: 'Saída registrada.'
      };
      showToast(toastOk[tipo] || 'Saída registrada.', 'success');
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
  resetFotoUi('add');
  atualizarInfoFoto('add', 'Opcional — será otimizada antes de enviar');
  $('add-nome').value = '';
  $('add-cpf').value = '';
  $('add-matricula').value = '';
  $('add-admissao').value = '';
  $('add-email').value = '';
  $('add-telefone').value = '';
  $('add-funcao').value = '';
  if ($('add-cargo')) $('add-cargo').value = '';
  $('add-ano').value = '';
  if ($('add-empresa')) $('add-empresa').value = '';
  if ($('add-outra-secretaria')) $('add-outra-secretaria').checked = false;
  if ($('add-orgao-origem')) $('add-orgao-origem').value = '';
  if ($('add-orgao-origem-wrap')) $('add-orgao-origem-wrap').style.display = 'none';
  popularSelectSimbologia('add-simbologia');
  
  $('add-vinculo').innerHTML = '<option value="">Selecione...</option>' + state.vinculos.map(v => `<option value="${v.id}">${htmlEscape(v.categoria)}</option>`).join('');
  $('add-turno').innerHTML = '<option value="">Selecione...</option>' + state.turnos.map(t => `<option value="${t.id}">${htmlEscape(t.nome)}</option>`).join('');
  aplicarVisibilidadeTerceirizado('add');

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

// Vínculo "Terceirizado" não usa Matrícula/Simbologia/Ano do Concurso/GIAP — usa Nome da Empresa
function funcVinculoEhTerceirizado(prefix) {
  const vinculoId = $(`${prefix}-vinculo`)?.value;
  if (!vinculoId) return false;
  const v = state.vinculos.find(x => String(x.id) === String(vinculoId));
  return !!v && (v.categoria || '').trim().toLowerCase() === 'terceirizado';
}

function aplicarVisibilidadeTerceirizado(prefix) {
  const isTerceirizado = funcVinculoEhTerceirizado(prefix);
  const show = (id, on) => { const el = $(id); if (el) el.style.display = on ? '' : 'none'; };
  show(`${prefix}-matricula-group`, !isTerceirizado);
  show(`${prefix}-simbologia-group`, !isTerceirizado);
  show(`${prefix}-ano-group`, !isTerceirizado);
  show(`${prefix}-empresa-group`, isTerceirizado);
  if (prefix === 'edit') show('edit-remun-wrap', !isTerceirizado);
  return isTerceirizado;
}

window.onVinculoChangeTerceirizado = function onVinculoChangeTerceirizado(prefix) {
  const isTerceirizado = aplicarVisibilidadeTerceirizado(prefix);
  // Limpa os campos que ficaram escondidos, pra não salvar lixo
  if (isTerceirizado) {
    if ($(`${prefix}-matricula`))  $(`${prefix}-matricula`).value = '';
    if ($(`${prefix}-simbologia`)) $(`${prefix}-simbologia`).value = '';
    if ($(`${prefix}-ano`))        $(`${prefix}-ano`).value = '';
  } else {
    if ($(`${prefix}-empresa`))    $(`${prefix}-empresa`).value = '';
  }
};

$('add-vinculo').addEventListener('change', () => window.onVinculoChangeTerceirizado('add'));
$('edit-vinculo').addEventListener('change', () => window.onVinculoChangeTerceirizado('edit'));

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
    empresa: $('add-empresa').value.trim() || null,
    cargo: ($('add-cargo')?.value || '').trim() || null,
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

  try {
    const novoPath = await processarFotoSalvar(funcData.id, 'add');
    if (novoPath) {
      const { error: fotoErr } = await sb.from('funcionarios').update({ foto_url: novoPath }).eq('id', funcData.id);
      if (fotoErr) showToast('Servidor criado, mas a foto não foi salva: ' + fotoErr.message, 'warning');
    }
  } catch (e) {
    showToast('Servidor criado, mas erro ao enviar foto: ' + (e.message || e), 'warning');
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
  const ext = await handleErr(await sb.from('funcionarios').select('matricula, data_admissao, observacao, simbologia, foto_url, empresa, cargo').eq('id', id).single(), 'edit extras');
  state.funcionarioAtual = data;

  carregarFotoExistenteEdicao(ext?.foto_url || null);

  $('edit-id').value = id;
  $('edit-nome').value      = data.nome || '';
  $('edit-cpf').value       = data.cpf ? mascaraCPF(data.cpf) : '';
  $('edit-matricula').value = ext?.matricula || data.matricula || '';
  $('edit-admissao').value  = ext?.data_admissao || '';
  $('edit-email').value     = data.email || '';
  $('edit-telefone').value  = data.telefone ? mascaraTelefone(data.telefone) : '';
  popularSelectSimbologia('edit-simbologia', ext?.simbologia || '');
  if ($('edit-cargo')) $('edit-cargo').value = ext?.cargo || '';
  $('edit-funcao').value    = data.funcao || '';
  $('edit-ano').value       = data.ano_concurso || '';
  $('edit-obs').value       = ext?.observacao || '';
  if ($('edit-empresa')) $('edit-empresa').value = ext?.empresa || '';
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
  aplicarVisibilidadeTerceirizado('edit');
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
    simbologia: $('edit-simbologia').value || null,
    empresa: $('edit-empresa').value.trim() || null,
    cargo: ($('edit-cargo')?.value || '').trim() || null
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
  if (r1.error || r1b.error || r2.error || r2b.error) {
    btn.disabled = false;
    showToast('Erro ao salvar: ' + (r1.error?.message || r1b.error?.message || r2.error?.message || r2b.error?.message), 'error');
    return;
  }

  try {
    const novoPath = await processarFotoSalvar(id, 'edit');
    if (novoPath !== undefined) {
      const { error: fotoErr } = await sb.from('funcionarios').update({ foto_url: novoPath }).eq('id', id);
      if (fotoErr) throw fotoErr;
    }
  } catch (e) {
    btn.disabled = false;
    showToast('Dados salvos, mas erro na foto: ' + (e.message || e), 'error');
    return;
  }

  btn.disabled = false;
  
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
  rotas.lotacoes     = { titulo: 'Gestão de Lotações',     bread: 'Lotações',     render: renderLotacoes };
  rotas['sem-lotacao'] = { titulo: 'Servidores sem Lotação', bread: 'Sem Lotação', render: renderSemLotacao };
  rotas.exonerados   = { titulo: 'Exonerados e Demitidos', bread: 'Exonerados e Demitidos', render: renderExonerados };
  rotas['relatorio-api'] = { titulo: 'Conferência GIAP', bread: 'Conferência GIAP', render: renderRelatorioApi };
  rotas['giap-rastreio'] = {
    titulo: 'Auditoria de Saídas GIAP',
    bread: 'Auditoria de Saídas',
    render: () => window.renderGiapAuditoriaSaidas?.()
  };
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

/** Copia cargo_origem (última competência GIAP) → funcionarios.cargo.
 *  Por padrão só preenche quem está sem cargo (não apaga edição manual).
 *  Passe { sobrescrever: true } para atualizar todos a partir da folha. */
window.sincronizarCargosDoGiap = async function sincronizarCargosDoGiap(opts = {}) {
  const sobrescrever = !!opts.sobrescrever;
  let atualizados = 0;
  try {
    // Último cargo por funcionario_id
    const porFunc = new Map();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('funcionario_remuneracoes')
        .select('funcionario_id, cargo_origem, competencia')
        .not('cargo_origem', 'is', null)
        .order('competencia', { ascending: false })
        .range(from, from + 999);
      if (error) throw error;
      for (const r of data || []) {
        const cargo = String(r.cargo_origem || '').trim();
        if (!cargo || !r.funcionario_id) continue;
        if (!porFunc.has(r.funcionario_id)) porFunc.set(r.funcionario_id, cargo);
      }
      if (!data || data.length < 1000) break;
    }
    if (!porFunc.size) return { ok: true, atualizados: 0 };

    const ids = [...porFunc.keys()];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      let q = sb.from('funcionarios').select('id, cargo').in('id', chunk);
      if (!sobrescrever) {
        // só quem ainda não tem cargo
      }
      const { data: funcs, error } = await q;
      if (error) throw error;
      for (const f of funcs || []) {
        const atual = String(f.cargo || '').trim();
        const novo = porFunc.get(f.id);
        if (!novo) continue;
        if (!sobrescrever && atual) continue;
        if (atual === novo) continue;
        const { error: upErr } = await sb.from('funcionarios').update({ cargo: novo }).eq('id', f.id);
        if (!upErr) atualizados++;
      }
    }
    return { ok: true, atualizados };
  } catch (e) {
    console.warn('[Cargos GIAP]', e.message || e);
    return { ok: false, atualizados: 0, erro: e.message || String(e) };
  }
};

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

    // Após alimentar remunerações, preenche funcionarios.cargo com o cargo da folha
    let cargos = null;
    if (r.ok !== false) {
      cargos = await sincronizarCargosDoGiap({ sobrescrever: false });
    }

    if (!silencioso) {
      if (r.ok === false) {
        showToast(r.erro || 'Não foi possível alimentar remunerações.', 'warning');
      } else {
        const extra = cargos?.atualizados
          ? ` · ${cargos.atualizados} cargo(s) atualizado(s)`
          : '';
        showToast(
          `Remunerações: ${r.gravados || 0} gravado(s) · competência ${r.competencia}` +
            (r.podados ? ` · ${r.podados} antigo(s) removido(s)` : '') +
            extra,
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
  const area = document.querySelector('.content-area');
  if (area) area.scrollTop = 0;
};

window.mudarPageSizeRemuneracoes = function mudarPageSizeRemuneracoes(v) {
  const n = Number(v);
  if (![15, 25, 50, 100].includes(n)) return;
  window._remunPageSize = n;
  window._remunPage = 1;
  renderTabelaRemuneracoes();
};

function renderPaginacaoRemuneracoes(filtradoTotal) {
  const info = $('remun-page-info');
  const controls = $('remun-page-controls');
  if (!info || !controls) return;
  const pageSize = window._remunPageSize || 50;
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
  const pageSize = window._remunPageSize || 50;

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

const EXO_TIPO_LABEL = {
  EXONERACAO: 'Exoneração',
  DEMISSAO_TERCEIRIZADO: 'Demissão (Terceirizado/CLT)',
  FALECIMENTO: 'Falecimento',
  OUTROS: 'Outros'
};

function exoTipoLabel(tipo) {
  return EXO_TIPO_LABEL[tipo] || tipo || 'Exoneração';
}

window.exoFiltrarTipo = function exoFiltrarTipo(tipo) {
  if ($('exo-filtro-tipo')) $('exo-filtro-tipo').value = tipo || '';
  document.querySelectorAll('#exo-tabs .exo-tab').forEach((btn) => {
    btn.classList.toggle('active', (btn.getAttribute('data-exo-tipo') || '') === (tipo || ''));
  });
  renderExonerados();
};

async function renderExonerados() {
  const tbody = $('tbody-exonerados');
  if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><span class="spinner"></span> Carregando…</td></tr>';

  const { data, error } = await sb.from('v_exonerados')
    .select('funcionario_id, nome, matricula, data_exoneracao, motivo_saida, tipo_saida, funcao, lotacao_nome, vinculo, simbologia, data_admissao')
    .order('data_exoneracao', { ascending: false });

  if (error) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Erro: ${htmlEscape(error.message)}. Rode sql/exonerados_demitidos.sql no Supabase.</td></tr>`;
    }
    return;
  }

  let lista = data || [];
  window._exoneradosCache = lista;
  const termo = ($('exo-busca')?.value || '').trim().toLowerCase();
  const filtroTipo = ($('exo-filtro-tipo')?.value || '').trim();
  document.querySelectorAll('#exo-tabs .exo-tab').forEach((btn) => {
    btn.classList.toggle('active', (btn.getAttribute('data-exo-tipo') || '') === filtroTipo);
  });
  if (filtroTipo) {
    lista = lista.filter((f) => (f.tipo_saida || 'EXONERACAO') === filtroTipo);
  }
  if (termo) {
    lista = lista.filter((f) =>
      (f.nome || '').toLowerCase().includes(termo) ||
      String(f.matricula || '').toLowerCase().includes(termo) ||
      (f.motivo_saida || '').toLowerCase().includes(termo)
    );
  }

  if ($('exo-count')) {
    $('exo-count').textContent = `${lista.length} registro(s)` +
      (filtroTipo ? ` · ${exoTipoLabel(filtroTipo)}` : '');
  }
  atualizarBadgesSemLotacaoExonerados();

  if (!lista.length) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Nenhum registro neste filtro.</td></tr>';
    return;
  }

  const fmtDt = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  tbody.innerHTML = lista.map((f) => {
    const tipo = f.tipo_saida || 'EXONERACAO';
    return `
    <tr>
      <td style="font-family:monospace;font-size:12px">${htmlEscape(f.matricula || '—')}</td>
      <td style="font-weight:600">${htmlEscape(f.nome || '—')}</td>
      <td style="font-size:12px;font-weight:600">${htmlEscape(exoTipoLabel(tipo))}</td>
      <td style="font-weight:700;color:var(--gov-red)">${fmtDt(f.data_exoneracao)}</td>
      <td style="font-size:12px;max-width:180px">${htmlEscape(f.motivo_saida || '—')}</td>
      <td>${htmlEscape(f.funcao || '—')}</td>
      <td>${htmlEscape(f.lotacao_nome || '—')}</td>
      <td>${htmlEscape(f.vinculo || '—')}</td>
      <td style="text-align:center;white-space:nowrap">
        <button
          type="button"
          class="btn-secondary"
          style="padding:5px 8px;font-size:12px;margin:1px"
          onclick="abrirEditarSaida(${Number(f.funcionario_id)})"
          title="Editar tipo, data e motivo"
        >
          <i class="ti ti-edit"></i> Editar
        </button>
        <button
          type="button"
          class="btn-primary"
          style="padding:5px 8px;font-size:12px;margin:1px"
          onclick="reativarExonerado(${Number(f.funcionario_id)})"
          title="Reativar e devolver à última lotação"
        >
          <i class="ti ti-user-check"></i> Reativar
        </button>
      </td>
    </tr>`;
  }).join('');
}

window.abrirEditarSaida = function abrirEditarSaida(funcionarioId) {
  const f = (window._exoneradosCache || [])
    .find((x) => Number(x.funcionario_id) === Number(funcionarioId));
  if (!f) return showToast('Registro não encontrado. Atualize a lista.', 'warning');
  $('esaida-id').value = String(f.funcionario_id);
  $('esaida-nome').textContent = f.nome || '—';
  $('esaida-tipo').value = f.tipo_saida || 'EXONERACAO';
  $('esaida-data').value = (f.data_exoneracao || '').slice(0, 10);
  $('esaida-motivo').value = f.motivo_saida || '';
  esaidaToggleMotivo();
  openModal('modal-editar-saida');
};

window.esaidaToggleMotivo = function esaidaToggleMotivo() {
  const obrig = ($('esaida-tipo')?.value || '') === 'OUTROS';
  if ($('esaida-motivo-obrig')) $('esaida-motivo-obrig').style.display = obrig ? '' : 'none';
};

window.salvarEditarSaida = async function salvarEditarSaida() {
  const id = Number($('esaida-id')?.value);
  const tipo = ($('esaida-tipo')?.value || '').trim();
  const dataSaida = ($('esaida-data')?.value || '').trim();
  const motivo = ($('esaida-motivo')?.value || '').trim();
  const nome = $('esaida-nome')?.textContent || 'Servidor(a)';
  if (!id || !tipo || !dataSaida) {
    return showToast('Preencha tipo e data da saída.', 'warning');
  }
  if (tipo === 'OUTROS' && !motivo) {
    return showToast('Informe o motivo quando o tipo for Outros.', 'warning');
  }
  const btn = $('btn-salvar-saida');
  if (btn) btn.disabled = true;
  try {
    const { error } = await sb.rpc('fn_atualizar_saida_funcionario', {
      p_funcionario_id: id,
      p_tipo_saida: tipo,
      p_data_exoneracao: dataSaida,
      p_motivo: motivo || null
    });
    if (error) throw error;
    await registrarLog('EDIÇÃO DE SAÍDA', id, nome, {
      tipo_saida: tipo,
      data_exoneracao: dataSaida,
      motivo: motivo || null
    });
    showToast('Registro de saída atualizado.', 'success');
    closeModal('modal-editar-saida');
    await renderExonerados();
  } catch (e) {
    const msg = e.message || String(e);
    if (/fn_atualizar_saida|schema cache|does not exist|404/i.test(msg)) {
      showToast('Rode sql/exonerados_demitidos.sql no Supabase primeiro. (' + msg + ')', 'warning');
    } else {
      showToast(msg, 'error');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.renderExonerados = renderExonerados;

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
        `Função não encontrada no Supabase. Rode sql/exonerados_demitidos.sql e tente de novo. (${msg})`,
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
/** Continua “Buscar e gravar folha” em lotes até não restar ninguém pendente. */
let _giapAutoContinuarFolha = false;

/**
 * Competência YYYYMM alvo.
 * Dias 1–19: mês anterior. Dias 20–31: mês corrente (folha costuma sair no fim do mês).
 * Ex.: em 26/07/2026 → 202607.
 */
function giapCompetenciaPadrao(refDate = new Date()) {
  const d = refDate instanceof Date ? refDate : new Date();
  const dia = d.getDate();
  let y = d.getFullYear();
  let m = d.getMonth() + 1; // 1–12
  if (dia < 20) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return y * 100 + m;
}

/** Escolhe a competência mais recente entre a sugerida e o que já existe em folha_pmsl. */
async function giapResolverCompetencia() {
  const sugerida = giapCompetenciaPadrao();
  let maxFolha = 0;
  try {
    const { data } = await sb.from('folha_pmsl')
      .select('competencia')
      .order('competencia', { ascending: false })
      .limit(1)
      .maybeSingle();
    maxFolha = Number(data?.competencia || 0);
  } catch (_) { /* ok */ }
  return Math.max(sugerida, maxFolha || 0);
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
  // Sempre todos os servidores do RH que ainda faltam na folha.
  return {
    continuarAteCompletar: true
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
      p_motivo: `Manual via Relatório API GIAP (competência ${r.competencia})`,
      p_tipo_saida: 'EXONERACAO'
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
      let n = 0;
      for (let de = 0; ; de += 1000) {
        const { data: mats, error: eMat } = await sb.from('funcionarios')
          .select('id, matricula')
          .eq('ativo', true)
          .order('id')
          .range(de, de + 999);
        if (eMat) break;
        n += (mats || []).filter(f => !f.matricula || !String(f.matricula).trim()).length;
        if (!mats || mats.length < 1000) break;
      }
      semMatricula = n;
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
    if ($('giap-cfg-dia')) $('giap-cfg-dia').value = cfg?.dia_mes ?? 20;
    const compResolvida = await giapResolverCompetencia();
    if ($('giap-cfg-comp')) {
      // Sempre atualiza para a competência vigente (não fica presa no mês antigo)
      $('giap-cfg-comp').value = compResolvida;
      $('giap-cfg-comp').title =
        'Atualizada automaticamente: dias 20–31 = mês corrente; antes disso = mês anterior. Pode alterar manualmente se precisar.';
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
  comMatricula: 0,
  rastreioFeito: false,
  rastreioComps: [],
  rastreioStats: { demitidos: 0, sumiu: 0, semHistorico: 0 }
};

/** Soma/subtrai meses em competência YYYYMM. */
function giapCompShift(comp, deltaMonths) {
  let y = Math.floor(Number(comp) / 100);
  let m = Number(comp) % 100;
  if (!y || m < 1 || m > 12) return Number(comp) || 0;
  m += Number(deltaMonths) || 0;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return y * 100 + m;
}

function giapListaCompsAnteriores(compAtual, nMeses) {
  const out = [];
  const n = Math.max(1, Math.min(24, Number(nMeses) || 6));
  for (let i = 1; i <= n; i++) out.push(giapCompShift(compAtual, -i));
  return out;
}

/** Competências anteriores até um piso (ex.: 202601 = início de 2026). */
function giapListaCompsAte(compAtual, compMin = 202601) {
  const out = [];
  const min = Number(compMin) || 202601;
  let c = giapCompShift(Number(compAtual), -1);
  let guard = 0;
  while (c >= min && guard < 36) {
    out.push(c);
    c = giapCompShift(c, -1);
    guard++;
  }
  return out;
}

/**
 * Cascata: competência atual + meses mais antigos até o piso.
 * Ex.: 202607 → [202607, 202606, …, 202601]
 */
function giapListaCompsCascata(compAtual, compMin = 202601) {
  const atual = Number(compAtual);
  const anteriores = giapListaCompsAte(atual, compMin);
  if (!atual) return anteriores;
  return [atual, ...anteriores.filter((c) => c !== atual)];
}

/** Lê o seletor: YYYYMM = cascata até aquela competência; número = N meses anteriores (+ atual). */
function giapCompsRastreioSelecionadas(compAtual) {
  const raw = ($('giap-rastreio-meses')?.value || '202601').trim();
  if (/^\d{6}$/.test(raw)) {
    return giapListaCompsCascata(compAtual, Number(raw));
  }
  const n = Number(raw) || 6;
  return [Number(compAtual), ...giapListaCompsAnteriores(compAtual, n)];
}

/**
 * Puxa na API competência a competência. Se não achar, tenta a mais antiga automaticamente.
 * Para no primeiro mês em que o portal gravar/filtrar o servidor.
 */
async function giapSyncNomeCascata({ nome, matricula, comps, onStep }) {
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  let ultimoErro = null;
  let tentativas = 0;

  for (let i = 0; i < comps.length; i++) {
    if (_giapPuxarTodos.parar) {
      return { encontrada: false, parado: true, tentativas, ultimoErro, competencia: null, hit: null, data: null };
    }
    const comp = comps[i];
    tentativas++;
    if (typeof onStep === 'function') {
      onStep({
        comp,
        indiceComp: i,
        totalComps: comps.length,
        tentativas,
        msg: i === 0
          ? `API ${comp} (atual)`
          : `Não achou — tentando mais antigo ${comp} (${i + 1}/${comps.length})`
      });
    }
    try {
      const data = await giapProxy('sync_nome', {
        nomeServidor: nome,
        competencia: comp,
        matricula: matricula || undefined
      });
      const fil = Number(data.registros_filtrados || 0);
      const ins = Number(data.registros_inseridos || 0);
      if (ins > 0 || fil > 0) {
        const hit = await giapLerFolhaPessoaComp(comp, matricula, nome);
        return {
          encontrada: true,
          parado: false,
          tentativas,
          ultimoErro: null,
          competencia: comp,
          hit: hit || { competencia: comp, demissao: null, funcionario: nome, matricula },
          data
        };
      }
    } catch (e) {
      ultimoErro = e.message || String(e);
      console.warn('[GIAP] cascata', nome, comp, ultimoErro);
      await pause(2500);
    }
    await pause(700);
  }

  return {
    encontrada: false,
    parado: false,
    tentativas,
    ultimoErro,
    competencia: null,
    hit: null,
    data: null
  };
}

function giapRastreioStatusMeta(st) {
  const map = {
    candidato_exo: { label: 'Demissão no GIAP → sugerir exoneração', color: 'var(--gov-red,#c53030)' },
    sumiu: { label: 'Estava na folha e sumiu (sem demissão)', color: 'var(--gov-orange,#c05621)' },
    sem_historico: { label: 'Sem histórico nos meses buscados', color: 'var(--color-text-muted,#718096)' },
    nao_rastreado: { label: '—', color: 'var(--color-text-muted,#a0aec0)' }
  };
  return map[st] || map.nao_rastreado;
}

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
  const { semMatricula, comMatricula, totalFora, rastreioFeito, rastreioStats, rastreioComps } = _giapFaltando;
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
      let html =
        `<strong>${totalFora} servidor(es)</strong> do RH ainda fora dos Resultados ` +
        `(<strong>${semMatricula}</strong> sem matrícula · <strong>${comMatricula}</strong> com matrícula). ` +
        `Competência <strong>${comp}</strong>.`;
      if (rastreioFeito) {
        html +=
          `<br><span style="margin-top:4px;display:inline-block">Rastreio (${(rastreioComps || []).join(', ') || '—'}): ` +
          `<strong>${rastreioStats.demitidos || 0}</strong> com demissão GIAP · ` +
          `<strong>${rastreioStats.sumiu || 0}</strong> sumiram sem demissão · ` +
          `<strong>${rastreioStats.semHistorico || 0}</strong> sem histórico local.</span>`;
      } else {
        html +=
          ` Use <strong>Puxar faltantes</strong> para consultar a API (mês atual → mais antigo).`;
      }
      resumo.innerHTML = html;
    } else {
      resumo.style.display = '';
      resumo.style.background = '#f0fff4';
      resumo.style.borderColor = '#9ae6b4';
      resumo.style.color = '#276749';
      resumo.innerHTML = `Ninguém faltando na competência <strong>${comp}</strong> — todo o RH elegível já está na folha.`;
    }
  }
  const btnExo = $('giap-btn-exonerar-sugeridos');
  if (btnExo) {
    const n = rastreioStats?.demitidos || 0;
    btnExo.style.display = rastreioFeito && n > 0 ? '' : 'none';
    btnExo.innerHTML = n > 0
      ? `<i class="ti ti-user-off"></i> Exonerar sugeridos (${n})`
      : `<i class="ti ti-user-off"></i> Exonerar sugeridos`;
  }
  if ($('giap-faltando-page')) {
    $('giap-faltando-page').textContent = `${p} / ${pages}`;
  }

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state" style="color:var(--gov-green);font-weight:600">Ninguém faltando: todo o RH elegível já está na folha sync.</td></tr>';
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
    const tr = r._rastreio || {};
    const st = giapRastreioStatusMeta(tr.status || 'nao_rastreado');
    const ultima = tr.competencia ? String(tr.competencia) : '—';
    const dem = tr.demissao ? giapFolhaFmtDt(tr.demissao) : '—';
    let acoes =
      `<button type="button" class="btn-secondary" style="padding:4px 8px;font-size:12px;margin:1px"
        onclick='giapPuxarNomeDireto(${nomeJs}, ${matJs})'>Puxar</button>`;
    if (tr.status === 'candidato_exo' && r.id) {
      acoes +=
        `<button type="button" class="btn-primary" style="padding:4px 8px;font-size:12px;margin:1px;background:var(--gov-red)"
          onclick="giapExonerarPorRastreio(${Number(r.id)})" title="Exonerar com base na demissão encontrada no GIAP">
          Exonerar
        </button>`;
    }
    return `<tr>
      <td style="font-family:monospace;font-size:12px">${htmlEscape(r.matricula || '—')}</td>
      <td style="font-weight:600">${htmlEscape(r.nome || '—')}</td>
      <td>${htmlEscape(r.vinculo || '—')}</td>
      <td style="font-size:12px">${fmt(r.data_admissao)}</td>
      <td style="font-family:monospace;font-size:12px">${htmlEscape(ultima)}</td>
      <td style="font-size:12px;${tr.demissao ? 'color:var(--gov-red);font-weight:600' : ''}">${htmlEscape(dem)}</td>
      <td style="font-size:12px;color:${st.color};font-weight:600;max-width:220px">${htmlEscape(st.label)}</td>
      <td style="text-align:center;white-space:nowrap">${acoes}</td>
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

/** Após sync_nome, lê a linha gravada em folha_pmsl (resultado real da API). */
async function giapLerFolhaPessoaComp(comp, matricula, nome) {
  const mk = giapMatKey(matricula);
  const nn = giapNormNome(nome);
  const sel = 'matricula, funcionario, funcionario_norm, demissao, competencia';

  if (matricula) {
    const matRaw = String(matricula).trim();
    const { data, error } = await sb.from('folha_pmsl')
      .select(sel)
      .eq('competencia', Number(comp))
      .eq('matricula', matRaw)
      .limit(10);
    if (error) throw error;
    const hit = (data || []).find((f) => giapMatKey(f.matricula) === mk) || data?.[0];
    if (hit) return hit;
  }

  const tokens = nn.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const { data, error } = await sb.from('folha_pmsl')
      .select(sel)
      .eq('competencia', Number(comp))
      .ilike('funcionario', `%${tokens[0]}%${tokens[tokens.length - 1]}%`)
      .limit(50);
    if (error) throw error;
    const exact = (data || []).find((f) => (f.funcionario_norm || giapNormNome(f.funcionario)) === nn);
    if (exact) return exact;
    const soft = (data || []).find((f) => giapNomesCompativeis(nome, f.funcionario));
    if (soft) return soft;
  }
  return null;
}

/**
 * Um botão só: puxa na API quem ainda não foi rastreado.
 * Tenta o mês atual; se não achar, desce automaticamente mês a mês até o limite (padrão jan/2026).
 */
window.giapPuxarFaltantesCascata = async function giapPuxarFaltantesCascata() {
  if (_giapPuxarTodos.rodando) {
    return showToast('Já há um puxar em andamento. Use Parar se quiser interromper.', 'info');
  }

  const st = $('giap-vasculha-status');
  const btn = $('giap-btn-vasculha-puxar-todos');
  const btnParar = $('giap-btn-vasculha-parar') || $('giap-btn-parar-puxar');
  const btnTopoParar = $('giap-btn-parar-puxar');

  try {
    if (!_giapFaltando.rows?.length) {
      await giapCarregarFaltandoFolha();
    }

    // Só quem ainda não foi localizado na API (não rastreados / sem histórico)
    const jaLocalizado = (r) => {
      const s = r._rastreio?.status;
      return s === 'candidato_exo' || s === 'sumiu';
    };
    let faltando = (_giapFaltando.rows || []).filter((r) => {
      if ((r.nome || '').trim().split(/\s+/).length < 2) return false;
      return !jaLocalizado(r);
    });

    if (!faltando.length) {
      return showToast(
        'Ninguém pendente: todos os faltantes já foram rastreados na API (ou a lista está vazia).',
        'info'
      );
    }

    const compAtual = Number(
      _giapFolha.competencia || $('giap-cfg-comp')?.value || giapCompetenciaPadrao()
    );
    const comps = giapCompsRastreioSelecionadas(compAtual);
    if (!comps.length) {
      return showToast(`Sem competências para buscar (atual ${compAtual}).`, 'info');
    }

    const okConfirm = confirm(
      `Puxar ${faltando.length} faltante(s) ainda não rastreados?\n\n` +
      `• API GIAP 1 a 1\n` +
      `• Ordem: ${comps[0]} → … → ${comps[comps.length - 1]}\n` +
      `• Se não achar no mês, tenta o mais antigo automaticamente\n` +
      `• Use Parar a qualquer momento\n\n` +
      `Continuar?`
    );
    if (!okConfirm) return;

    _giapPuxarTodos.rodando = true;
    _giapPuxarTodos.parar = false;
    if (btn) btn.disabled = true;
    if (btnParar) btnParar.style.display = '';
    if (btnTopoParar) btnTopoParar.style.display = '';
    if (st) {
      st.style.display = '';
      st.textContent = 'Iniciando puxar faltantes…';
    }

    let demitidos = 0;
    let sumiu = 0;
    let naAtual = 0;
    let semHistorico = 0;
    let errosApi = 0;
    let processados = 0;
    const total = faltando.length;
    const todosRows = _giapFaltando.rows || [];

    const aplicarSortStats = () => {
      const ordem = { candidato_exo: 0, sumiu: 1, sem_historico: 2, nao_rastreado: 3 };
      todosRows.sort((a, b) => {
        const sa = ordem[a._rastreio?.status] ?? 9;
        const sb = ordem[b._rastreio?.status] ?? 9;
        if (sa !== sb) return sa - sb;
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
      });
      _giapFaltando.rows = todosRows;
      _giapFaltando.rastreioFeito = true;
      _giapFaltando.rastreioComps = comps;
      _giapFaltando.rastreioStats = { demitidos, sumiu, semHistorico };
      giapFaltandoRender();
    };

    for (let i = 0; i < faltando.length; i++) {
      if (_giapPuxarTodos.parar) break;
      const r = faltando[i];
      const nome = String(r.nome || '').trim();
      const mat = r.matricula ? String(r.matricula).trim() : '';

      const res = await giapSyncNomeCascata({
        nome,
        matricula: mat,
        comps,
        onStep: ({ comp, msg }) => {
          const pct = Math.round(((processados + 0.5) / total) * 100);
          giapPintarProgresso({
            id: null,
            progresso_pct: Math.min(99, pct),
            status: 'running',
            competencia: comp,
            meta: `Puxar faltantes ${i + 1}/${total}`,
            etapa: `${nome} · ${msg}`,
            resumo: {
              etapa: `faltantes_${i + 1}/${total}`,
              nome,
              competencia: comp,
              na_atual: naAtual,
              demitidos,
              sumiu,
              sem_historico: semHistorico,
              erros: errosApi
            }
          });
          if (st) {
            st.textContent =
              `${i + 1}/${total} · ${msg} · ${nome}` +
              ` · na atual ${naAtual} · demissão ${demitidos} · sumiu ${sumiu} · sem hist. ${semHistorico}` +
              (errosApi ? ` · erro ${errosApi}` : '');
          }
        }
      });

      processados++;
      if (res.ultimoErro && !res.encontrada) errosApi++;

      if (res.encontrada && res.hit) {
        const hit = res.hit;
        const naCompAtual = Number(res.competencia) === Number(compAtual);
        if (hit.demissao) {
          r._rastreio = {
            status: 'candidato_exo',
            competencia: hit.competencia || res.competencia,
            demissao: hit.demissao,
            funcionario: hit.funcionario,
            matricula_giap: hit.matricula,
            fonte: 'api'
          };
          demitidos++;
        } else if (naCompAtual) {
          // Achou na competência atual → sai da fila de faltantes
          r._rastreio = {
            status: 'sumiu',
            competencia: res.competencia,
            demissao: null,
            funcionario: hit.funcionario || nome,
            matricula_giap: hit.matricula,
            fonte: 'api',
            na_competencia_atual: true
          };
          naAtual++;
          // Remove da lista visual (já entrou / vai entrar nos Resultados)
          const idx = todosRows.indexOf(r);
          if (idx >= 0) todosRows.splice(idx, 1);
        } else {
          r._rastreio = {
            status: 'sumiu',
            competencia: hit.competencia || res.competencia,
            demissao: null,
            funcionario: hit.funcionario,
            matricula_giap: hit.matricula,
            fonte: 'api'
          };
          sumiu++;
        }
      } else {
        r._rastreio = {
          status: 'sem_historico',
          competencia: null,
          demissao: null,
          funcionario: null,
          fonte: 'api',
          erro: res.ultimoErro || null
        };
        semHistorico++;
      }

      if ((i + 1) % 2 === 0 || i === faltando.length - 1) {
        aplicarSortStats();
      }
    }

    _giapFaltando.page = 1;
    aplicarSortStats();
    await giapCarregarFolhaTabela().catch(() => {});

    const parado = _giapPuxarTodos.parar;
    const msg =
      (parado ? 'Parado. ' : '') +
      `Puxar faltantes: ${naAtual} na competência atual · ${demitidos} com demissão · ` +
      `${sumiu} em mês antigo sem demissão · ${semHistorico} sem histórico` +
      (errosApi ? ` · ${errosApi} erro(s)` : '') +
      ` (${processados}/${total}).`;
    if (st) st.textContent = msg;
    showToast(msg, demitidos ? 'warning' : 'success');
    giapPintarProgresso({
      id: null,
      progresso_pct: 100,
      status: parado ? 'cancelled' : 'done',
      competencia: compAtual,
      meta: 'Puxar faltantes (cascata API)',
      resumo: { naAtual, demitidos, sumiu, semHistorico, errosApi, processados, total, comps, parado }
    });
    await registrarLog('GIAP — PUXAR FALTANTES CASCATA', null, 'Vasculha', {
      competencia_atual: compAtual,
      comps,
      total,
      processados,
      na_atual: naAtual,
      demitidos,
      sumiu,
      sem_historico: semHistorico,
      erros_api: errosApi,
      parado
    });
  } catch (e) {
    console.error('[GIAP] puxar faltantes', e);
    showToast(e.message || String(e), 'error');
    if (st) st.textContent = 'Erro: ' + (e.message || e);
  } finally {
    _giapPuxarTodos.rodando = false;
    _giapPuxarTodos.parar = false;
    if (btn) btn.disabled = false;
    if (btnParar) btnParar.style.display = 'none';
    if (btnTopoParar) btnTopoParar.style.display = 'none';
  }
};

// Aliases: botões/fluxos antigos apontam para o mesmo botão único
window.giapRastrearSaidasAnteriores = window.giapPuxarFaltantesCascata;
window.giapPuxarTodosVasculha = async function giapPuxarTodosVasculha() {
  return window.giapPuxarFaltantesCascata();
};
window.giapPuxarTodosFaltando = async function giapPuxarTodosFaltando() {
  return window.giapPuxarFaltantesCascata();
};

// ╔══════════════════════════════════════════════════════════════╗
// ║         AUDITORIA DE SAÍDAS GIAP (menu coordenadora)          ║
// ╚══════════════════════════════════════════════════════════════╝
const _audSaidas = {
  rows: [],
  page: 1,
  pageSize: 40,
  rodando: false,
  parar: false,
  comps: [],
  scrapes: 0,
  stats: { dem: 0, sumiu: 0, sem: 0, pendente: 0 }
};

function audStatusMeta(st) {
  const map = {
    candidato_exo: { label: 'Demissão no GIAP → sugerir exoneração', color: 'var(--gov-red,#c53030)' },
    sumiu: { label: 'Apareceu na folha sem demissão', color: 'var(--gov-orange,#c05621)' },
    sem_historico: { label: 'Sem histórico até o piso', color: 'var(--color-text-muted,#718096)' },
    pendente: { label: 'Pendente', color: '#a0aec0' }
  };
  return map[st] || map.pendente;
}

function audAtualizarKpis() {
  const rows = _audSaidas.rows || [];
  const dem = rows.filter((r) => r.status === 'candidato_exo').length;
  const sumiu = rows.filter((r) => r.status === 'sumiu').length;
  const sem = rows.filter((r) => r.status === 'sem_historico').length;
  const pendente = rows.filter((r) => r.status === 'pendente').length;
  _audSaidas.stats = { dem, sumiu, sem, pendente };
  if ($('aud-kpi-alvos')) $('aud-kpi-alvos').textContent = String(rows.length);
  if ($('aud-kpi-dem')) $('aud-kpi-dem').textContent = String(dem);
  if ($('aud-kpi-sumiu')) $('aud-kpi-sumiu').textContent = String(sumiu);
  if ($('aud-kpi-sem')) $('aud-kpi-sem').textContent = String(sem);
  if ($('aud-kpi-api')) $('aud-kpi-api').textContent = String(_audSaidas.scrapes || 0);
  const btnEx = $('aud-btn-exonerar');
  if (btnEx) {
    btnEx.style.display = dem > 0 ? '' : 'none';
    btnEx.innerHTML = `<i class="ti ti-user-off"></i> Exonerar sugeridos (${dem})`;
  }
  const badge = $('badge-giap-rastreio');
  if (badge) {
    badge.textContent = dem > 0 ? String(dem) : '';
    badge.style.display = dem > 0 ? '' : 'none';
  }
}

function audProgresso(pct, label) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  if ($('aud-progress-bar')) $('aud-progress-bar').style.width = `${p}%`;
  if ($('aud-progress-pct')) $('aud-progress-pct').textContent = `${p}%`;
  if ($('aud-progress-label')) $('aud-progress-label').textContent = label || '';
  if ($('aud-status')) $('aud-status').textContent = label || '';
}

window.audRenderTabela = function audRenderTabela() {
  const tbody = $('tbody-aud-saidas');
  if (!tbody) return;
  const termo = ($('aud-busca')?.value || '').trim().toLowerCase();
  const filtro = ($('aud-filtro-status')?.value || '').trim();
  let lista = _audSaidas.rows || [];
  if (filtro) lista = lista.filter((r) => r.status === filtro);
  if (termo) {
    lista = lista.filter((r) =>
      (r.nome || '').toLowerCase().includes(termo) ||
      String(r.matricula || '').toLowerCase().includes(termo)
    );
  }
  const pages = Math.max(1, Math.ceil(lista.length / _audSaidas.pageSize) || 1);
  if (_audSaidas.page > pages) _audSaidas.page = pages;
  const p = _audSaidas.page;
  const slice = lista.slice((p - 1) * _audSaidas.pageSize, p * _audSaidas.pageSize);
  if ($('aud-count')) $('aud-count').textContent = `${lista.length} registro(s)`;
  if ($('aud-page')) $('aud-page').textContent = `${p} / ${pages}`;
  if (!slice.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhum registro neste filtro.</td></tr>';
    return;
  }
  tbody.innerHTML = slice.map((r) => {
    const meta = audStatusMeta(r.status);
    const dem = r.demissao ? giapFolhaFmtDt(r.demissao) : '—';
    let acao = '—';
    if (r.status === 'candidato_exo' && r.id) {
      acao = `<button type="button" class="btn-primary" style="padding:4px 8px;font-size:12px;background:var(--gov-red)" onclick="audExonerarUm(${Number(r.id)})">Exonerar</button>`;
    }
    return `<tr>
      <td style="font-family:monospace;font-size:12px">${htmlEscape(r.matricula || '—')}</td>
      <td style="font-weight:600">${htmlEscape(r.nome || '—')}</td>
      <td style="font-family:monospace;font-size:12px">${htmlEscape(r.competencia ? String(r.competencia) : '—')}</td>
      <td style="font-size:12px;${r.demissao ? 'color:var(--gov-red);font-weight:600' : ''}">${htmlEscape(dem)}</td>
      <td style="font-size:12px">${htmlEscape(r.fonte || '—')}</td>
      <td style="font-size:12px;color:${meta.color};font-weight:600">${htmlEscape(meta.label)}</td>
      <td style="text-align:center">${acao}</td>
    </tr>`;
  }).join('');
};

window.audPagina = function audPagina(delta) {
  const pages = Math.max(1, Math.ceil((_audSaidas.rows || []).length / _audSaidas.pageSize) || 1);
  _audSaidas.page = Math.min(pages, Math.max(1, _audSaidas.page + delta));
  audRenderTabela();
};

/** Carrega o último job de auditoria e, se houver, hidrata a tabela com os resultados persistidos. */
async function audCarregarUltimaExecucao() {
  try {
    const { data: jobs } = await sb.from('giap_jobs')
      .select('id, status, resumo, finished_at, progresso_pct')
      .eq('tipo', 'auditoria_saidas')
      .order('id', { ascending: false })
      .limit(1);
    const job = jobs?.[0];
    if (!job) return null;
    const jobRaiz = Number(job.resumo?.auditoria?.job_raiz || job.id);
    const linhas = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('giap_auditoria_saidas')
        .select('funcionario_id, matricula, nome, status, competencia, demissao, fonte')
        .eq('job_id', jobRaiz)
        .order('nome')
        .range(from, from + 999);
      if (error) throw error;
      if (data?.length) {
        linhas.push(...data.map((r) => ({
          id: r.funcionario_id,
          matricula: r.matricula,
          nome: r.nome,
          status: r.status,
          competencia: r.competencia,
          demissao: r.demissao,
          fonte: r.fonte
        })));
      }
      if (!data || data.length < 1000) break;
    }
    _audSaidas.rows = linhas
      // Ativos em compRef não interessam para a lista final
      .filter((r) => r.status !== 'ativo_compref')
      .sort((a, b) => {
        const ord = { candidato_exo: 0, sumiu: 1, sem_historico: 2, pendente: 3 };
        return (ord[a.status] ?? 9) - (ord[b.status] ?? 9) ||
          String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
      });
    _audSaidas.page = 1;
    return job;
  } catch (e) {
    console.warn('[aud] carregar última execução', e.message);
    return null;
  }
}

window.renderGiapAuditoriaSaidas = async function renderGiapAuditoriaSaidas() {
  if (!usuarioEhCoordenador()) return;
  const sug = Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
  if ($('aud-comp-ref') && !$('aud-comp-ref').value) $('aud-comp-ref').value = String(sug);
  if ($('aud-comp-piso') && !$('aud-comp-piso').value) $('aud-comp-piso').value = '202501';

  const job = await audCarregarUltimaExecucao();
  audAtualizarKpis();
  audRenderTabela();

  if (job) {
    const meta = job.resumo?.auditoria || {};
    const label = job.status === 'running' || job.status === 'pending'
      ? `Auditoria em andamento no Render · lote #${job.id} · ${job.progresso_pct || 0}%`
      : `Última auditoria: ${meta.comp_piso || '?'} → ${meta.comp_ref || '?'} · concluída em ${job.finished_at ? new Date(job.finished_at).toLocaleString('pt-BR') : '—'}`;
    audProgresso(job.progresso_pct || (job.status === 'done' ? 100 : 0), label);
    if (job.status === 'running' || job.status === 'pending') {
      // Retoma o polling — se fecharem a aba de novo, o Render segue sozinho
      audMonitorarJobRaiz(Number(job.resumo?.auditoria?.job_raiz || job.id)).catch((e) => {
        console.warn('[aud] monitor', e.message);
      });
    }
  }
};

/**
 * Segue o job (e as continuações da mesma auditoria) até tudo terminar.
 * Rehidrata a tabela quando houver mudanças. Pode ser interrompido fechando a aba
 * — o Render continua sozinho via agendarProximoLote.
 */
async function audMonitorarJobRaiz(jobRaiz) {
  if (_audSaidas.monitorando) return;
  _audSaidas.monitorando = true;
  _audSaidas.parar = false;
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    while (!_audSaidas.parar) {
      const { data: jobs } = await sb.from('giap_jobs')
        .select('id, status, resumo, progresso_pct, finished_at')
        .eq('tipo', 'auditoria_saidas')
        .or(`id.eq.${jobRaiz},resumo->auditoria->>job_raiz.eq.${jobRaiz}`)
        .order('id', { ascending: false })
        .limit(1);
      const atual = jobs?.[0];
      const st = atual?.status || '—';
      const pct = Number(atual?.progresso_pct || 0);
      const etapa = atual?.resumo?.etapa ? ` · ${atual.resumo.etapa}` : '';
      audProgresso(pct, `Render · lote #${atual?.id} · ${st} · ${pct}%${etapa}`);

      // Rehidrata resultados parciais
      await audCarregarUltimaExecucao();
      audAtualizarKpis();
      audRenderTabela();

      // Só sai quando o último lote deu done E não há continuação pendente
      const concluido =
        st === 'done' && !(atual?.resumo?.auditoria?.pendentes_ids?.length);
      if (concluido) {
        audProgresso(100, 'Auditoria concluída.');
        break;
      }
      if (st === 'error' || st === 'cancelled') {
        showToast(`Lote #${atual?.id} terminou com ${st}: ${atual?.resumo?.etapa || 'sem detalhes'}. O Render pode ter reiniciado; clique em Iniciar para retomar de onde parou.`, 'warning');
        break;
      }
      await pause(4000);
    }
  } finally {
    _audSaidas.monitorando = false;
  }
}

window.audPararRastreio = async function audPararRastreio() {
  _audSaidas.parar = true;
  _giapPuxarTodos.parar = true;
  audProgresso(null, 'Parando cadeia no Render — o lote atual termina, os próximos não iniciam…');
  try {
    await giapProxy('parar_cadeia', {});
    showToast('Cadeia de lotes cancelada no Render.', 'info');
  } catch (e) {
    console.warn('[aud] parar_cadeia', e.message);
    showToast('Não deu para avisar o Render; o lote atual ainda vai terminar.', 'warning');
  }
};

window.audIniciarRastreio = async function audIniciarRastreio() {
  if (_audSaidas.rodando || _giapPuxarTodos.rodando) {
    return showToast('Já há uma auditoria/puxar em andamento.', 'info');
  }
  const escopo = $('aud-escopo')?.value || 'todos_ativos';
  const compRef = Number($('aud-comp-ref')?.value || giapCompetenciaPadrao());
  const compPiso = Number($('aud-comp-piso')?.value || 202501);
  if (!compRef || !compPiso || compPiso > compRef) {
    return showToast('Informe competência de referência e piso válidos (piso ≤ referência).', 'warning');
  }
  const comps = giapListaCompsCascata(compRef, compPiso);
  if (!comps.length) return showToast('Sem competências no intervalo.', 'info');

  const ok = confirm(
    `Iniciar auditoria de saídas?\n\n` +
    `• Escopo: ${escopo === 'todos_ativos' ? 'todos ativos' : 'só não identificados'}\n` +
    `• Intervalo: ${compRef} → ${compPiso} (${comps.length} competências)\n` +
    `• Estratégia: quem aparecer na folha de ${compRef} = ATIVO (sem scrape).\n` +
    `  Só os faltantes viram consulta por nome no GIAP mês a mês, parando na 1ª aparição.\n` +
    `• O trabalho roda no Render em SEGUNDO PLANO — você pode fechar esta aba.\n\n` +
    `Continuar?`
  );
  if (!ok) return;

  _audSaidas.rodando = true;
  _audSaidas.parar = false;
  _giapPuxarTodos.rodando = true;
  _giapPuxarTodos.parar = false;
  _audSaidas.scrapes = 0;
  _audSaidas.comps = comps;
  if ($('aud-btn-iniciar')) $('aud-btn-iniciar').disabled = true;
  if ($('aud-btn-parar')) $('aud-btn-parar').style.display = '';

  try {
    audProgresso(1, 'Enviando job para o Render…');
    try { await giapProxy('parar_cadeia', {}); } catch (_) { /* ok */ }
    const data = await giapProxy('start_job', {
      tipo: 'auditoria_saidas',
      competencia: compRef,
      dryRun: false,
      filtros: { compRef, compPiso, escopo }
    });
    const job = data.job || data;
    if (!job?.id) throw new Error('Render não devolveu id do job.');
    _audSaidas.scrapes = 0;
    audProgresso(3, `Job #${job.id} criado. Auditoria roda no Render em 2º plano — pode fechar a aba.`);
    showToast(`Auditoria iniciada (job #${job.id}). Pode fechar esta aba — o Render continua e o resultado aparece aqui quando você voltar.`, 'success');
    await registrarLog('GIAP — AUDITORIA SAÍDAS INICIADA', null, 'Auditoria', {
      escopo, compRef, compPiso, comps, job_id: job.id
    });
    // Enquanto a aba estiver aberta, acompanha
    await audMonitorarJobRaiz(job.id);
  } catch (e) {
    console.error('[AUD]', e);
    showToast(e.message || String(e), 'error');
    audProgresso(0, 'Erro: ' + (e.message || e));
  } finally {
    _audSaidas.rodando = false;
    _audSaidas.parar = false;
    _giapPuxarTodos.rodando = false;
    _giapPuxarTodos.parar = false;
    if ($('aud-btn-iniciar')) $('aud-btn-iniciar').disabled = false;
    if ($('aud-btn-parar')) $('aud-btn-parar').style.display = 'none';
    audAtualizarKpis();
    audRenderTabela();
  }
};

window.audExonerarUm = async function audExonerarUm(rhId) {
  const r = (_audSaidas.rows || []).find((x) => Number(x.id) === Number(rhId));
  if (!r || r.status !== 'candidato_exo') return showToast('Registro sem demissão sugerida.', 'warning');
  const dataExo = giapDataISO(r.demissao) || new Date().toISOString().slice(0, 10);
  if (!confirm(`Exonerar “${r.nome}”?\nDemissão GIAP: ${giapFolhaFmtDt(r.demissao)}\nÚltima folha: ${r.competencia}`)) return;
  try {
    const { error } = await sb.rpc('fn_exonerar_funcionario', {
      p_funcionario_id: Number(rhId),
      p_data_exoneracao: dataExo,
      p_motivo: `Auditoria GIAP — folha ${r.competencia} com demissão`,
      p_tipo_saida: 'EXONERACAO'
    });
    if (error) throw error;
    await registrarLog('GIAP — EXONERAÇÃO AUDITORIA', Number(rhId), r.nome, {
      data_exoneracao: dataExo, competencia: r.competencia, demissao: r.demissao
    });
    _audSaidas.rows = _audSaidas.rows.filter((x) => Number(x.id) !== Number(rhId));
    atualizarBadgesSemLotacaoExonerados();
    audAtualizarKpis();
    audRenderTabela();
    showToast(`${r.nome} enviado para Exonerados.`, 'success');
  } catch (e) {
    showToast(e.message || String(e), 'error');
  }
};

window.audExonerarSugeridos = async function audExonerarSugeridos() {
  const lista = (_audSaidas.rows || []).filter((r) => r.status === 'candidato_exo' && r.id);
  if (!lista.length) return showToast('Nenhum sugerido.', 'info');
  if (!confirm(`Exonerar ${lista.length} servidor(es) com demissão no GIAP?`)) return;
  let ok = 0;
  for (const r of lista) {
    try {
      const dataExo = giapDataISO(r.demissao) || new Date().toISOString().slice(0, 10);
      const { error } = await sb.rpc('fn_exonerar_funcionario', {
        p_funcionario_id: Number(r.id),
        p_data_exoneracao: dataExo,
        p_motivo: `Auditoria GIAP (lote) — folha ${r.competencia}`,
        p_tipo_saida: 'EXONERACAO'
      });
      if (error) throw error;
      ok++;
    } catch (e) {
      console.warn('[AUD] exo', r.nome, e);
    }
  }
  _audSaidas.rows = _audSaidas.rows.filter((r) => r.status !== 'candidato_exo');
  atualizarBadgesSemLotacaoExonerados();
  audAtualizarKpis();
  audRenderTabela();
  showToast(`Exonerados: ${ok} de ${lista.length}.`, ok ? 'success' : 'warning');
};

window.audExportarCsv = function audExportarCsv() {
  const rows = _audSaidas.rows || [];
  if (!rows.length) return showToast('Nada para exportar.', 'info');
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    'matricula,nome,ultima_folha,demissao,fonte,status',
    ...rows.map((r) => [r.matricula, r.nome, r.competencia, r.demissao, r.fonte, audStatusMeta(r.status).label].map(esc).join(','))
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `auditoria_saidas_giap.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

window.giapExonerarPorRastreio = async function giapExonerarPorRastreio(rhId) {
  const r = (_giapFaltando.rows || []).find((x) => Number(x.id) === Number(rhId));
  if (!r) return showToast('Servidor não encontrado na Vasculha.', 'error');
  const tr = r._rastreio;
  if (!tr || tr.status !== 'candidato_exo') {
    return showToast('Só é possível exonerar quem o rastreio marcou com demissão no GIAP.', 'warning');
  }
  const dataExo = giapDataISO(tr.demissao) || new Date().toISOString().slice(0, 10);
  const ok = confirm(
    `Exonerar “${r.nome}”?\n\n` +
    `Última folha GIAP: ${tr.competencia}\n` +
    `Demissão GIAP: ${giapFolhaFmtDt(tr.demissao)}\n` +
    `Data da saída no RH: ${giapFolhaFmtDt(dataExo)}\n\n` +
    `Vai para Exonerados e Demitidos (tipo Exoneração).`
  );
  if (!ok) return;
  try {
    const { error } = await sb.rpc('fn_exonerar_funcionario', {
      p_funcionario_id: Number(rhId),
      p_data_exoneracao: dataExo,
      p_motivo: `Rastreio GIAP — última folha ${tr.competencia} com demissão`,
      p_tipo_saida: 'EXONERACAO'
    });
    if (error) throw error;
    await registrarLog('GIAP — EXONERAÇÃO POR RASTREIO', Number(rhId), r.nome, {
      data_exoneracao: dataExo,
      competencia_giap: tr.competencia,
      demissao_giap: tr.demissao
    });
    showToast(`${r.nome} enviado para Exonerados.`, 'success');
    atualizarBadgesSemLotacaoExonerados();
    await giapCarregarFaltandoFolha();
  } catch (e) {
    showToast(e.message || String(e), 'error');
  }
};

window.giapExonerarSugeridosRastreio = async function giapExonerarSugeridosRastreio() {
  const lista = (_giapFaltando.rows || []).filter((r) => r._rastreio?.status === 'candidato_exo' && r.id);
  if (!lista.length) return showToast('Nenhum sugerido com demissão GIAP.', 'info');
  if (!confirm(
    `Exonerar ${lista.length} servidor(es) marcados com demissão no GIAP?\n\n` +
    `Cada um sai do quadro ativo com a data de demissão encontrada.\n` +
    `Confira a lista antes — esta ação afeta o RH.`
  )) return;

  const st = $('giap-vasculha-status');
  let ok = 0;
  let erro = 0;
  if (st) {
    st.style.display = '';
    st.textContent = `Exonerando sugeridos 0/${lista.length}…`;
  }

  for (let i = 0; i < lista.length; i++) {
    const r = lista[i];
    const tr = r._rastreio;
    const dataExo = giapDataISO(tr.demissao) || new Date().toISOString().slice(0, 10);
    if (st) st.textContent = `Exonerando ${i + 1}/${lista.length} · ${r.nome}`;
    try {
      const { error } = await sb.rpc('fn_exonerar_funcionario', {
        p_funcionario_id: Number(r.id),
        p_data_exoneracao: dataExo,
        p_motivo: `Rastreio GIAP (lote) — última folha ${tr.competencia} com demissão`,
        p_tipo_saida: 'EXONERACAO'
      });
      if (error) throw error;
      await registrarLog('GIAP — EXONERAÇÃO POR RASTREIO (LOTE)', Number(r.id), r.nome, {
        data_exoneracao: dataExo,
        competencia_giap: tr.competencia,
        demissao_giap: tr.demissao
      });
      ok++;
    } catch (e) {
      erro++;
      console.warn('[GIAP] exonerar sugerido', r.nome, e.message || e);
    }
  }

  atualizarBadgesSemLotacaoExonerados();
  await giapCarregarFaltandoFolha();
  const msg = `Exoneração em lote: ${ok} ok · ${erro} erro(s) de ${lista.length}.`;
  if (st) st.textContent = msg;
  showToast(msg, erro ? 'warning' : 'success');
};

window.giapExportarFaltantesCsv = function giapExportarFaltantesCsv() {
  const rows = _giapFaltando.rows || [];
  if (!rows.length) return showToast('Nada para exportar — rode Vasculhar faltantes.', 'info');
  const comp = _giapFolha.competencia || Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    'matricula,nome,vinculo,data_admissao,competencia_atual,ultima_folha,demissao_giap,status_saida',
    ...rows.map((r) => {
      const tr = r._rastreio || {};
      const st = giapRastreioStatusMeta(tr.status || 'nao_rastreado').label;
      return [r.matricula, r.nome, r.vinculo, r.data_admissao, comp, tr.competencia || '', tr.demissao || '', st]
        .map(esc)
        .join(',');
    })
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

window.giapCarregarFaltandoFolha = async function giapCarregarFaltandoFolha() {
  const tbody = $('tbody-giap-faltando');
  if (!tbody) return;
  const comp = Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
  tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><span class="spinner"></span> Vasculhando RH × folha…</td></tr>';
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

    // Preserva status de puxar/rastreio anterior (por id / matrícula / nome)
    const prevById = new Map();
    const prevByMat = new Map();
    const prevByNome = new Map();
    for (const old of _giapFaltando.rows || []) {
      if (!old._rastreio) continue;
      if (old.id != null) prevById.set(Number(old.id), old._rastreio);
      const mk = giapMatKey(old.matricula);
      if (mk) prevByMat.set(mk, old._rastreio);
      const nn = giapNormNome(old.nome);
      if (nn) prevByNome.set(nn, old._rastreio);
    }
    for (const r of faltando) {
      const tr =
        (r.id != null && prevById.get(Number(r.id))) ||
        (giapMatKey(r.matricula) && prevByMat.get(giapMatKey(r.matricula))) ||
        prevByNome.get(giapNormNome(r.nome));
      if (tr) r._rastreio = tr;
    }

    faltando.sort((a, b) => {
      const ordem = { candidato_exo: 0, sumiu: 1, sem_historico: 2, nao_rastreado: 3 };
      const sa = ordem[a._rastreio?.status] ?? 9;
      const sb = ordem[b._rastreio?.status] ?? 9;
      if (sa !== sb) return sa - sb;
      const am = giapTemMatricula(a.matricula) ? 1 : 0;
      const bm = giapTemMatricula(b.matricula) ? 1 : 0;
      if (am !== bm) return am - bm;
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });

    const demitidos = faltando.filter((r) => r._rastreio?.status === 'candidato_exo').length;
    const sumiu = faltando.filter((r) => r._rastreio?.status === 'sumiu').length;
    const semHistorico = faltando.filter((r) => r._rastreio?.status === 'sem_historico').length;

    _giapFaltando.rows = faltando;
    _giapFaltando.totalFora = fora.length;
    _giapFaltando.semMatricula = semMat.length;
    _giapFaltando.comMatricula = comMat.length;
    _giapFaltando.page = 1;
    _giapFaltando.rastreioFeito = demitidos + sumiu + semHistorico > 0;
    _giapFaltando.rastreioStats = { demitidos, sumiu, semHistorico };
    giapFaltandoRender();

    const card = $('giap-card-fila-resultados');
    if (card) card.style.display = '';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Erro: ${htmlEscape(e.message || e)}</td></tr>`;
  }
}

function giapSetPararFolhaVisible(show) {
  const btn = $('giap-btn-parar-folha');
  if (btn) btn.style.display = show ? '' : 'none';
}

window.giapPararBuscaFolha = async function giapPararBuscaFolha() {
  _giapAutoContinuarFolha = false;
  giapSetPararFolhaVisible(false);
  try {
    await giapProxy('parar_cadeia', {});
    showToast('Parado: o lote atual termina e o servidor não inicia o próximo.', 'info');
  } catch (e) {
    showToast('Aviso: não confirmou o stop no servidor. ' + (e.message || e), 'warning');
  }
};

async function giapAcompanharProximoJobServidor(competencia) {
  try {
    const { data: jobs } = await sb.from('giap_jobs')
      .select('*')
      .eq('competencia', Number(competencia))
      .in('status', ['pending', 'running'])
      .order('id', { ascending: false })
      .limit(1);
    const prox = jobs?.[0];
    if (prox?.id) {
      _giapJobId = prox.id;
      giapPintarProgresso(prox);
      giapIniciarPoll(prox.id);
      return true;
    }
  } catch (_) { /* ok */ }
  return false;
}

function giapIniciarPoll(jobId) {
  if (_giapPollTimer) clearInterval(_giapPollTimer);
  const iniciadoEm = Date.now();
  const MAX_POLL_MS = 50 * 60 * 1000; // 50 min
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
        giapSetPararFolhaVisible(false);
        showToast('Acompanhe pelo progresso ao reabrir a página — o servidor pode continuar sozinho.', 'info');
        return;
      }
      const { data: job } = await sb.from('giap_jobs').select('*').eq('id', jobId).maybeSingle();
      if (!job) return;
      giapPintarProgresso(job);
      if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
        clearInterval(_giapPollTimer);
        _giapPollTimer = null;
        if (job.status === 'done') {
          const pendentes = Number(job.resumo?.sync?.buscas_nome_pendentes || 0);
          const nesteLote = Number(job.resumo?.sync?.buscas_nome || 0);
          const servidorContinua = !!job.resumo?.continuara || pendentes > 0;
          if (job.competencia && pendentes === 0) {
            await giapMarcarCompetenciaBuscada(job.competencia);
          }
          await sincronizarRemuneracoesGiap({ competencia: job.competencia, silencioso: true });

          if (servidorContinua && pendentes > 0 && _giapAutoContinuarFolha) {
            showToast(
              `Lote ok (${nesteLote}). Faltam ~${pendentes}. Servidor continua em 2º plano — pode fechar o navegador.`,
              'info'
            );
            // Espera o Render agendar o próximo (~10s) e acompanha se a aba ainda estiver aberta
            setTimeout(async () => {
              const ok = await giapAcompanharProximoJobServidor(job.competencia);
              if (!ok) {
                giapSetPararFolhaVisible(false);
                renderRelatorioApi();
              }
            }, 12000);
            return;
          }

          _giapAutoContinuarFolha = false;
          giapSetPararFolhaVisible(false);
          showToast(
            pendentes > 0
              ? `Lote concluído. Ainda faltam ~${pendentes}. Se o servidor não seguiu, clique de novo em Buscar e gravar folha.`
              : 'Buscas da competência gravadas na folha.',
            pendentes > 0 ? 'info' : 'success'
          );
        }
        if (job.status === 'error') {
          _giapAutoContinuarFolha = false;
          giapSetPararFolhaVisible(false);
          showToast(`Job GIAP falhou: ${job.erro || 'erro'}`, 'error');
        }
        if (job.status === 'cancelled') {
          _giapAutoContinuarFolha = false;
          giapSetPararFolhaVisible(false);
        }
        renderRelatorioApi();
      }
    } catch (_) { /* ignore */ }
  }, 2000);
}

window.giapRodarCiclo = async function giapRodarCiclo(opts = {}) {
  const btn = $('giap-btn-run');
  if (btn) btn.disabled = true;
  try {
    _giapAutoContinuarFolha = true;
    giapSetPararFolhaVisible(true);
    const competencia = Number($('giap-cfg-comp')?.value || giapCompetenciaPadrao());
    const filtros = giapFiltrosBusca();
    giapProgressoLocal(`Iniciando busca da competência ${competencia}…`, 'chamando_api');
    showToast(
      `Buscando folha ${competencia} em 2º plano no servidor. Pode fechar o navegador — os lotes continuam sozinhos.`,
      'info'
    );
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
    _giapAutoContinuarFolha = false;
    giapSetPararFolhaVisible(false);
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
    if (!confirm(
      `Detectar demissões na API GIAP?\n\n` +
      `• Só quem NÃO está na folha ${competencia} (não encontrado)\n` +
      `• Consulta mês a mês até achar demissão (padrão 12 meses)\n` +
      `• Não exonera sozinho — só lista para você confirmar\n` +
      `• Pode demorar (várias consultas no portal)\n\n` +
      `Continuar?`
    )) {
      btn.disabled = false;
      return;
    }
    giapProgressoLocal(`Confirmando demissões de quem não está na folha ${competencia}…`, 'buscar_demissoes');
    showToast('Puxando demissão na API só de quem não foi encontrado na folha atual…', 'info');
    const data = await giapProxy('start_job', {
      tipo: 'buscar_demissoes',
      competencia,
      dryRun: true,
      filtros: {
        mesesAtras: 12,
        soForaDaFolhaAtual: true
      }
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
    const dia_mes = Math.min(31, Math.max(1, Number($('giap-cfg-dia')?.value || 20)));
    const { data: sess } = await sb.auth.getSession();
    const { error } = await sb.from('giap_config').upsert({
      id: 1,
      automatico,
      dia_mes,
      updated_at: new Date().toISOString(),
      updated_by: sess?.session?.user?.id || null
    });
    if (error) throw error;
    if ($('giap-cfg-dia')) $('giap-cfg-dia').value = dia_mes;
    showToast(
      automatico
        ? `Automático ligado: a partir do dia ${dia_mes} o sistema tenta a competência do mês até a folha sair.`
        : 'Configuração salva.',
      'success'
    );
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
      p_motivo: 'Revisão GIAP — ausência na folha',
      p_tipo_saida: 'EXONERACAO'
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
// ║                    FÉRIAS (UI v2 + Supabase)                  ║
// ╚══════════════════════════════════════════════════════════════╝
const FERIAS_TIPOS = { regular: 'Regulamentar', premio: 'Licença-Prêmio', licenca: 'Licença', abono: 'Abono' };
const FERIAS_TIPOS_REV = Object.fromEntries(Object.entries(FERIAS_TIPOS).map(([k, v]) => [v, k]));

const _ferV2 = { view: 'tabela', page: 1, pageSize: 8, rows: [], bound: false, ano: new Date().getFullYear(), sort: { col: 'servidor', dir: 'asc' }, suppressFilter: false };

const fmtDtFer = (s) => s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

function ferStatusClass(st) {
  if (st === 'Em Gozo') return 'gozo';
  if (st === 'Pendente') return 'pendente';
  if (st === 'Concluído' || st === 'Cancelado') return 'concluido';
  return 'programado';
}

function ferStatusIcon(st) {
  if (st === 'Em Gozo') return 'ti-beach';
  if (st === 'Pendente') return 'ti-alert-circle';
  if (st === 'Concluído') return 'ti-circle-check';
  if (st === 'Cancelado') return 'ti-ban';
  return 'ti-calendar-event';
}

function ferStatusHtml(status) {
  const cls = ferStatusClass(status);
  return `<span class="fer-status ${cls}"><i class="ti ${ferStatusIcon(status)}"></i> ${htmlEscape(status)}</span>`;
}

function ferLinkTipo(url) {
  const u = String(url || '').toLowerCase();
  if (u.startsWith('mailto:') || (u.includes('@') && !u.startsWith('http'))) return 'email';
  if (/sei|processo|\.gov\.br/i.test(u)) return 'sei';
  return 'link';
}

function ferLinkHtml(url) {
  if (!url) return '<span class="fer-vazio">Sem documento</span>';
  const tipo = ferLinkTipo(url);
  const meta = {
    email: { icon: 'ti-mail', label: 'E-mail' },
    sei: { icon: 'ti-file-certificate', label: 'SEI' },
    link: { icon: 'ti-link', label: 'Link' },
  }[tipo];
  let href = url;
  if (tipo === 'email' && !url.startsWith('mailto:')) href = `mailto:${url}`;
  return `<a class="fer-doc-link ${tipo}" href="${htmlEscape(href)}" target="_blank" rel="noopener" title="${htmlEscape(url)}"><i class="ti ${meta.icon}"></i> ${meta.label}</a>`;
}

function ferFotoHtml(path) {
  const url = path ? urlPublicaFoto(path) : null;
  if (url) {
    return `<img class="fer-serv-foto" src="${htmlEscape(url)}" alt="" loading="lazy" width="36" height="36">`;
  }
  return `<span class="fer-serv-foto--empty" aria-hidden="true"><i class="ti ti-user"></i></span>`;
}

function ferServidorCell(r) {
  return `<div class="fer-serv-cell">${ferFotoHtml(r.foto_url)}<div><div class="fer-serv-nome">${htmlEscape(r.servidor)}</div><div class="fer-serv-mat">Mat.: ${htmlEscape(r.matricula || '—')}</div></div></div>`;
}

function ferAcoesHtml(r) {
  return `<div class="fer-actions">
    <button class="btn-icon" title="Editar" onclick="ferEditarRegistro(${r.id})"><i class="ti ti-pencil"></i></button>
    <button class="btn-icon" title="Histórico" onclick="ferVerHistorico(${r.funcionario_id})"><i class="ti ti-history"></i></button>
    <button class="btn-icon" title="Cancelar" style="color:var(--gov-red)" onclick="cancelarFerias(${r.id})"><i class="ti ti-x"></i></button>
  </div>`;
}

function ferCalcStatus(r) {
  if (r.status_ferias) return r.status_ferias;
  const hoje = new Date().toISOString().slice(0, 10);
  if (!r.data_inicio) return 'Pendente';
  if (r.data_inicio <= hoje && r.data_fim && r.data_fim >= hoje) return 'Em Gozo';
  if (r.data_inicio > hoje) return 'Programado';
  if (r.data_fim && r.data_fim < hoje) return 'Concluído';
  return 'Programado';
}

function ferGozoTexto(r) {
  if (!r.data_inicio || !r.data_fim) return null;
  return `${fmtDtFer(r.data_inicio)} a ${fmtDtFer(r.data_fim)}`;
}

function ferNorm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function ferMapRow(raw, funcMap, extraMap, cargoMap) {
  const f = funcMap[raw.funcionario_id] || {};
  const ex = extraMap[raw.funcionario_id] || {};
  const mat = ex.matricula || f.matricula || '';
  const status = ferCalcStatus(raw);
  return {
    id: raw.id,
    funcionario_id: raw.funcionario_id,
    servidor: f.nome || raw.servidor || '—',
    matricula: mat,
    foto_url: ex.foto_url || null,
    cargo: cargoMap[raw.funcionario_id] || '—',
    funcao: f.funcao || '—',
    lotacao: f.lotacao_nome || raw.lotacao || '—',
    aquisitivo: raw.periodo_aquisitivo || raw.aquisitivo || '—',
    data_inicio: raw.data_inicio || '',
    data_fim: raw.data_fim || '',
    tipo: raw.tipo || 'Regulamentar',
    pendente: raw.periodo_pendente || raw.pendente || '—',
    email: raw.link_solicitacao || raw.email || '',
    status,
    observacao: raw.observacao || '',
    ativo: raw.ativo !== false,
  };
}

async function ferCarregarDados() {
  const res = await sb.from('funcionario_ferias')
    .select('id, funcionario_id, data_inicio, data_fim, tipo, observacao, ativo, periodo_aquisitivo, periodo_pendente, link_solicitacao, status_ferias')
    .eq('ativo', true)
    .order('data_inicio', { ascending: false, nullsFirst: true });
  if (res.error && /column|periodo_aquisitivo|link_solicitacao|status_ferias/i.test(res.error.message || '')) {
    const fallback = await sb.from('funcionario_ferias')
      .select('id, funcionario_id, data_inicio, data_fim, tipo, observacao, ativo')
      .eq('ativo', true)
      .order('data_inicio', { ascending: false, nullsFirst: true });
    if (fallback.error) throw fallback.error;
    res.data = fallback.data;
  } else if (res.error) {
    throw res.error;
  }

  const ids = [...new Set((res.data || []).map((r) => r.funcionario_id).filter(Boolean))];
  let funcMap = {};
  let extraMap = {};
  let cargoMap = {};
  if (ids.length) {
    const { data: funcs } = await sb.from('v_funcionarios_atual')
      .select('funcionario_id, nome, matricula, lotacao_nome, funcao, vinculo')
      .in('funcionario_id', ids);
    funcMap = Object.fromEntries((funcs || []).map((x) => [x.funcionario_id, x]));
    const { data: extras } = await sb.from('funcionarios').select('id, matricula, foto_url, cargo').in('id', ids);
    extraMap = Object.fromEntries((extras || []).map((x) => [x.id, x]));

    // Cargo: preferência do cadastro RH; senão cargo_origem da folha (última competência)
    for (const [fid, ex] of Object.entries(extraMap)) {
      if (ex.cargo) cargoMap[fid] = ex.cargo;
    }
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data: rem } = await sb.from('funcionario_remuneracoes')
          .select('funcionario_id, cargo_origem, competencia')
          .in('funcionario_id', chunk)
          .order('competencia', { ascending: false });
        for (const r of rem || []) {
          if (cargoMap[r.funcionario_id]) continue;
          if (r.cargo_origem) cargoMap[r.funcionario_id] = r.cargo_origem;
        }
      }
    } catch (_) { /* tabela pode não existir */ }
  }

  _ferV2.rows = (res.data || []).map((r) => ferMapRow(r, funcMap, extraMap, cargoMap));
  return _ferV2.rows;
}

function ferFiltradas() {
  const busca = ferNorm($('fer-filtro-busca')?.value);
  const lot = $('fer-filtro-lotacao')?.value || '';
  const status = $('fer-filtro-status')?.value || '';
  const mes = $('fer-filtro-mes')?.value || '';
  const filtradas = _ferV2.rows.filter((r) => {
    if (!r.ativo) return false;
    const text = ferNorm([r.servidor, r.matricula, r.lotacao, r.cargo, r.funcao].join(' '));
    if (busca && !busca.split(/\s+/).every((p) => text.includes(p))) return false;
    if (lot && r.lotacao !== lot) return false;
    if (status && r.status !== status) return false;
    if (mes) {
      if (!r.data_inicio) return false;
      if (String(r.data_inicio).slice(5, 7) !== mes) return false;
    }
    return true;
  });
  return ferOrdenar(filtradas);
}

function ferSortValor(r, col) {
  if (col === 'servidor') return ferNorm(r.servidor);
  if (col === 'lotacao') return ferNorm(r.lotacao);
  if (col === 'cargo') return ferNorm(r.cargo === '—' ? '' : r.cargo);
  if (col === 'funcao') return ferNorm(r.funcao === '—' ? '' : r.funcao);
  if (col === 'aquisitivo') return ferNorm(r.aquisitivo === '—' ? '' : r.aquisitivo);
  if (col === 'gozo') return r.data_inicio || '';
  if (col === 'pendente') return ferNorm(r.pendente === '—' ? '' : r.pendente);
  if (col === 'documento') return ferNorm(r.email || '');
  if (col === 'status') return ferNorm(r.status);
  return '';
}

function ferOrdenar(rows) {
  const { col, dir } = _ferV2.sort;
  const mul = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = ferSortValor(a, col);
    const vb = ferSortValor(b, col);
    const emptyA = !va;
    const emptyB = !vb;
    if (emptyA && emptyB) return ferNorm(a.servidor).localeCompare(ferNorm(b.servidor), 'pt-BR');
    if (emptyA) return 1;
    if (emptyB) return -1;
    const cmp = String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return cmp * mul;
    return ferNorm(a.servidor).localeCompare(ferNorm(b.servidor), 'pt-BR');
  });
}

window.ferSortBy = function ferSortBy(col) {
  if (_ferV2.sort.col === col) {
    _ferV2.sort.dir = _ferV2.sort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    _ferV2.sort.col = col;
    _ferV2.sort.dir = 'asc';
  }
  _ferV2.page = 1;
  ferRender();
};

function ferAtualizarIconesSort() {
  $$('#view-ferias .fer-sortable').forEach((th) => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    if (th.dataset.ferSort === _ferV2.sort.col) {
      icon.className = `ti ${_ferV2.sort.dir === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending'} sort-icon active`;
    } else {
      icon.className = 'ti ti-arrows-sort sort-icon';
    }
  });
}

function ferAtualizarKpis(rows) {
  const emGozo = rows.filter((r) => r.status === 'Em Gozo').length;
  const programados = rows.filter((r) => r.status === 'Programado').length;
  const pendentes = rows.filter((r) => r.status === 'Pendente' || (r.pendente && r.pendente !== '—')).length;
  const risco = rows.filter((r) => ferNorm(r.pendente).includes('acumulado') || ferNorm(r.observacao).includes('risco')).length;
  if ($('kpiEmGozo')) $('kpiEmGozo').textContent = emGozo;
  if ($('kpiProgramados')) $('kpiProgramados').textContent = programados;
  if ($('kpiPendentes')) $('kpiPendentes').textContent = pendentes;
  if ($('kpiRisco')) $('kpiRisco').textContent = risco;
}

function ferPopularLotacaoSelect(rows) {
  const sel = $('fer-filtro-lotacao');
  if (!sel) return;
  const lots = [...new Set(rows.map((r) => r.lotacao).filter((l) => l && l !== '—'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const cur = sel.value;
  const nextHtml = '<option value="">Todas as Unidades</option>' +
    lots.map((l) => `<option value="${htmlEscape(l)}">${htmlEscape(l)}</option>`).join('');
  // Evita rebuild a cada página — recriar <select> dispara "change" e volta pra página 1
  if (sel.dataset.ferLotsKey === lots.join('\0') && sel.options.length) {
    if (cur && lots.includes(cur)) sel.value = cur;
    return;
  }
  sel.dataset.ferLotsKey = lots.join('\0');
  _ferV2.suppressFilter = true;
  sel.innerHTML = nextHtml;
  if (cur && lots.includes(cur)) sel.value = cur;
  _ferV2.suppressFilter = false;
}

window.ferSwitchView = function ferSwitchView(view) {
  _ferV2.view = view;
  _ferV2.page = 1;
  $$('#view-ferias .fer-v2-view-tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  $$('#view-ferias .fer-v2-pane').forEach((p) => p.classList.remove('active'));
  $(`fer-pane-${view}`)?.classList.add('active');
  ferRender();
};

window.ferIrParaPagina = function ferIrParaPagina(p) {
  const page = Number(p);
  if (!Number.isFinite(page) || page < 1) return;
  _ferV2.page = page;
  ferRender();
  $('fer-page-controls')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};

function ferRenderTabela(data) {
  const total = data.length;
  const pages = Math.max(1, Math.ceil(total / _ferV2.pageSize) || 1);
  if (_ferV2.page > pages) _ferV2.page = pages;
  if (_ferV2.page < 1) _ferV2.page = 1;
  const start = (_ferV2.page - 1) * _ferV2.pageSize;
  const slice = data.slice(start, start + _ferV2.pageSize);
  const tb = $('fer-table-body');
  if (!tb) return;
  if (!slice.length) {
    tb.innerHTML = '<tr><td colspan="10" class="empty-state">Nenhum registro encontrado</td></tr>';
  } else {
    tb.innerHTML = slice.map((r) => {
      const gozo = ferGozoTexto(r);
      const pend = r.pendente && r.pendente !== '—'
        ? `<span style="color:var(--gov-orange);font-weight:600">${htmlEscape(r.pendente)}</span>`
        : '<span class="fer-vazio">Nenhuma</span>';
      return `<tr>
        <td>${ferServidorCell(r)}</td>
        <td><span class="fer-lot-badge">${htmlEscape(r.lotacao)}</span></td>
        <td>${htmlEscape(r.cargo || '—')}</td>
        <td>${htmlEscape(r.funcao || '—')}</td>
        <td>${htmlEscape(r.aquisitivo)}</td>
        <td>${gozo ? `<span class="fer-periodo">${htmlEscape(gozo)}</span>` : '<span class="fer-vazio">Não agendado</span>'}</td>
        <td>${pend}</td>
        <td>${ferLinkHtml(r.email)}</td>
        <td>${ferStatusHtml(r.status)}</td>
        <td style="text-align:center">${ferAcoesHtml(r)}</td>
      </tr>`;
    }).join('');
  }
  const info = $('fer-page-info');
  const ctrl = $('fer-page-controls');
  if (info) {
    info.textContent = total === 0 ? 'Nenhum registro' : `Exibindo ${start + 1}–${Math.min(start + _ferV2.pageSize, total)} de ${total}`;
  }
  if (ctrl) {
    const btn = (label, p, dis, active = false) =>
      `<button type="button" class="page-btn ${active ? 'active' : ''}" ${dis ? 'disabled' : ''} data-page="${p}" onclick="ferIrParaPagina(${p})">${label}</button>`;
    let html = btn('«', _ferV2.page - 1, _ferV2.page <= 1);
    const s = Math.max(1, _ferV2.page - 2);
    const e = Math.min(pages, s + 4);
    for (let i = s; i <= e; i++) html += btn(String(i), i, false, i === _ferV2.page);
    html += btn('»', _ferV2.page + 1, _ferV2.page >= pages);
    ctrl.innerHTML = html;
  }
}

function ferDiasNoMes(ano, mesNum) {
  return new Date(ano, parseInt(mesNum, 10), 0).getDate();
}

function ferBarraMesHtml(r, ano, mesNum) {
  if (!r.data_inicio || !r.data_fim) return '';
  const mes = String(mesNum).padStart(2, '0');
  const diasMes = ferDiasNoMes(ano, mesNum);
  const mesIni = new Date(`${ano}-${mes}-01T00:00:00`);
  const mesFim = new Date(`${ano}-${mes}-${String(diasMes).padStart(2, '0')}T00:00:00`);
  const ini = new Date(String(r.data_inicio).slice(0, 10) + 'T00:00:00');
  const fim = new Date(String(r.data_fim).slice(0, 10) + 'T00:00:00');
  if (fim < mesIni || ini > mesFim) return '';
  const startDay = ini < mesIni ? 1 : ini.getDate();
  const endDay = fim > mesFim ? diasMes : fim.getDate();
  const left = ((startDay - 1) / diasMes) * 100;
  const width = ((endDay - startDay + 1) / diasMes) * 100;
  return `<div class="fer-month-bar ${ferStatusClass(r.status)}" style="left:${left}%;width:${width}%" title="${htmlEscape(r.servidor)}: ${fmtDtFer(r.data_inicio)} – ${fmtDtFer(r.data_fim)}"></div>`;
}

function ferRenderMensal(data) {
  const ano = _ferV2.ano;
  const meses = [
    ['01', 'Janeiro'], ['02', 'Fevereiro'], ['03', 'Março'], ['04', 'Abril'],
    ['05', 'Maio'], ['06', 'Junho'], ['07', 'Julho'], ['08', 'Agosto'],
    ['09', 'Setembro'], ['10', 'Outubro'], ['11', 'Novembro'], ['12', 'Dezembro'],
  ];
  const grid = $('fer-month-grid');
  if (!grid) return;
  grid.innerHTML = meses.map(([num, nome]) => {
    const noMes = data.filter((r) => {
      if (!r.data_inicio || !r.data_fim) return false;
      const ini = String(r.data_inicio).slice(0, 10);
      const fim = String(r.data_fim).slice(0, 10);
      const mesIni = `${ano}-${num}-01`;
      const dias = ferDiasNoMes(ano, num);
      const mesFim = `${ano}-${num}-${String(dias).padStart(2, '0')}`;
      return ini <= mesFim && fim >= mesIni;
    });
    const diasMes = ferDiasNoMes(ano, num);
    const dayMarks = [1, Math.ceil(diasMes / 2), diasMes];
    const bars = noMes.map((s) => ferBarraMesHtml(s, ano, num)).join('');
    return `<div class="fer-month-card">
      <div class="fer-month-head"><span>${nome} ${ano}</span><span>${noMes.length}</span></div>
      <div class="fer-month-timeline">
        <div class="fer-month-days">${dayMarks.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="fer-month-track">${bars || '<span class="fer-vazio" style="font-size:10px;padding-left:4px">Sem gozo no mês</span>'}</div>
      </div>
      <div class="fer-month-body">${noMes.length ? noMes.map((s) => `
        <div class="fer-month-item">
          ${ferFotoHtml(s.foto_url)}
          <div style="min-width:0;flex:1">
            <div class="fer-serv-nome">${htmlEscape(s.servidor)}</div>
            <div class="fer-serv-mat">${htmlEscape(s.lotacao)} · ${fmtDtFer(s.data_inicio)} a ${fmtDtFer(s.data_fim)}</div>
          </div>
          ${ferStatusHtml(s.status)}
        </div>`).join('') : '<span class="fer-vazio">Nenhum servidor no mês</span>'}
      </div>
    </div>`;
  }).join('');
}

function ferRenderUnidades(data) {
  const map = {};
  data.forEach((r) => { if (!map[r.lotacao]) map[r.lotacao] = []; map[r.lotacao].push(r); });
  const grid = $('fer-unit-grid');
  if (!grid) return;
  grid.innerHTML = Object.keys(map).sort((a, b) => a.localeCompare(b, 'pt-BR')).map((u) => `
    <div class="fer-unit-card">
      <div class="fer-unit-head"><span>${htmlEscape(u)}</span><span class="fer-v2-tab-badge">${map[u].length}</span></div>
      <div class="fer-unit-body">${map[u].map((m) => `
        <div class="fer-unit-row">
          <div class="fer-serv-cell">${ferFotoHtml(m.foto_url)}<div><strong>${htmlEscape(m.servidor)}</strong>
            <div class="fer-serv-mat">${m.data_inicio ? `${fmtDtFer(m.data_inicio)} a ${fmtDtFer(m.data_fim)}` : 'Sem data de gozo'}</div></div></div>
          ${ferStatusHtml(m.status)}
        </div>`).join('')}
      </div>
    </div>`).join('');
}

function ferRenderPendencias(data) {
  const pend = data.filter((r) => r.status === 'Pendente' || (r.pendente && r.pendente !== '—'));
  const tb = $('fer-pend-body');
  if (!tb) return;
  if (!pend.length) {
    tb.innerHTML = '<tr><td colspan="7" class="empty-state">Nenhuma pendência encontrada</td></tr>';
    return;
  }
  tb.innerHTML = pend.map((r) => `
    <tr>
      <td>${ferServidorCell(r)}</td>
      <td><span class="fer-lot-badge">${htmlEscape(r.lotacao)}</span></td>
      <td>${htmlEscape(r.cargo || '—')}</td>
      <td>${htmlEscape(r.funcao || '—')}</td>
      <td><strong style="color:var(--gov-orange)">${htmlEscape(r.pendente !== '—' ? r.pendente : r.aquisitivo)}</strong></td>
      <td>${ferLinkHtml(r.email)}</td>
      <td><button class="btn-primary" style="font-size:11px;padding:4px 10px" onclick="ferEditarRegistro(${r.id})"><i class="ti ti-calendar-plus"></i> Programar</button></td>
    </tr>`).join('');
}

function ferRender() {
  const filtradas = ferFiltradas();
  ferAtualizarKpis(_ferV2.rows);
  ferPopularLotacaoSelect(_ferV2.rows);
  if ($('badgeTotalTable')) $('badgeTotalTable').textContent = filtradas.length;
  if ($('badgePendencies')) {
    $('badgePendencies').textContent = filtradas.filter((r) => r.status === 'Pendente' || (r.pendente && r.pendente !== '—')).length;
  }
  const cnt = $('fer-count');
  if (cnt) cnt.innerHTML = `<strong>${filtradas.length}</strong> de ${_ferV2.rows.length} registro(s)`;
  ferAtualizarResumoFiltros();
  ferAtualizarIconesSort();
  const empty = $('fer-empty-state');
  if (empty) empty.hidden = filtradas.length > 0;
  if (_ferV2.view === 'tabela') ferRenderTabela(filtradas);
  else if (_ferV2.view === 'mensal') ferRenderMensal(filtradas);
  else if (_ferV2.view === 'unidade') ferRenderUnidades(filtradas);
  else ferRenderPendencias(filtradas);
}

async function renderFerias() {
  const tb = $('fer-table-body');
  if (tb) tb.innerHTML = '<tr><td colspan="10" class="empty-state"><span class="spinner"></span> Carregando…</td></tr>';
  try {
    await ferCarregarDados();
    const kpis = await handleErr(await sb.from('v_ferias_kpis').select('*').single(), 'KPIs férias');
    if (kpis) {
      if ($('kpiEmGozo')) $('kpiEmGozo').textContent = kpis.em_ferias_hoje || 0;
      if ($('kpiProgramados')) $('kpiProgramados').textContent = kpis.proximas_60_dias || 0;
      if ($('kpiPendentes')) $('kpiPendentes').textContent = kpis.pendentes || 0;
    }
    ferBindUiOnce();
    ferRender();
  } catch (e) {
    showToast('Erro ao carregar férias: ' + (e.message || e), 'error');
    if (tb) tb.innerHTML = '<tr><td colspan="10" class="empty-state">Erro ao carregar dados</td></tr>';
  }
}

function ferAtualizarResumoFiltros() {
  const parts = [];
  const busca = ($('fer-filtro-busca')?.value || '').trim();
  const lot = $('fer-filtro-lotacao')?.value || '';
  const status = $('fer-filtro-status')?.value || '';
  const mes = $('fer-filtro-mes')?.value || '';
  if (busca) parts.push(`"${busca}"`);
  if (lot) parts.push(lot);
  if (status) parts.push(status);
  if (mes) {
    const nomes = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    parts.push(nomes[parseInt(mes, 10)] || mes);
  }
  const el = $('fer-filtro-resumo');
  if (el) el.textContent = parts.length ? `· ${parts.join(' · ')}` : '';
}

function ferPopularAnoSelect() {
  const sel = $('fer-filtro-ano');
  if (!sel || sel.options.length) return;
  const cur = new Date().getFullYear();
  for (let y = cur + 1; y >= cur - 3; y--) {
    sel.innerHTML += `<option value="${y}">${y}</option>`;
  }
  sel.value = String(_ferV2.ano);
}

function ferInitFiltrosCollapsible() {
  const wrap = document.querySelector('#view-ferias .fer-v2-filters-wrap');
  const toggle = $('fer-filtro-toggle');
  if (!wrap || !toggle || toggle._ferBound) return;
  toggle._ferBound = true;
  const sync = () => {
    if (window.matchMedia('(max-width: 900px)').matches) wrap.classList.add('collapsed');
    else wrap.classList.remove('collapsed');
    toggle.setAttribute('aria-expanded', wrap.classList.contains('collapsed') ? 'false' : 'true');
  };
  sync();
  window.addEventListener('resize', sync);
  toggle.onclick = () => {
    wrap.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', wrap.classList.contains('collapsed') ? 'false' : 'true');
  };
}

function ferBindUiOnce() {
  if (_ferV2.bound) return;
  _ferV2.bound = true;
  ferPopularAnoSelect();
  ferInitFiltrosCollapsible();
  const rerender = () => {
    if (_ferV2.suppressFilter) return;
    _ferV2.page = 1;
    ferAtualizarResumoFiltros();
    ferRender();
  };
  $('fer-filtro-busca')?.addEventListener('input', debounce(rerender, 200));
  $('fer-filtro-lotacao')?.addEventListener('change', rerender);
  $('fer-filtro-status')?.addEventListener('change', rerender);
  $('fer-filtro-mes')?.addEventListener('change', rerender);
  $('fer-filtro-ano')?.addEventListener('change', () => {
    _ferV2.ano = Number($('fer-filtro-ano')?.value) || new Date().getFullYear();
    ferRender();
  });
  $('fer-filtro-limpar')?.addEventListener('click', () => {
    ['fer-filtro-busca', 'fer-filtro-lotacao', 'fer-filtro-status', 'fer-filtro-mes'].forEach((id) => { if ($(id)) $(id).value = ''; });
    _ferV2.page = 1;
    ferAtualizarResumoFiltros();
    ferRender();
  });
}

window.cancelarFerias = async (id) => {
  const motivo = prompt('Motivo do cancelamento (opcional):');
  if (motivo === null) return;
  const { data: atual } = await sb.from('funcionario_ferias').select('observacao').eq('id', id).single();
  const obs = ((atual?.observacao ? atual.observacao + '\n' : '') + '[CANCELADA]' + (motivo ? ' ' + motivo : '')).trim();
  const upd = { ativo: false, observacao: obs, status_ferias: 'Cancelado' };
  let { error } = await sb.from('funcionario_ferias').update(upd).eq('id', id);
  if (error && /column|status_ferias/i.test(error.message || '')) {
    ({ error } = await sb.from('funcionario_ferias').update({ ativo: false, observacao: obs }).eq('id', id));
  }
  if (error) return showToast('Erro: ' + error.message, 'error');
  await registrarLog('FÉRIAS CANCELADA', null, 'Servidor', { ferias_id: id, motivo });
  showToast('Férias canceladas', 'success');
  renderFerias();
};

function ferLimparModal() {
  ['fer-edit-id', 'fer-func-id', 'fer-search', 'fer-inicio', 'fer-fim', 'fer-dias', 'fer-obs',
    'fer-aquisitivo', 'fer-pendente', 'fer-email', 'fer-matricula', 'fer-lotacao-display'].forEach((id) => {
    if ($(id)) $(id).value = '';
  });
  if ($('fer-tipo')) $('fer-tipo').value = 'regular';
  if ($('fer-status')) $('fer-status').value = 'Pendente';
  if ($('fer-suggest')) $('fer-suggest').innerHTML = '';
  if ($('fer-modal-title')) $('fer-modal-title').innerHTML = '<i class="ti ti-beach"></i> Lançamento de Férias do Servidor';
}

window.abrirAgendarFerias = () => {
  ferLimparModal();
  openModal('modal-ferias');
  setTimeout(() => $('fer-search')?.focus(), 100);
};

window.abrirAgendarFeriasPara = async (funcId, nome) => {
  abrirAgendarFerias();
  $('fer-func-id').value = funcId;
  $('fer-search').value = nome || '';
  const { data } = await sb.from('v_funcionarios_atual').select('funcionario_id, nome, lotacao_nome, matricula').eq('funcionario_id', funcId).maybeSingle();
  if (data) {
    $('fer-lotacao-display').value = data.lotacao_nome || '';
    $('fer-matricula').value = data.matricula || '';
  }
};

window.ferEditarRegistro = function ferEditarRegistro(id) {
  const r = _ferV2.rows.find((x) => x.id === id);
  if (!r) return;
  ferLimparModal();
  if ($('fer-modal-title')) $('fer-modal-title').innerHTML = '<i class="ti ti-beach"></i> Editar Registro de Férias';
  $('fer-edit-id').value = r.id;
  $('fer-func-id').value = r.funcionario_id;
  $('fer-search').value = r.servidor;
  $('fer-matricula').value = r.matricula || '';
  $('fer-lotacao-display').value = r.lotacao || '';
  $('fer-aquisitivo').value = r.aquisitivo !== '—' ? r.aquisitivo : '';
  $('fer-inicio').value = r.data_inicio || '';
  $('fer-fim').value = r.data_fim || '';
  $('fer-pendente').value = r.pendente !== '—' ? r.pendente : '';
  $('fer-email').value = r.email || '';
  $('fer-status').value = r.status || 'Programado';
  $('fer-obs').value = r.observacao || '';
  $('fer-tipo').value = FERIAS_TIPOS_REV[r.tipo] || 'regular';
  if (r.data_inicio && r.data_fim) {
    const d = Math.floor((new Date(r.data_fim) - new Date(r.data_inicio)) / 86400000) + 1;
    $('fer-dias').value = d > 0 ? `${d} dia(s)` : '';
  }
  openModal('modal-ferias');
};

window.ferVerHistorico = async function ferVerHistorico(funcionarioId, nome) {
  const row = _ferV2.rows.find((x) => x.funcionario_id === funcionarioId);
  const displayNome = nome || row?.servidor || 'Servidor';
  const title = $('fer-hist-title');
  const body = $('fer-hist-content');
  if (title) title.innerHTML = `<i class="ti ti-history"></i> Histórico de Férias — ${htmlEscape(displayNome)}`;
  if (body) body.innerHTML = '<span class="spinner"></span> Carregando…';
  openModal('modal-ferias-historico');
  let res = await sb.from('funcionario_ferias')
    .select('id, data_inicio, data_fim, tipo, observacao, ativo, periodo_aquisitivo, periodo_pendente, link_solicitacao, status_ferias')
    .eq('funcionario_id', funcionarioId)
    .order('data_inicio', { ascending: false, nullsFirst: true });
  if (res.error && /column|periodo_aquisitivo|link_solicitacao|status_ferias/i.test(res.error.message || '')) {
    res = await sb.from('funcionario_ferias')
      .select('id, data_inicio, data_fim, tipo, observacao, ativo')
      .eq('funcionario_id', funcionarioId)
      .order('data_inicio', { ascending: false, nullsFirst: true });
  }
  if (res.error || !body) {
    if (body) body.innerHTML = '<div class="empty-state">Erro ao carregar histórico</div>';
    return;
  }
  const rows = res.data || [];
  if (!rows.length) {
    body.innerHTML = '<div class="empty-state">Nenhum registro de férias para este servidor</div>';
    return;
  }
  body.innerHTML = `<div class="table-container"><table class="gov-table fer-v2-table">
    <thead><tr>
      <th>Período Aquisitivo</th><th>Gozo</th><th>Pendente</th><th>Tipo</th><th>Situação</th><th>Documento</th><th>Observação</th>
    </tr></thead>
    <tbody>${rows.map((r) => {
      const st = r.ativo === false ? 'Cancelado' : (r.status_ferias || ferCalcStatus(r));
      const gozo = r.data_inicio && r.data_fim ? `${fmtDtFer(r.data_inicio)} a ${fmtDtFer(r.data_fim)}` : '—';
      return `<tr style="${r.ativo === false ? 'opacity:.65' : ''}">
        <td>${htmlEscape(r.periodo_aquisitivo || '—')}</td>
        <td>${htmlEscape(gozo)}</td>
        <td>${htmlEscape(r.periodo_pendente || '—')}</td>
        <td>${htmlEscape(r.tipo || '—')}</td>
        <td>${ferStatusHtml(st)}</td>
        <td>${ferLinkHtml(r.link_solicitacao || '')}</td>
        <td style="font-size:12px;color:var(--color-text-muted)">${htmlEscape(r.observacao || '—')}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
};

document.addEventListener('input', debounce(async (e) => {
  if (e.target.id !== 'fer-search') return;
  const q = e.target.value.trim();
  if (q.length < 2) { if ($('fer-suggest')) $('fer-suggest').innerHTML = ''; return; }
  const termoRPC = q.split(/\s+/).join('%');
  const data = await handleErr(await sb.rpc('fn_buscar_funcionarios', {
    p_termo: termoRPC, p_vinculo_id: null, p_lotacao_id: null, p_funcao: null, p_turno_id: null,
    p_limite: 8, p_offset: 0, p_order_by: 'nome', p_order_dir: 'asc'
  }), 'autocomp ferias');
  if (!data?.length) {
    $('fer-suggest').innerHTML = '<div style="padding:8px;font-size:12px;color:var(--color-text-muted)">Nenhum resultado</div>';
    return;
  }
  $('fer-suggest').innerHTML = `<div style="position:absolute;background:#fff;border:1px solid var(--gov-border);border-radius:4px;max-height:200px;overflow-y:auto;z-index:10;width:100%;box-shadow:var(--shadow-md)">
    ${data.map((d) => `<div class="lotacao-tree-item" data-id="${d.funcionario_id}" data-nome="${htmlEscape(d.nome)}" data-lot="${htmlEscape(d.lotacao_nome || '')}" data-mat="${htmlEscape(d.matricula || '')}" style="padding:8px 10px;cursor:pointer">
      <strong>${htmlEscape(d.nome)}</strong> · <small>${htmlEscape(d.lotacao_nome || '')}</small>
    </div>`).join('')}
  </div>`;
  $$('#fer-suggest .lotacao-tree-item').forEach((el) => {
    el.onclick = async () => {
      const fid = Number(el.dataset.id);
      $('fer-func-id').value = fid;
      $('fer-search').value = el.dataset.nome;
      $('fer-lotacao-display').value = el.dataset.lot || '';
      $('fer-suggest').innerHTML = '';
      let mat = el.dataset.mat || '';
      if (!mat && fid) {
        const { data: row } = await sb.from('funcionarios').select('matricula').eq('id', fid).maybeSingle();
        mat = row?.matricula || '';
      }
      $('fer-matricula').value = mat;
    };
  });
}, 250));

document.addEventListener('change', (e) => {
  if (e.target.id === 'fer-inicio' || e.target.id === 'fer-fim') {
    const ini = $('fer-inicio')?.value;
    const fim = $('fer-fim')?.value;
    if (ini && fim) {
      const d = Math.floor((new Date(fim) - new Date(ini)) / 86400000) + 1;
      if ($('fer-dias')) $('fer-dias').value = d > 0 ? `${d} dia(s)` : 'Data inválida';
    }
  }
});

async function salvarFerias() {
  const funcId = Number($('fer-func-id')?.value);
  if (!funcId) return showToast('Selecione um servidor', 'warning');
  const inicio = ($('fer-inicio')?.value || '').trim();
  const fim = ($('fer-fim')?.value || '').trim();
  const aquisitivo = ($('fer-aquisitivo')?.value || '').trim();
  const pendente = ($('fer-pendente')?.value || '').trim();
  if (!!inicio !== !!fim) return showToast('Informe início e término do gozo, ou deixe ambos em branco', 'warning');
  if (inicio && fim && fim < inicio) return showToast('A data de término deve ser depois do início', 'warning');

  let status = $('fer-status')?.value || 'Programado';
  if (!inicio) status = 'Pendente';

  const btn = $('btn-salvar-ferias');
  if (btn) btn.disabled = true;
  const payload = {
    funcionario_id: funcId,
    data_inicio: inicio || null,
    data_fim: fim || null,
    tipo: FERIAS_TIPOS[$('fer-tipo')?.value] || 'Regulamentar',
    observacao: ($('fer-obs')?.value || '').trim() || null,
    periodo_aquisitivo: aquisitivo || null,
    periodo_pendente: pendente || null,
    link_solicitacao: ($('fer-email')?.value || '').trim() || null,
    status_ferias: status,
    ativo: true,
  };
  const editId = Number($('fer-edit-id')?.value);
  let error;
  if (editId) {
    ({ error } = await sb.from('funcionario_ferias').update(payload).eq('id', editId));
  } else {
    ({ error } = await sb.from('funcionario_ferias').insert([payload]));
  }
  if (error && /column|periodo_aquisitivo|link_solicitacao|status_ferias/i.test(error.message || '')) {
    const basico = {
      funcionario_id: funcId,
      data_inicio: inicio || null,
      data_fim: fim || null,
      tipo: payload.tipo,
      observacao: [payload.observacao, aquisitivo ? `Aquisitivo: ${aquisitivo}` : '', pendente ? `Pendente: ${pendente}` : '', payload.link_solicitacao ? `Link: ${payload.link_solicitacao}` : ''].filter(Boolean).join(' · ') || null,
      ativo: true,
    };
    if (editId) ({ error } = await sb.from('funcionario_ferias').update(basico).eq('id', editId));
    else ({ error } = await sb.from('funcionario_ferias').insert([basico]));
  }
  if (btn) btn.disabled = false;
  if (error) return showToast('Erro: ' + error.message, 'error');
  await registrarLog(editId ? 'FÉRIAS EDITADA' : 'FÉRIAS AGENDADA', funcId, $('fer-search')?.value || 'Servidor(a)', { inicio, fim, aquisitivo, pendente });
  showToast(editId ? 'Registro atualizado' : (inicio ? 'Férias registradas' : 'Pendência registrada'), 'success');
  closeModal('modal-ferias');
  renderFerias();
}

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

  // Buscar TODOS (paginado) — select sem range corta em ~1000 no Supabase
  const { data, error } = await fetchTudo('v_funcionarios_atual', '*', 'nome');
  if (error) {
    handleErr({ data: null, error }, 'auditoria');
    return;
  }
  if (!data?.length) return;

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
  // Aceita 'YYYY-MM-DD' ou ISO completo; ignora datas inválidas / ano sentinela (0001)
  const raw = String(dataStr).trim();
  const ymd = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const ano = Number(ymd.slice(0, 4));
  if (ano < 1900 || ano > 2100) return null;
  const fim = new Date(ymd + 'T12:00:00');
  if (Number.isNaN(fim.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  return Math.round((fim - hoje) / 86400000);
}

function fmtDataLicenca(dataStr) {
  if (!dataStr) return 'Indeterminado';
  const ymd = String(dataStr).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return 'Indeterminado';
  const ano = Number(ymd.slice(0, 4));
  if (ano < 1900 || ano > 2100) return 'Indeterminado';
  return ymd.split('-').reverse().join('/');
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

/** Carrega licenças ativas pela tabela (fonte da verdade).
 *  A view v_licencas_atuais antiga filtrava por lotação e escondia a maioria. */
async function carregarLicencasAtivasRaw() {
  const todos = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('funcionario_licencas')
      .select('id, funcionario_id, tipo_afastamento, data_inicial, data_final, portaria, num_sei, observacao, ativo, created_at')
      .eq('ativo', true)
      .order('id')
      .range(de, de + 999);
    if (error) throw error;
    todos.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  if (!todos.length) return [];

  const ids = [...new Set(todos.map((l) => l.funcionario_id).filter(Boolean))];
  const nomeMap = {};
  try {
    const funcs = await fetchInChunks('funcionarios', 'id, nome, matricula', 'id', ids);
    for (const f of funcs || []) nomeMap[f.id] = f;
  } catch (e) {
    console.warn('[licenças] nomes:', e.message || e);
  }

  return todos.map((l) => {
    const f = nomeMap[l.funcionario_id] || {};
    return {
      licenca_id: l.id,
      funcionario_id: l.funcionario_id,
      nome: f.nome || `Funcionário #${l.funcionario_id}`,
      matricula: f.matricula || null,
      tipo_afastamento: l.tipo_afastamento,
      data_inicial: l.data_inicial,
      data_final: l.data_final,
      portaria: l.portaria,
      num_sei: l.num_sei,
      observacao: l.observacao,
      ativo: l.ativo,
      created_at: l.created_at
    };
  });
}

async function atualizarAlertasLicenca() {
  try {
    const todas = await carregarLicencasAtivasRaw();
    const data = (todas || []).filter((l) => l.data_final);
    const info = classificarLicencasVencimento(data);
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

    const htmlPage = montarHtmlAlertaLicenca(info, { compacto: true });
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
  window._licPage = 1;
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
  window._licPage = 1;
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

/** Uma linha por servidor: se há várias licenças ativas, fica a mais relevante. */
function dedupeLicencasPorServidor(lista) {
  const score = (x) => {
    const d = diasAteData(x.data_final);
    // Vigente (sem fim ou ainda não venceu) > indeterminado inválido > vencida
    const vigente = d == null ? 1 : (d >= 0 ? 2 : 0);
    const fim = x.data_final ? String(x.data_final).slice(0, 10) : '';
    const ini = x.data_inicial ? String(x.data_inicial).slice(0, 10) : '';
    return { vigente, fim, ini, id: Number(x.licenca_id) || 0 };
  };
  const melhorQue = (a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa.vigente !== sb.vigente) return sa.vigente > sb.vigente;
    if (sa.fim !== sb.fim) return sa.fim > sb.fim;
    if (sa.ini !== sb.ini) return sa.ini > sb.ini;
    return sa.id > sb.id;
  };

  const byFunc = new Map();
  for (const l of lista || []) {
    const fid = Number(l.funcionario_id);
    if (!fid) continue;
    const prev = byFunc.get(fid);
    if (!prev) {
      byFunc.set(fid, { ...l, _outras_licencas: 0 });
      continue;
    }
    if (melhorQue(l, prev)) {
      byFunc.set(fid, { ...l, _outras_licencas: (prev._outras_licencas || 0) + 1 });
    } else {
      prev._outras_licencas = (prev._outras_licencas || 0) + 1;
    }
  }
  return [...byFunc.values()];
}

async function carregarTabelaLicencas() {
  let data;
  try {
    data = await carregarLicencasAtivasRaw();
  } catch (e) {
    // Fallback: view (pode estar desatualizada / filtrar por lotação)
    console.warn('[licenças] fallback view:', e.message || e);
    const r = await fetchTudo('v_licencas_atuais', '*', 'nome', { idCol: 'licenca_id' });
    if (r.error) {
      showToast('Erro ao carregar licenças: ' + (r.error.message || e.message), 'error');
      return;
    }
    data = r.data || [];
  }
  if (!data) return;

  // Complementa com lotação atual (para RH definir lotação original quando ainda estiver em Licenças)
  const ids = [...new Set(data.map(l => l.funcionario_id).filter(Boolean))];
  let lotMap = {};
  if (ids.length) {
    try {
      const atuais = await fetchInChunks(
        'v_funcionarios_atual',
        'funcionario_id, lotacao_atual_id, lotacao_id, lotacao_nome, caminho_lotacao',
        'funcionario_id',
        ids
      );
      lotMap = Object.fromEntries((atuais || []).map(a => [a.funcionario_id, a]));
    } catch (e) {
      console.warn('[licenças] lotação atual:', e.message || e);
    }
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

  // 79 registros ≠ 79 pessoas: várias licenças ativas do mesmo servidor poluíam a lista
  const porServidor = dedupeLicencasPorServidor(enriquecida);
  window._licencasCache = porServidor;
  window._licencasTotalRegistros = enriquecida.length;
  window._licPage = 1;
  // Popula o filtro de tipo com os tipos realmente presentes (filtragem inteligente)
  const tipos = [...new Set(porServidor.map(l => (l.tipo_afastamento || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const sel = $('lic-tipo-filtro');
  if (sel) {
    const atual = sel.value;
    sel.innerHTML = '<option value="">Todos os tipos</option>' +
      tipos.map(t => `<option value="${htmlEscape(t)}">${htmlEscape(t)}</option>`).join('');
    if (tipos.includes(atual)) sel.value = atual;
  }
  renderTabelaLicencas(porServidor);
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
    // Pendentes de lotação primeiro; depois vigentes; vencidas por último
    data.sort((a, b) => {
      const da = diasAteData(a.data_final);
      const db = diasAteData(b.data_final);
      const pendA = a.precisa_definir_lotacao ? 1 : 0;
      const pendB = b.precisa_definir_lotacao ? 1 : 0;
      if (pendB !== pendA) return pendB - pendA;
      const vigA = da == null ? 1 : (da >= 0 ? 2 : 0);
      const vigB = db == null ? 1 : (db >= 0 ? 2 : 0);
      if (vigB !== vigA) return vigB - vigA;
      if (da != null && db != null && da !== db) return da - db;
      return (a.nome || '').localeCompare(b.nome || '');
    });

    const OPTS_PAGE_SIZE_LIC = [10, 25, 50, 100];
    let pageSize = Number(window._licPageSize);
    if (!OPTS_PAGE_SIZE_LIC.includes(pageSize)) pageSize = 25;
    window._licPageSize = pageSize;
    const totalPages = Math.max(1, Math.ceil(data.length / pageSize) || 1);
    let page = Math.max(1, Number(window._licPage || 1));
    if (page > totalPages) page = totalPages;
    window._licPage = page;
    const start = (page - 1) * pageSize;
    const pagina = data.slice(start, start + pageSize);

    const pendentes = lista.filter(l => l.precisa_definir_lotacao).length;
    const totalRegs = window._licencasTotalRegistros || lista.length;
    const de = data.length === 0 ? 0 : start + 1;
    const ate = Math.min(start + pageSize, data.length);
    const cnt = $('lic-count');
    if (cnt) {
      let extra = '';
      if (vencFiltro) {
        extra += ` · <span style="color:var(--gov-orange);font-weight:700">filtro: ${vencFiltro === 'vencidas' ? 'vencidas' : 'próximas do vencimento'}</span>`;
      }
      if (pendentes) extra += ` · <span style="color:var(--gov-orange);font-weight:700">${pendentes} pendente(s) de lotação</span>`;
      const regsNota = totalRegs > lista.length
        ? ` · <span title="Há mais de uma licença ativa para alguns servidores">${totalRegs} registros no banco</span>`
        : '';
      cnt.innerHTML = `<strong>${data.length}</strong> servidor(es)` +
        (data.length ? ` · <strong>${de}–${ate}</strong> nesta página` : '') +
        regsNota + extra;
    }

    const optsPageSize = OPTS_PAGE_SIZE_LIC.map(n =>
      `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('');
    const htmlPag = data.length <= 10 ? '' : `
      <div class="lic-pag-size">
        <label for="lic-page-size">Por página</label>
        <select id="lic-page-size" onchange="licMudarPageSize(this.value)">${optsPageSize}</select>
      </div>
      <div class="lic-pag-nav">
        <button type="button" class="btn-secondary lic-pag-btn" ${page <= 1 ? 'disabled' : ''} onclick="licIrPagina(${page - 1})" title="Página anterior">
          <i class="ti ti-chevron-left"></i><span class="lic-pag-lbl"> Anterior</span>
        </button>
        <span class="lic-pag-info">
          <strong>${de}–${ate}</strong> de <strong>${data.length}</strong>
          <span class="lic-pag-page">Página ${page} de ${totalPages}</span>
        </span>
        <button type="button" class="btn-primary lic-pag-btn" ${page >= totalPages ? 'disabled' : ''} onclick="licIrPagina(${page + 1})" title="Próxima página">
          <span class="lic-pag-lbl">Próxima </span><i class="ti ti-chevron-right"></i>
        </button>
      </div>`;

    const pagEl = $('lic-paginacao');
    if (pagEl) {
      if (!htmlPag) {
        pagEl.innerHTML = '';
        pagEl.style.display = 'none';
      } else {
        pagEl.style.display = 'flex';
        pagEl.innerHTML = htmlPag;
      }
    }

    if (data.length === 0) {
      const tb = $('tbody-licencas');
      if (tb) {
        tb.replaceChildren();
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.innerHTML = `<div class="empty-state">${lista.length === 0 ? 'Nenhum afastamento encontrado' : 'Nenhum afastamento corresponde aos filtros'}</div>`;
        tr.appendChild(td);
        tb.appendChild(tr);
      }
      return;
    }

    const tbody = $('tbody-licencas');
    if (!tbody) return;
    const frag = document.createDocumentFragment();

    for (const l of pagina) {
      const dias = diasAteData(l.data_final);
      const tr = document.createElement('tr');
      if (l.precisa_definir_lotacao) tr.style.background = '#fff8f0';
      else if (dias != null && dias < 0) tr.style.background = '#fff5f5';
      else if (dias != null && dias <= LIC_URGENTE_DIAS) tr.style.background = '#fff5f5';
      else if (dias != null && dias <= LIC_AVISO_DIAS) tr.style.background = '#fffaf3';

      // Servidor
      const tdNome = document.createElement('td');
      const divN = document.createElement('div');
      divN.style.cssText = 'font-weight:600;color:var(--gov-blue-dark)';
      divN.textContent = l.nome || '—';
      const divM = document.createElement('div');
      divM.style.cssText = 'font-size:12px;color:var(--color-text-sec)';
      divM.textContent = `Mat: ${l.matricula || 'S/M'}`;
      if (l._outras_licencas) {
        const extra = document.createElement('span');
        extra.style.cssText = 'color:var(--gov-orange)';
        extra.title = 'Outras licenças ativas no banco';
        extra.textContent = ` · +${l._outras_licencas} licença(s)`;
        divM.appendChild(extra);
      }
      tdNome.append(divN, divM);
      tr.appendChild(tdNome);

      // Tipo
      const tdTipo = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.style.cssText = 'background:#fff9e6;color:var(--gov-orange)';
      badge.innerHTML = '<i class="ti ti-activity"></i> ';
      badge.appendChild(document.createTextNode(l.tipo_afastamento || '—'));
      tdTipo.appendChild(badge);
      tr.appendChild(tdTipo);

      // Lotação
      const tdLot = document.createElement('td');
      if (l.precisa_definir_lotacao) {
        const p1 = document.createElement('div');
        p1.style.cssText = 'font-size:12px;color:var(--gov-orange);font-weight:700';
        p1.innerHTML = '<i class="ti ti-alert-circle"></i> Pendente de lotação';
        const p2 = document.createElement('div');
        p2.style.cssText = 'font-size:11px;color:var(--color-text-muted)';
        p2.textContent = l.lotacao_nome || 'Sem lotação original';
        tdLot.append(p1, p2);
      } else {
        const p = document.createElement('div');
        p.style.fontSize = '12px';
        p.textContent = l.lotacao_nome || '—';
        tdLot.appendChild(p);
      }
      tr.appendChild(tdLot);

      // Período
      const tdPer = document.createElement('td');
      const d1 = document.createElement('div');
      d1.style.fontSize = '12px';
      d1.textContent = fmtDataLicenca(l.data_inicial);
      const d2 = document.createElement('div');
      d2.style.fontSize = '12px';
      d2.textContent = fmtDataLicenca(l.data_final);
      tdPer.append(d1, d2);
      if (dias != null) {
        const v = document.createElement('div');
        v.style.cssText = 'font-size:11px;font-weight:700';
        if (dias < 0) {
          v.style.color = 'var(--gov-red)';
          v.innerHTML = `<i class="ti ti-alert-triangle"></i> Vencida há ${Math.abs(dias)} dia(s)`;
        } else if (dias <= LIC_URGENTE_DIAS) {
          v.style.color = 'var(--gov-red)';
          v.innerHTML = `<i class="ti ti-clock"></i> ${dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia(s)`}`;
        } else if (dias <= LIC_AVISO_DIAS) {
          v.style.cssText = 'font-size:11px;font-weight:600;color:var(--gov-orange)';
          v.innerHTML = `<i class="ti ti-clock"></i> Vence em ${dias} dia(s)`;
        }
        if (v.innerHTML) tdPer.appendChild(v);
      }
      tr.appendChild(tdPer);

      // Portaria / SEI
      const tdDoc = document.createElement('td');
      const po = document.createElement('div');
      po.style.fontSize = '12px';
      po.textContent = `Portaria: ${l.portaria || '-'}`;
      const se = document.createElement('div');
      se.style.fontSize = '12px';
      se.textContent = `SEI: ${l.num_sei || '-'}`;
      tdDoc.append(po, se);
      tr.appendChild(tdDoc);

      // Ações
      const tdAc = document.createElement('td');
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center';
      const st = document.createElement('span');
      st.style.cssText = 'color:var(--gov-orange);font-weight:600;font-size:12px;margin-right:4px';
      st.innerHTML = '<i class="ti ti-clock"></i> Afastado';
      wrap.appendChild(st);

      const fid = Number(l.funcionario_id) || 0;
      const lid = l.licenca_id != null && l.licenca_id !== '' ? Number(l.licenca_id) : null;

      if (l.precisa_definir_lotacao) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-primary';
        b.style.cssText = 'padding:5px 8px;font-size:12px';
        b.title = 'Definir lotação original';
        b.innerHTML = '<i class="ti ti-building"></i> Lotação';
        b.addEventListener('click', () => definirLotacaoLicenca(fid));
        wrap.appendChild(b);
      } else {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-secondary';
        b.style.cssText = 'padding:5px 8px;font-size:12px';
        b.title = 'Enviar para Sem Lotação';
        b.innerHTML = '<i class="ti ti-map-off"></i> Sem Lotação';
        b.addEventListener('click', () => enviarLicencaParaSemLotacao(fid, lid));
        wrap.appendChild(b);
      }
      if (lid != null && !Number.isNaN(lid)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-icon';
        b.title = 'Editar';
        b.innerHTML = '<i class="ti ti-edit"></i>';
        b.addEventListener('click', () => abrirEditarTipoLicenca(lid));
        wrap.appendChild(b);
      }
      {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-icon';
        b.title = 'Retornar à Ativa';
        b.innerHTML = '<i class="ti ti-arrow-back-up"></i>';
        b.addEventListener('click', () => retornarAtiva(lid, fid));
        wrap.appendChild(b);
      }
      {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-icon';
        b.title = 'Histórico';
        b.innerHTML = '<i class="ti ti-history"></i>';
        b.addEventListener('click', () => verHistorico(fid));
        wrap.appendChild(b);
      }
      tdAc.appendChild(wrap);
      tr.appendChild(tdAc);

      frag.appendChild(tr);
    }

    tbody.replaceChildren(frag);

    // Diagnóstico: se o DOM tiver menos linhas que o esperado, avisa
    const noDom = tbody.querySelectorAll('tr').length;
    if (cnt && noDom !== pagina.length) {
      cnt.innerHTML += ` · <span style="color:var(--gov-red);font-weight:700">DOM ${noDom}/${pagina.length} linhas</span>`;
      console.error('[licenças] mismatch render', { esperado: pagina.length, noDom, amostra: pagina.map(x => x.nome) });
    } else if (cnt) {
      cnt.innerHTML += ` · <span style="color:var(--color-text-muted)">${noDom} linhas na tela</span>`;
    }
}

window.licIrPagina = function licIrPagina(p) {
  window._licPage = Math.max(1, Number(p) || 1);
  if (window._licencasCache) renderTabelaLicencas(window._licencasCache);
  const area = document.querySelector('.content-area');
  if (area) area.scrollTop = 0;
};

window.licMudarPageSize = function licMudarPageSize(v) {
  const n = Number(v);
  if (![10, 25, 50, 100].includes(n)) return;
  window._licPageSize = n;
  window._licPage = 1;
  if (window._licencasCache) renderTabelaLicencas(window._licencasCache);
};

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
  window._licPage = 1;
  if (window._licencasCache) renderTabelaLicencas(window._licencasCache);
}, 200));
$('lic-tipo-filtro')?.addEventListener('change', () => {
  // Select de tipo exato prevalece sobre o filtro do card
  window._licKpiFiltro = '';
  window._licVencFiltro = '';
  window._licPage = 1;
  atualizarDestaqueCardsLicenca();
  if (window._licencasCache) renderTabelaLicencas(window._licencasCache);
});
$('lic-periodo-filtro')?.addEventListener('change', () => {
  window._licPage = 1;
  if (window._licencasCache) renderTabelaLicencas(window._licencasCache);
});
$('lic-limpar')?.addEventListener('click', () => {
  if ($('lic-search')) $('lic-search').value = '';
  if ($('lic-tipo-filtro')) $('lic-tipo-filtro').value = '';
  if ($('lic-periodo-filtro')) $('lic-periodo-filtro').value = '';
  window._licKpiFiltro = '';
  window._licVencFiltro = '';
  window._licPage = 1;
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
    divFunc.innerHTML = `
      <label class="form-label">Servidor *</label>
      <div style="position:relative">
        <input type="text" id="lic-func-search" class="form-control" placeholder="Digite nome ou matrícula..." oninput="filtrarLicAutocomplete(this.value)" autocomplete="off">
        <div id="lic-func-sugestoes" style="display:none; position:absolute; top:100%; left:0; right:0; max-height:240px; overflow-y:auto; background:#fff; border:1px solid var(--gov-border); z-index:999; border-radius:4px; box-shadow:var(--shadow-md)"></div>
      </div>
    `;
  }
  openModal('modal-licenca');
};

window.filtrarLicAutocomplete = debounce(async (val) => {
  const box = $('lic-func-sugestoes');
  if (!box) return;
  $('lic-func-id').value = '';
  const q = String(val || '').trim();
  if (q.length < 2) { box.style.display = 'none'; return; }

  box.style.display = 'block';
  box.innerHTML = '<div style="padding:10px; color:var(--color-text-muted); font-size:12px">Buscando…</div>';
  const filtrados = await buscarServidoresAutocomplete(q, 25);

  // Se o usuário já digitou outra coisa, ignora resposta antiga
  if (String($('lic-func-search')?.value || '').trim() !== q) return;

  if (filtrados.length === 0) {
    box.innerHTML = '<div style="padding:10px; color:var(--color-text-muted); font-size:12px">Nenhum servidor encontrado</div>';
  } else {
    box.innerHTML = filtrados.map(f => {
      const id = f.funcionario_id;
      const label = `${htmlEscape(f.nome)} - Mat: ${htmlEscape(String(f.matricula || 'S/M'))}`;
      return `
      <div style="padding:10px; border-bottom:1px solid var(--gov-border); cursor:pointer; font-size:13px; line-height:1.4" 
           onmouseover="this.style.background='var(--gov-blue-light)'" 
           onmouseout="this.style.background='#fff'"
           onclick="selecionarLicAutocomplete(${id}, '${label.replace(/'/g, "\\'")}')">
        <div style="font-weight:600; color:var(--gov-blue-dark)">${htmlEscape(f.nome)}</div>
        <div style="font-size:11px; color:var(--color-text-muted)">Matrícula: ${htmlEscape(String(f.matricula || 'S/M'))}${f.lotacao_nome ? ' · ' + htmlEscape(f.lotacao_nome) : ''}</div>
      </div>`;
    }).join('');
  }
  box.style.display = 'block';
}, 250);

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
  const { data, error } = await fetchTudo('v_cedencias_atuais', '*', 'created_at', { asc: false, idCol: 'id' });
  if (error) {
    // View pode não ter `id` como desempate — tenta sem
    const r2 = await sb.from('v_cedencias_atuais').select('*').order('created_at', { ascending: false }).range(0, 9999);
    if (r2.error) {
      showToast('Erro ao carregar cedências: ' + r2.error.message, 'error');
      return;
    }
    window._cedidosCache = r2.data || [];
  } else {
    window._cedidosCache = data || [];
  }
  const lista = window._cedidosCache;
  // Popula o dropdown de órgãos com os valores realmente existentes (filtragem inteligente)
  const orgaos = [...new Set((lista || []).map(c => (c.orgao_destino_origem || '').trim()).filter(Boolean))]
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
  divFunc.innerHTML = `
    <label class="form-label">Servidor *</label>
    <div style="position:relative">
      <input type="text" id="cedido-func-search" class="form-control" placeholder="Digite nome ou matrícula..." oninput="filtrarCedAutocomplete(this.value)" autocomplete="off">
      <div id="cedido-func-sugestoes" style="display:none; position:absolute; top:100%; left:0; right:0; max-height:240px; overflow-y:auto; background:#fff; border:1px solid var(--gov-border); z-index:999; border-radius:4px; box-shadow:var(--shadow-md)"></div>
    </div>
  `;

  openModal('modal-cedido');
};

window.filtrarCedAutocomplete = debounce(async (val) => {
  const box = $('cedido-func-sugestoes');
  if (!box) return;
  $('cedido-func-id').value = '';
  const q = String(val || '').trim();
  if (q.length < 2) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = '<div style="padding:10px; color:var(--color-text-muted); font-size:12px">Buscando…</div>';
  const filtrados = await buscarServidoresAutocomplete(q, 25);
  if (String($('cedido-func-search')?.value || '').trim() !== q) return;
  if (filtrados.length === 0) {
    box.innerHTML = '<div style="padding:10px; color:var(--color-text-muted); font-size:12px">Nenhum servidor encontrado</div>';
  } else {
    box.innerHTML = filtrados.map(f => {
      const id = f.funcionario_id;
      const label = `${htmlEscape(f.nome)} - Mat: ${htmlEscape(String(f.matricula || 'S/M'))}`;
      return `
      <div style="padding:10px; border-bottom:1px solid var(--gov-border); cursor:pointer; font-size:13px; line-height:1.4" 
           onmouseover="this.style.background='var(--gov-blue-light)'" onmouseout="this.style.background='#fff'"
           onclick="selecionarCedAutocomplete(${id}, '${label.replace(/'/g, "\\'")}')">
        <div style="font-weight:600; color:var(--gov-blue-dark)">${htmlEscape(f.nome)}</div>
        <div style="font-size:11px; color:var(--color-text-muted)">Matrícula: ${htmlEscape(String(f.matricula || 'S/M'))}${f.lotacao_nome ? ' · ' + htmlEscape(f.lotacao_nome) : ''}</div>
      </div>`;
    }).join('');
  }
  box.style.display = 'block';
}, 250);

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

// ╔══════════════════════════════════════════════════════════════╗
// ║                     TERCEIRIZADOS (PORT/VIGI)                ║
// ╚══════════════════════════════════════════════════════════════╝
async function renderTerceirizados() {
  voltarCardsTerceirizados();
}

function voltarCardsTerceirizados() {
  $('terceirizados-cards-container').style.display = 'block';
  $('terceirizados-table-container').style.display = 'none';
  $('titulo-terceirizados').textContent = 'Terceirizados';
}

const TERCEIRIZADOS_QUADROS = {
  VIGILANTE: {
    empresa: 'SERVFAZ',
    cargo: 'VIGILANTE',
    titulo: 'Quadro de Vigilantes (SERVFAZ)',
    help: 'Lista de vigilantes terceirizados pela empresa SERVFAZ.',
  },
  PORTEIRO: {
    empresa: 'GLOBALTECH',
    cargo: 'PORTEIRO',
    titulo: 'Quadro de Porteiros (GLOBALTECH)',
    help: 'Lista de porteiros terceirizados pela empresa GLOBALTECH.',
  },
  SERVICOS_GERAIS: {
    empresa: 'GRUPO CLASI',
    cargo: 'SERVIÇOS GERAIS',
    titulo: 'Quadro de Serviços Gerais (GRUPO CLASI)',
    help: 'Lista de serviços gerais terceirizados pela empresa GRUPO CLASI.',
  },
  MOTORISTA_MEGA_ON: {
    empresa: 'MEGA ON',
    cargo: 'MOTORISTA',
    titulo: 'Quadro de Motoristas (MEGA ON)',
    help: 'Lista de motoristas terceirizados pela empresa MEGA ON — Diretoria Técnica de Transporte.',
  },
  MOTORISTA_PROCAD: {
    empresa: 'PROCAD',
    cargo: 'MOTORISTA',
    titulo: 'Quadro de Motoristas (PROCAD)',
    help: 'Lista de motoristas terceirizados pela empresa PROCAD — Diretoria Técnica de Transporte.',
  },
};

async function abrirQuadroTerceirizado(cargoBusca) {
  $('terceirizados-cards-container').style.display = 'none';
  $('terceirizados-table-container').style.display = 'block';

  const quadro = TERCEIRIZADOS_QUADROS[cargoBusca] || TERCEIRIZADOS_QUADROS.PORTEIRO;
  $('titulo-terceirizados').textContent = quadro.titulo;
  $('help-terceirizados').textContent = quadro.help;

  await carregarTerceirizados(cargoBusca);
}

async function carregarTerceirizados(cargoBusca) {
  const tBody = $('table-body-terceirizados');
  if (!tBody) return;
  tBody.innerHTML = '<tr><td colspan="9" class="empty-state"><span class="spinner"></span> Buscando terceirizados...</td></tr>';

  const quadro = TERCEIRIZADOS_QUADROS[cargoBusca];
  const empresaAlvo = quadro?.empresa;
  if (!empresaAlvo) {
    tBody.innerHTML = '<tr><td colspan="9" class="empty-state">Categoria de terceirizado inválida.</td></tr>';
    return;
  }

  // 1. Busca os funcionários dessas empresas
  const { data: funcs, error: errFuncs } = await sb
    .from('funcionarios')
    .select('id, nome, matricula, data_admissao, foto_url, empresa')
    .eq('empresa', empresaAlvo)
    .eq('ativo', true)
    .order('nome');

  if (errFuncs) {
    tBody.innerHTML = '<tr><td colspan="9" class="empty-state error-text">Erro ao buscar terceirizados.</td></tr>';
    console.error('Erro terceirizados:', errFuncs);
    return;
  }

  if (!funcs || funcs.length === 0) {
    tBody.innerHTML = `<tr><td colspan="9" class="empty-state">Nenhum servidor encontrado para ${empresaAlvo}.</td></tr>`;
    return;
  }

  const ids = funcs.map(f => f.id);

  // 2. Busca lotação/turno atual
  const { data: atuais } = await sb
    .from('v_funcionarios_atual')
    .select('funcionario_id, lotacao_nome, turno')
    .in('funcionario_id', ids);

  const mapAtuais = Object.fromEntries((atuais || []).map(x => [x.funcionario_id, x]));
  const fmtDt = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

  let html = '';
  funcs.forEach(f => {
    const cargo = quadro.cargo || 'Terceirizado';
    const atual = mapAtuais[f.id] || {};

    html += `
      <tr>
        <td style="font-family:monospace;font-size:12px;color:var(--color-text-sec)">${htmlEscape(f.matricula || '—')}</td>
        <td>${htmlFotoLista(f.foto_url)}</td>
        <td style="font-weight:500;color:var(--gov-blue-dark)">${htmlEscape(f.nome)}</td>
        <td><span class="badge badge-vinculo" style="background:var(--gov-gray-dark)">${htmlEscape(f.empresa)}</span></td>
        <td>${cargo}</td>
        <td>${htmlEscape(atual.lotacao_nome || '—')}</td>
        <td style="font-size:12px;color:var(--color-text-sec)">${fmtDt(f.data_admissao)}</td>
        <td>${htmlEscape(atual.turno || '—')}</td>
        <td style="text-align:center">
          <div class="table-actions" style="justify-content:center">
            <button class="btn-icon" title="Editar" onclick="abrirEdicao(${f.id})">Editar</button>
            <button class="btn-icon" title="Histórico" onclick="verHistorico(${f.id})">Histórico</button>
          </div>
        </td>
      </tr>
    `;
  });

  tBody.innerHTML = html;
}

// Exportar funções para o escopo global (acessíveis no HTML onClick)
window.abrirQuadroTerceirizado = abrirQuadroTerceirizado;
window.voltarCardsTerceirizados = voltarCardsTerceirizados;
