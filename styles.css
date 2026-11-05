/* =====================================================
   Elizabeth – Podologia e Pedicure
   Firebase (Firestore + Authentication), horários únicos e painel.
   ===================================================== */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import { initializeFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, writeBatch }
  from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';

/* ---------- Configurações ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyAH7FApR5PuDBH6g3Bo-iVAOdfLeWmbkeI",
  authDomain: "elizabeth-site.firebaseapp.com",
  projectId: "elizabeth-site",
  storageBucket: "elizabeth-site.firebasestorage.app",
  messagingSenderId: "650068318828",
  appId: "1:650068318828:web:3b09d1dc7a2f52a3e65649"
};
const WHATS_ESTUDIO = '5511900000000'; // WhatsApp do estúdio: 55 + DDD + número
const HORAS = ['09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00'];
const seedServ = [
  {nome:'Podologia clínica', desc:'Avaliação completa e cuidado de calos, durezas e unhas.', dur:'60 min', preco:150},
  {nome:'Pedicure completa', desc:'Cutilagem, esfoliação, hidratação e esmaltação.', dur:'50 min', preco:80},
  {nome:'Unha encravada', desc:'Tratamento da causa e orientação para evitar que volte.', dur:'45 min', preco:120},
  {nome:'Spa dos pés', desc:'Escalda-pés, esfoliação e massagem relaxante.', dur:'40 min', preco:90},
];

const app = initializeApp(firebaseConfig);
// Detecta sozinho aparelhos/redes que bloqueiam a conexão em tempo real
const db = initializeFirestore(app, {experimentalAutoDetectLongPolling: true}), auth = getAuth(app);

/* ---------- Utilitários ---------- */
const $ = s => document.querySelector(s);
const brl = n => Number(n).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
const dataBR = d => d.split('-').reverse().join('/');
const falha = e => alert('Não foi possível concluir (' + (e.code || e.message) + ').');
const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
};
// Valor da opção marcada (radio) de um grupo
const marcado = n => ($(`#form-agenda input[name="${n}"]:checked`) || {}).value || '';
// Opção clicável (serviço ou horário)
function opcao(name, value, titulo, detalhe, on, off) {
  const l = el('label', 'op'), i = document.createElement('input'), s = el('span');
  i.type = 'radio'; i.name = name; i.value = value; i.checked = !!on; i.disabled = !!off;
  s.append(el('strong', '', titulo));
  if (detalhe) s.append(el('small', '', detalhe));
  l.append(i, s);
  return l;
}

/* ---------- Estado ---------- */
const CACHE = 'eliz_servicos_cache';
let servicos = [], ags = [], ocupados = new Set(), usuario = null, authPronto = false, cancelaAgs = null;
let msgServ = 'Carregando serviços…';
let emAdmin = location.hash === '#painel';   // lembra o painel ao recarregar a página
// Mostra os últimos serviços salvos no aparelho enquanto a internet responde
try { const c = JSON.parse(localStorage.getItem(CACHE)); if (Array.isArray(c)) servicos = c; } catch (e) {}

/* ---------- Site público ---------- */
function renderSite() {
  const ul = $('#lista-servicos'), box = $('#f-servico'), atual = marcado('servico');
  ul.replaceChildren(); box.replaceChildren();
  if (!servicos.length) {
    ul.append(el('li', 'vazio', msgServ));
    box.append(el('p', 'dica', msgServ));
  }
  servicos.forEach(s => {
    const li = el('li'), txt = el('div'), meta = el('div', 'meta');
    txt.append(el('h3', '', s.nome), el('p', '', s.desc));
    meta.append(el('span', '', s.dur), el('strong', '', brl(s.preco)));
    li.append(txt, meta);
    ul.append(li);
    box.append(opcao('servico', s.id, s.nome, `${s.dur} · ${brl(s.preco)}`, s.id === atual));
  });
}

