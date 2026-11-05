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
function opcao(name, value, titulo, detalhe, on, off, tipo) {
  const l = el('label', 'op'), i = document.createElement('input'), s = el('span');
  i.type = tipo || 'radio'; i.name = name; i.value = value; i.checked = !!on; i.disabled = !!off;
  s.append(el('strong', '', titulo));
  if (detalhe) s.append(el('small', '', detalhe));
  l.append(i, s);
  return l;
}

/* ---------- Estado ---------- */
const CACHE = 'eliz_servicos_cache';
let servicos = [], ags = [], horariosDocs = [], ocupados = new Set(), usuario = null, authPronto = false, cancelaAgs = null;
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
  const dica = $('#dica-hora');
  dica.hidden = !!data; dica.textContent = 'Escolha uma data para ver os horários livres.';
  if (!data) return;
  const hoje = $('#f-data').min, agora = new Date().toTimeString().slice(0, 5);
  HORAS.forEach(h => {
    const off = ocupados.has(`${data}_${h}`) || (data === hoje && h <= agora);
    box.append(opcao('hora', h, h, '', h === atual && !off, off));
  });
  if (!box.querySelector('input:not(:disabled)')) { dica.hidden = false; dica.textContent = 'Não há horários livres neste dia. Escolha outra data.'; }
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
    horariosDocs = hs;
    msgServ = 'Novos serviços em breve.';
    try { localStorage.setItem(CACHE, JSON.stringify(servicos)); } catch (e) {}
  } catch (e) {
    ok = false;
    if (!servicos.length) msgServ = 'Não foi possível carregar os serviços. Tentando de novo…';
  }
  if (ok) atualizarMeu();
  const nova = JSON.stringify([servicos, [...ocupados], msgServ]);
  if (nova !== assinatura) { assinatura = nova; renderSite(); renderHoras(); renderAdmin(); }   // só redesenha se mudou
  timer = setTimeout(carregarPublico, ok ? 20000 : 5000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) carregarPublico(); });

/* ---------- Avisos (notificações) ----------
   Aparecem enquanto o site/painel estiver aberto no navegador (mesmo em segundo plano).
   Usam o sw.js, que é o que faz as notificações funcionarem também no Android. */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
const temAviso = 'Notification' in window;
const pedirAviso = async () => temAviso && (await Notification.requestPermission()) === 'granted';   // precisa de um toque
function avisar(titulo, corpo) {
  if (!temAviso || Notification.permission !== 'granted') return;
  const opcoes = {body: corpo, data: location.href, tag: titulo};
  (navigator.serviceWorker ? navigator.serviceWorker.ready : Promise.reject())
    .then(r => r.showNotification(titulo, opcoes))
    .catch(() => { try { new Notification(titulo, opcoes); } catch (e) {} });
}
function bip() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = .15;
    o.start(); o.stop(c.currentTime + .25);
  } catch (e) {}
}
const tituloBase = document.title;
let naoLidos = 0, agsVistos = null;
const zera = () => { if (naoLidos) { naoLidos = 0; document.title = tituloBase; } };
addEventListener('focus', zera);
document.addEventListener('visibilitychange', () => { if (!document.hidden) zera(); });

// Empresa: chegou pedido novo (faixa na tela, som, título da aba e notificação)
function novoPedido(lista) {
  const a = lista[0];
  const txt = lista.length > 1 ? `${lista.length} novos pedidos de agendamento` : `${a.nome} · ${a.servicoNome} · ${dataBR(a.data)} às ${a.hora}`;
  naoLidos += lista.length;
  document.title = `(${naoLidos}) Novo pedido · Elizabeth`;
  $('#aviso-painel').textContent = 'Novo pedido: ' + txt + ' (toque para fechar)';
  $('#aviso-painel').hidden = false;
  bip(); avisar('Novo pedido de agendamento', txt);
}
$('#aviso-painel').onclick = () => { $('#aviso-painel').hidden = true; };

