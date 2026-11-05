/* =====================================================
   Elizabeth – Podologia e Pedicure
   Firebase (Firestore + Authentication), horários únicos e painel.
   ===================================================== */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import { initializeFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, writeBatch }
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

// Serviços: qualquer visitante lê; atualiza sozinho quando a Elizabeth altera
onSnapshot(collection(db, 'servicos'), snap => {
  servicos = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  msgServ = 'Novos serviços em breve.';
  try { localStorage.setItem(CACHE, JSON.stringify(servicos)); } catch (e) {}
  renderSite(); renderAdmin();
}, () => { msgServ = 'Não foi possível carregar os serviços. Atualize a página.'; renderSite(); });

// Horários ocupados (só data e hora, sem dados pessoais)
onSnapshot(collection(db, 'horarios'), snap => {
  ocupados = new Set(snap.docs.map(d => d.id));
  renderHoras();
}, () => {});

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
  const slot = `${data}_${hora}`;
  try {
    // Grava pedido + reserva do horário juntos. O horário tem código único:
    // se outra pessoa reservou antes, o Firebase recusa e ninguém fica duplicado.
    const b = writeBatch(db);
    b.set(doc(collection(db, 'agendamentos')), {
      nome: v('nome'), whats: v('whats'), servicoId: serv.id, servicoNome: serv.nome,
      data, hora, slot, status: 'pendente', criado: serverTimestamp(),
    });
    b.set(doc(db, 'horarios', slot), {data, hora});
    await b.commit();
    f.reset(); renderHoras(); f.hidden = true; $('#ok').hidden = false;
  } catch (err) {
    $('#erro').textContent = 'Não foi possível reservar este horário. Ele pode ter acabado de ser ocupado: escolha outro ou chame no WhatsApp.';
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
    conf.disabled = a.status === 'confirmado';
    conf.onclick = () => updateDoc(doc(db, 'agendamentos', a.id), {status:'confirmado'}).catch(falha);

    const msg = `Olá, ${a.nome.split(' ')[0]}! Seu horário (${a.servicoNome}) no estúdio Elizabeth está confirmado para ${dataBR(a.data)} às ${a.hora}. Até lá!`;
    const wpp = el('a', 'btn small ghost', 'WhatsApp');
    wpp.href = `https://wa.me/55${a.whats.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
    wpp.target = '_blank'; wpp.rel = 'noopener';

    const canc = el('button', 'btn small ghost', 'Cancelar');
    canc.onclick = () => {
      if (!confirm(`Cancelar o agendamento de ${a.nome}?`)) return;
      const b = writeBatch(db);                       // apaga o pedido e libera o horário
      b.delete(doc(db, 'agendamentos', a.id));
      if (a.slot) b.delete(doc(db, 'horarios', a.slot));
      b.commit().catch(falha);
    };

    acoes.append(conf, wpp, canc);
    li.append(info, el('span', 'tag ' + a.status, a.status === 'confirmado' ? 'Confirmado' : 'Pendente'), acoes);
    lista.append(li);
  });

  const ls = $('#lista-serv-adm');
  ls.replaceChildren();
  if (!servicos.length) {
    const li = el('li'), b = el('button', 'btn small ghost', 'Carregar serviços de exemplo');
    b.onclick = () => seedServ.forEach((s, i) =>
      addDoc(collection(db, 'servicos'), {...s, ordem: Date.now() + i}).catch(falha));
    li.append(el('span', 'vazio', 'Nenhum serviço cadastrado.'), b);
    ls.append(li);
  }
  servicos.forEach(s => {
    const li = el('li'), del = el('button', 'btn small ghost', 'Excluir');
    del.onclick = () => {
      if (confirm(`Excluir o serviço "${s.nome}"?`)) deleteDoc(doc(db, 'servicos', s.id)).catch(falha);
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
    .then(() => f.reset()).catch(falha);
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
  }), {rootMargin: '0px 0px -8% 0px'});
  document.querySelectorAll('.hero>*,.bloco>*,.rodape>*').forEach(n => { n.classList.add('rev'); io.observe(n); });
}

function fundo() {
  const c = $('#fundo'), x = c.getContext && c.getContext('2d');
  if (!x) return;
  const reduz = matchMedia('(prefers-reduced-motion:reduce)').matches;
  let w, h, t = 0;
  const ajusta = () => {
    const d = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight; c.width = w * d; c.height = h * d;
    x.setTransform(d, 0, 0, d, 0, 0);
    if (reduz) desenha();
  };
  const desenha = () => {
    x.clearRect(0, 0, w, h); x.lineWidth = 1;
    for (let i = 0; i < 5; i++) {               // 5 linhas ondulando devagar
      x.strokeStyle = `rgba(184,91,56,${.1 + i * .02})`;
      x.beginPath();
      for (let px = 0; px <= w; px += 12) {
        const y = h * (.15 + i * .18) + Math.sin(px / (220 + i * 40) + t * (.5 + i * .12) + i * 2) * (28 + i * 8);
        px ? x.lineTo(px, y) : x.moveTo(px, y);
      }
      x.stroke();
    }
    t += .008;
    if (!reduz) requestAnimationFrame(desenha);
  };
  ajusta(); addEventListener('resize', ajusta);
  if (!reduz) desenha();
}

mostrar(emAdmin); renderSite(); renderHoras(); fundo();