// Horários da data escolhida; os já reservados (ou que já passaram hoje) ficam desativados
function renderHoras() {
  const box = $('#f-hora'), data = $('#f-data').value, atual = marcado('hora');
  box.replaceChildren();
  $('#dica-hora').hidden = !!data;
  if (!data) return;
  const hoje = $('#f-data').min, agora = new Date().toTimeString().slice(0, 5);
  HORAS.forEach(h => {
    const off = ocupados.has(`${data}_${h}`) || (data === hoje && h <= agora);
    box.append(opcao('hora', h, h, '', h === atual && !off, off));
  });
}

/* Leitura e reserva pelo endereço REST do Firestore (fetch comum).
   Funciona em celulares/redes que bloqueiam a conexão em tempo real do SDK.
   Atualiza sozinho a cada 20 s (e ao voltar para a aba). */
const RAIZ = `projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${RAIZ}`, KEY = `key=${firebaseConfig.apiKey}`;
const str = v => ({stringValue: v});
async function pedir(url, corpo) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 12000);   // desiste em 12 s
  try {
    const r = await fetch(url, {signal: ac.signal, ...(corpo && {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(corpo)})});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error('http'), {status: r.status});
    return j;
  } finally { clearTimeout(t); }
}
const valor = f => 'stringValue' in f ? f.stringValue : 'integerValue' in f ? Number(f.integerValue) : 'doubleValue' in f ? f.doubleValue : '';
async function listar(col) {
  let docs = [], pg = '';
  do {
    const j = await pedir(`${API}/${col}?pageSize=300${pg}&${KEY}`);
    docs.push(...(j.documents || []));
    pg = j.nextPageToken ? '&pageToken=' + encodeURIComponent(j.nextPageToken) : '';
  } while (pg);
  return docs.map(d => { const o = {id: d.name.split('/').pop()}; for (const k in d.fields || {}) o[k] = valor(d.fields[k]); return o; });
}
let timer, assinatura = '';
async function carregarPublico() {
  clearTimeout(timer);
  let ok = true;
  try {
    const [sv, hs] = await Promise.all([listar('servicos'), listar('horarios')]);
    servicos = sv.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    ocupados = new Set(hs.map(d => d.id));
    msgServ = 'Novos serviços em breve.';
    try { localStorage.setItem(CACHE, JSON.stringify(servicos)); } catch (e) {}
  } catch (e) {
    ok = false;
    if (!servicos.length) msgServ = 'Não foi possível carregar os serviços. Tentando de novo…';
  }
  const nova = JSON.stringify([servicos, [...ocupados], msgServ]);
  if (nova !== assinatura) { assinatura = nova; renderSite(); renderHoras(); renderAdmin(); }   // só redesenha se mudou
  timer = setTimeout(carregarPublico, ok ? 20000 : 5000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) carregarPublico(); });

/* ---------- Cancelamento pelo cliente ----------
   Cada pedido tem um código longo e impossível de adivinhar (o próprio id).
   Só quem tem o link (?cancelar=codigo) consegue ver e cancelar aquele pedido. */
const idCancelar = new URLSearchParams(location.search).get('cancelar');
const linkCancelar = id => `${location.origin}${location.pathname}?cancelar=${id}`;
const novoId = () => {
  try { return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''); }
  catch (e) { return Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12); }
};
async function lerAg(id) {
  const j = await pedir(`${API}/agendamentos/${encodeURIComponent(id)}?${KEY}`), a = {};
  for (const k in j.fields || {}) a[k] = valor(j.fields[k]);
  return a;
}