// Botões "ativar avisos" (painel e cliente): só aparecem se ainda não foi decidido
const semPedido = !temAviso || Notification.permission !== 'default';
$('#ativar-avisos').hidden = $('#ativar-aviso-cli').hidden = semPedido;
$('#ativar-avisos').onclick = async () => {
  const ok = await pedirAviso(); $('#ativar-avisos').hidden = true;
  if (ok) avisar('Avisos ativados', 'Você será avisada dos novos pedidos enquanto o painel estiver aberto.');
};
$('#ativar-aviso-cli').onclick = async () => {
  const ok = await pedirAviso(); $('#ativar-aviso-cli').hidden = true;
  if (ok) avisar('Aviso ativado', 'Você será avisado quando a Elizabeth confirmar o horário (com o site aberto).');
};

/* ---------- Cancelamento pelo cliente ----------
   Cada pedido tem um código longo e impossível de adivinhar (o próprio id).
   Só quem tem o link (?cancelar=codigo) consegue ver e cancelar aquele pedido. */
const idCancelar = new URLSearchParams(location.search).get('cancelar');
const linkCancelar = id => `${location.origin}${location.pathname}?cancelar=${id}`;
// Prazo: cancelar até 24 h antes do atendimento (horário de Brasília, UTC-3)
const inicioAg = a => new Date(`${a.data}T${a.hora}:00-03:00`).getTime();
const noPrazo = a => Date.now() < inicioAg(a) - 864e5;
const prazoTxt = a => {   // mesmo horário, um dia antes
  const d = new Date(`${a.data}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
  return `${dataBR(d.toISOString().slice(0, 10))} às ${a.hora}`;
};
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
    $('#cancelar-prazo').textContent = `Prazo para cancelar: até ${prazoTxt(a)} (24 horas antes do atendimento).`;
    if (!noPrazo(a)) {
      msg.textContent = 'O prazo de cancelamento já terminou. Para alterar este horário, fale com a Elizabeth pelo WhatsApp.';
      $('#cancelar-whats').href = 'https://wa.me/' + WHATS_ESTUDIO;
      $('#cancelar-whats').hidden = false;
      return;
    }
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
        msg.textContent = e.status === 403
          ? 'Não foi possível cancelar: o prazo de 24 horas antes do atendimento pode já ter terminado. Fale com a Elizabeth pelo WhatsApp.'
          : 'Não foi possível cancelar agora. Tente de novo ou chame no WhatsApp.';
      }
    };
  } catch (e) {
    info.textContent = e.status === 404 || e.status === 403
      ? 'Não encontramos este agendamento. Confira o link ou chame no WhatsApp.'
      : 'Não foi possível carregar agora. Tente de novo em instantes.';
  }
}

// Acompanha o próprio pedido neste aparelho (a cada 20 s): mostra o estado e avisa quando for confirmado
async function atualizarMeu() {
  let id, ult; try { id = localStorage.getItem('eliz_meu'); ult = localStorage.getItem('eliz_meu_status'); } catch (e) {}
  if (!id || idCancelar) return;
  try {
    const a = await lerAg(id), conf = a.status === 'confirmado';
    if (a.status === 'cancelado' || a.data < $('#f-data').min) { $('#meu').hidden = true; return; }
    $('#meu-txt').textContent = `${a.servicoNome} · ${dataBR(a.data)} às ${a.hora}`;
    $('#meu-status').textContent = conf ? 'Confirmado! Esperamos você.' : 'Aguardando a confirmação da Elizabeth.';
    $('#meu-link').href = linkCancelar(id);
    $('#meu').classList.toggle('confirmado', conf);
    $('#meu').hidden = false;
    if (conf && ult !== 'confirmado') avisar('Agendamento confirmado!', `${a.servicoNome} · ${dataBR(a.data)} às ${a.hora}`);
    try { localStorage.setItem('eliz_meu_status', a.status); } catch (e) {}
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
    try { localStorage.setItem('eliz_meu', id); localStorage.setItem('eliz_meu_status', 'pendente'); } catch (e) {}
    // Atalho para a cliente avisar a Elizabeth também pelo WhatsApp
    $('#ok-whats').href = `https://wa.me/${WHATS_ESTUDIO}?text=` + encodeURIComponent(
      `Olá! Solicitei um horário pelo site: ${serv.nome}, ${dataBR(data)} às ${hora}. Nome: ${v('nome')}.`);
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

    const msg = `Olá, ${a.nome.split(' ')[0]}! Seu horário (${a.servicoNome}) no estúdio Elizabeth está confirmado para ${dataBR(a.data)} às ${a.hora}. Até lá! Para consultar ou cancelar (até 24h antes do atendimento): ${linkCancelar(a.id)}`;
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

  // Dias e horários bloqueados (indisponíveis para as clientes)
  const grupos = {}, hoje = $('#f-data').min, lb = $('#lista-bloq');
  horariosDocs.filter(d => d.tipo === 'bloqueio' && d.data >= hoje).forEach(d => (grupos[d.data] = grupos[d.data] || []).push(d.hora));
  lb.replaceChildren();
  const datas = Object.keys(grupos).sort();
  if (!datas.length) lb.append(el('li', 'vazio', 'Nenhum dia ou horário bloqueado.'));
  datas.forEach(d => {
    const hh = grupos[d].sort(), li = el('li'), lib = el('button', 'btn small ghost', 'Liberar');
    li.append(el('span', '', `${dataBR(d)} · ${hh.length === HORAS.length ? 'dia inteiro' : hh.join(', ')}`), lib);
    lib.onclick = () => {
      if (!confirm(`Liberar os horários de ${dataBR(d)}?`)) return;
      const b = writeBatch(db);
      hh.forEach(h => b.delete(doc(db, 'horarios', `${d}_${h}`)));
      b.commit().then(carregarPublico).catch(falha);
    };
    lb.append(li);
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

/* ---------- Bloquear dias e horários ----------
   Cada horário bloqueado vira um registro em "horarios" (igual a um horário reservado),
   então já aparece desativado para as clientes. */
const horasBloq = $('#b-horas');
HORAS.forEach(h => horasBloq.append(opcao('bhora', h, h, '', false, false, 'checkbox')));
$('#b-dia').addEventListener('change', e => { horasBloq.hidden = e.target.checked; });
$('#form-bloq').addEventListener('submit', async e => {
  e.preventDefault();
  const de = $('#b-de').value, ate = $('#b-ate').value || de, erro = $('#b-erro');
  const horas = $('#b-dia').checked ? HORAS : [...horasBloq.querySelectorAll('input:checked')].map(i => i.value);
  if (!de || de < $('#f-data').min || ate < de || !horas.length) {
    erro.textContent = 'Escolha uma data a partir de hoje (e o fim do período, se houver) e ao menos um horário.';
    return;
  }
  const dias = [];
  for (const d = new Date(de + 'T12:00:00Z'), fim = new Date(ate + 'T12:00:00Z'); d <= fim && dias.length < 62; d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(d.toISOString().slice(0, 10));
  }
  // horários que já têm agendamento (ou bloqueio) são mantidos
  const novos = dias.flatMap(d => horas.map(h => `${d}_${h}`)).filter(k => !ocupados.has(k));
  const mantidos = dias.length * horas.length - novos.length;
  try {
    for (let i = 0; i < novos.length; i += 400) {
      const b = writeBatch(db);
      novos.slice(i, i + 400).forEach(k => { const [d, h] = k.split('_'); b.set(doc(db, 'horarios', k), {data: d, hora: h, tipo: 'bloqueio'}); });
      await b.commit();
    }
    e.target.reset(); horasBloq.hidden = true;
    erro.textContent = mantidos ? `${mantidos} horário(s) já estavam ocupados e foram mantidos.` : '';
    carregarPublico();
  } catch (err) { falha(err); }
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
  agsVistos = null;   // a primeira carga não conta como "pedido novo"
  if (u) {
    cancelaAgs = onSnapshot(collection(db, 'agendamentos'), snap => {
      ags = snap.docs.map(d => ({id:d.id, ...d.data()}));
      const novos = agsVistos ? ags.filter(a => !agsVistos.has(a.id) && a.status === 'pendente') : [];
      agsVistos = new Set(ags.map(a => a.id));
      if (novos.length) novoPedido(novos);
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
if (idCancelar) abrirCancelar(idCancelar);