// Página de cancelamento (aberta pelo link)
async function abrirCancelar(id) {
  document.body.classList.add('modo-cancelar');
  $('#cancelar').hidden = false;
  const info = $('#cancelar-info'), btn = $('#cancelar-btn'), msg = $('#cancelar-msg');
  try {
    const a = await lerAg(id);
    info.textContent = `${a.servicoNome} · ${dataBR(a.data)} às ${a.hora} · ${a.nome}`;
    if (a.status === 'cancelado') { msg.textContent = 'Este agendamento já foi cancelado.'; return; }
    btn.hidden = false;
    btn.onclick = async () => {
      if (!confirm('Cancelar este agendamento?')) return;
      btn.disabled = true; msg.textContent = '';
      const marca = {update: {name: `${RAIZ}/agendamentos/${id}`, fields: {status: str('cancelado')}},
                     updateMask: {fieldPaths: ['status']}, currentDocument: {exists: true}};
      let liberou = true;
      try {
        try { await pedir(`${API}:commit?${KEY}`, {writes: [marca, {delete: `${RAIZ}/horarios/${a.slot}`}]}); }
        catch (e) {   // pedidos antigos: só marca como cancelado (a Elizabeth libera o horário no painel)
          if (!e.status) throw e;
          liberou = false;
          await pedir(`${API}:commit?${KEY}`, {writes: [marca]});
        }
        btn.hidden = true;
        msg.textContent = liberou ? 'Agendamento cancelado. O horário foi liberado.' : 'Agendamento cancelado. A Elizabeth foi avisada.';
        try { if (localStorage.getItem('eliz_meu') === id) localStorage.removeItem('eliz_meu'); } catch (e) {}
      } catch (e) {
        btn.disabled = false;
        msg.textContent = 'Não foi possível cancelar agora. Tente de novo ou chame no WhatsApp.';
      }
    };
  } catch (e) {
    info.textContent = e.status === 404 || e.status === 403
      ? 'Não encontramos este agendamento. Confira o link ou chame no WhatsApp.'
      : 'Não foi possível carregar agora. Tente de novo em instantes.';
  }
}

// Quem volta ao site no mesmo aparelho vê o próprio agendamento, com atalho para cancelar
async function lembrarMeu() {
  let id; try { id = localStorage.getItem('eliz_meu'); } catch (e) {}
  if (!id) return;
  try {
    const a = await lerAg(id);
    if (a.status === 'cancelado' || a.data < $('#f-data').min) return;
    $('#meu-txt').textContent = `${a.servicoNome} · ${dataBR(a.data)} às ${a.hora}`;
    $('#meu-link').href = linkCancelar(id);
    $('#meu').hidden = false;
  } catch (e) {}
}

$('#f-data').min = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
$('#f-data').addEventListener('input', renderHoras);
$('#f-data').addEventListener('change', renderHoras);
$('#link-whats').href = 'https://wa.me/' + WHATS_ESTUDIO;

// Máscara (00) 00000-0000
$('#f-whats').addEventListener('input', e => {
  const d = e.target.value.replace(/\D/g, '').slice(0, 11);
  e.target.value = d.length > 6 ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
                 : d.length > 2 ? `(${d.slice(0,2)}) ${d.slice(2)}` : d;
});

$('#form-agenda').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, v = n => f.elements[n].value.trim(), btn = f.querySelector('button[type=submit]');
  const serv = servicos.find(s => s.id === marcado('servico')), hora = marcado('hora'), data = v('data');
  if (v('nome').length < 3 || v('whats').replace(/\D/g, '').length !== 11 || !serv || !data || data < $('#f-data').min || !hora) {
    $('#erro').textContent = 'Preencha tudo: nome, WhatsApp completo, serviço, data e horário.';
    return;
  }
  $('#erro').textContent = '';
  btn.disabled = true;
  const slot = `${data}_${hora}`, base = RAIZ + '/';
  const id = novoId();
  try {
    // Pedido + reserva do horário num único envio (tudo ou nada). O horário tem código único:
    // se outra pessoa reservou antes, o Firebase recusa (exists:false) e ninguém fica duplicado.
    await pedir(`${API}:commit?${KEY}`, {writes: [
      {update: {name: `${base}agendamentos/${id}`, fields: {
        nome: str(v('nome')), whats: str(v('whats')), servicoId: str(serv.id), servicoNome: str(serv.nome),
        data: str(data), hora: str(hora), slot: str(slot), status: str('pendente'),
        criado: {timestampValue: new Date().toISOString()}}}, currentDocument: {exists: false}},
      {update: {name: `${base}horarios/${slot}`, fields: {data: str(data), hora: str(hora), ag: str(id)}}, currentDocument: {exists: false}},
    ]});
    ocupados.add(slot);
    $('#ok-link').href = linkCancelar(id);
    try { localStorage.setItem('eliz_meu', id); } catch (e) {}
    f.reset(); renderHoras(); f.hidden = true; $('#ok').hidden = false;
  } catch (err) {
    $('#erro').textContent = err.status
      ? 'Não foi possível reservar este horário. Ele pode ter acabado de ser ocupado: escolha outro ou chame no WhatsApp.'
      : 'Não foi possível enviar agora. Verifique a internet e tente de novo, ou chame no WhatsApp.';
    carregarPublico();
  }
  btn.disabled = false;
});
$('#novo').addEventListener('click', () => { $('#ok').hidden = true; $('#form-agenda').hidden = false; });

/* ---------- Painel da empresa ---------- */
function renderAdmin() {
  if (!emAdmin || !usuario) return;
  const lista = $('#lista-ag');
  lista.replaceChildren();
  if (!ags.length) lista.append(el('li', 'vazio', 'Nenhuma solicitação por enquanto.'));
  [...ags].sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora)).forEach(a => {
    const li = el('li'), info = el('div'), acoes = el('div', 'acoes');
    info.append(el('h3', '', a.nome), el('p', '', `${a.servicoNome} · ${dataBR(a.data)} às ${a.hora}`), el('p', '', a.whats));

    const conf = el('button', 'btn small', 'Confirmar');
    conf.disabled = a.status !== 'pendente';
    conf.onclick = () => updateDoc(doc(db, 'agendamentos', a.id), {status:'confirmado'}).catch(falha);

    const msg = `Olá, ${a.nome.split(' ')[0]}! Seu horário (${a.servicoNome}) no estúdio Elizabeth está confirmado para ${dataBR(a.data)} às ${a.hora}. Até lá! Para consultar ou cancelar: ${linkCancelar(a.id)}`;
    const wpp = el('a', 'btn small ghost', 'WhatsApp');
    wpp.href = `https://wa.me/55${a.whats.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
    wpp.target = '_blank'; wpp.rel = 'noopener';

    const canc = el('button', 'btn small ghost', a.status === 'cancelado' ? 'Remover' : 'Cancelar');
    canc.onclick = () => {
      if (!confirm(`Cancelar o agendamento de ${a.nome}?`)) return;
      const b = writeBatch(db);                       // apaga o pedido e libera o horário
      b.delete(doc(db, 'agendamentos', a.id));
      if (a.slot) b.delete(doc(db, 'horarios', a.slot));
      b.commit().then(carregarPublico).catch(falha);
    };

    acoes.append(...(a.status === 'cancelado' ? [canc] : [conf, wpp, canc]));
    li.append(info, el('span', 'tag ' + a.status, a.status === 'confirmado' ? 'Confirmado' : a.status === 'cancelado' ? 'Cancelado pelo cliente' : 'Pendente'), acoes);
    lista.append(li);
  });

  const ls = $('#lista-serv-adm');
  ls.replaceChildren();
  if (!servicos.length) {
    const li = el('li'), b = el('button', 'btn small ghost', 'Carregar serviços de exemplo');
    b.onclick = () => Promise.all(seedServ.map((s, i) =>
      addDoc(collection(db, 'servicos'), {...s, ordem: Date.now() + i}))).then(carregarPublico).catch(falha);
    li.append(el('span', 'vazio', 'Nenhum serviço cadastrado.'), b);
    ls.append(li);
  }
  servicos.forEach(s => {
    const li = el('li'), del = el('button', 'btn small ghost', 'Excluir');
    del.onclick = () => {
      if (confirm(`Excluir o serviço "${s.nome}"?`)) deleteDoc(doc(db, 'servicos', s.id)).then(carregarPublico).catch(falha);
    };
    li.append(el('span', '', `${s.nome} · ${s.dur} · ${brl(s.preco)}`), del);
    ls.append(li);
  });
}

$('#form-serv').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, v = n => f.elements[n].value.trim();
  const preco = parseFloat(v('preco').replace(',', '.'));
  if (!v('nome') || !v('dur') || !(preco >= 0)) return;
  addDoc(collection(db, 'servicos'), {nome:v('nome'), desc:v('desc'), dur:v('dur'), preco, ordem:Date.now()})
    .then(() => { f.reset(); carregarPublico(); }).catch(falha);
});

/* ---------- Login e navegação site <-> painel ---------- */
function mostrar(admin) {
  if (admin !== emAdmin) window.scrollTo(0, 0);
  emAdmin = admin;
  // O endereço guarda "#painel": ao recarregar, a página continua no painel
  if (admin) history.replaceState(null, '', '#painel');
  else if (location.hash === '#painel') history.replaceState(null, '', location.pathname + location.search);
  $('#site').hidden = admin;
  $('#admin').hidden = !admin;
  $('#form-login').hidden = !authPronto || !!usuario;   // espera o Firebase dizer se já há login
  $('#painel').hidden = !usuario;
  $('#sair').hidden = !usuario;
  renderAdmin();
}
$('#abrir-admin').onclick = () => mostrar(true);
$('#voltar').onclick = () => mostrar(false);
$('#sair').onclick = () => { signOut(auth); mostrar(false); };
addEventListener('hashchange', () => { const q = location.hash === '#painel'; if (q !== emAdmin) mostrar(q); });
$('#form-login').addEventListener('submit', e => {
  e.preventDefault();
  signInWithEmailAndPassword(auth, $('#email').value.trim(), $('#senha').value)
    .then(() => { $('#senha').value = ''; $('#login-erro').textContent = ''; })
    .catch(() => { $('#login-erro').textContent = 'E-mail ou senha incorretos.'; });
});

// Só com a equipe logada o site lê os agendamentos
onAuthStateChanged(auth, u => {
  usuario = u; authPronto = true;
  if (cancelaAgs) { cancelaAgs(); cancelaAgs = null; }
  if (u) {
    cancelaAgs = onSnapshot(collection(db, 'agendamentos'), snap => {
      ags = snap.docs.map(d => ({id:d.id, ...d.data()}));
      renderAdmin();
    }, falha);
  } else ags = [];
  mostrar(emAdmin);
});

/* ---------- Visual: entrada suave e fundo com linhas ---------- */
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visto'); io.unobserve(e.target); }
  }), {rootMargin: '0px'});   // sem margem negativa: itens colados no fim da página também aparecem
  // o rodapé não anima, para o botão do painel nunca sumir
  document.querySelectorAll('.hero>*,.bloco>*').forEach(n => { n.classList.add('rev'); io.observe(n); });
}

function fundo() {
  const c = $('#fundo'), x = c.getContext && c.getContext('2d');
  if (!x) return;
  // Se o aparelho pede "reduzir movimento" (comum no Android com economia de bateria
  // ou "Remover animações"), as linhas ficam mais lentas e suaves, em vez de desligar.
  const suave = matchMedia('(prefers-reduced-motion:reduce)').matches;
  let w, h, t = 0;
  const ajusta = () => {
    const d = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight; c.width = w * d; c.height = h * d;
    x.setTransform(d, 0, 0, d, 0, 0);
  };
  const desenha = () => {
    x.clearRect(0, 0, w, h);
    x.lineWidth = w < 700 ? 1.5 : 1;            // um pouco mais grossa no celular
    for (let i = 0; i < 5; i++) {               // 5 linhas ondulando devagar
      x.strokeStyle = `rgba(184,91,56,${.14 + i * .02})`;
      x.beginPath();
      for (let px = 0; px <= w; px += 12) {
        const y = h * (.15 + i * .18) + Math.sin(px / (220 + i * 40) + t * (.5 + i * .12) + i * 2) * (28 + i * 8) * (suave ? .5 : 1);
        px ? x.lineTo(px, y) : x.moveTo(px, y);
      }
      x.stroke();
    }
    t += suave ? .002 : .008;
    requestAnimationFrame(desenha);
  };
  ajusta();
  // A barra de endereço do Android muda a altura ao rolar: só recalcula se a largura mudar
  addEventListener('resize', () => { if (innerWidth !== w) ajusta(); });
  desenha();
}

mostrar(emAdmin); renderSite(); renderHoras(); fundo(); carregarPublico();
if (idCancelar) abrirCancelar(idCancelar); else lembrarMeu();
