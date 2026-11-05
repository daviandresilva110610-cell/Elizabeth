/* =====================================================
   Elizabeth – Podologia e Pedicure
   Dados online no Firebase (Firestore) + login da equipe (Authentication).
   ===================================================== */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';

/* ---------- Configurações (edite aqui) ---------- */
// Cole aqui o firebaseConfig que o Firebase mostra ao registrar o app Web
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

// Serviços de exemplo (botão "Carregar serviços de exemplo" no painel)
const seedServ = [
  {nome:'Podologia clínica', desc:'Avaliação completa e cuidado de calos, durezas e unhas.', dur:'60 min', preco:150},
  {nome:'Pedicure completa', desc:'Cutilagem, esfoliação, hidratação e esmaltação.', dur:'50 min', preco:80},
  {nome:'Unha encravada', desc:'Tratamento da causa e orientação para evitar que volte.', dur:'45 min', preco:120},
  {nome:'Spa dos pés', desc:'Escalda-pés, esfoliação e massagem relaxante.', dur:'40 min', preco:90},
];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app), auth = getAuth(app);

/* ---------- Utilitários ---------- */
const $ = s => document.querySelector(s);
const brl = n => Number(n).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
const dataBR = d => d.split('-').reverse().join('/');
const falha = e => alert('Não foi possível concluir (' + (e.code || e.message) + ').');
// Cria elemento usando textContent (evita injetar HTML digitado pelo cliente)
const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
};

let servicos = [], ags = [], usuario = null, emAdmin = false, cancelaAgs = null;

/* ---------- Site público ---------- */
function renderSite() {
  const ul = $('#lista-servicos');
  ul.replaceChildren();
  if (!servicos.length) ul.append(el('li', 'vazio', 'Novos serviços em breve.'));
  servicos.forEach(s => {
    const li = el('li'), txt = el('div'), meta = el('div', 'meta');
    txt.append(el('h3', '', s.nome), el('p', '', s.desc));
    meta.append(el('span', '', s.dur), el('strong', '', brl(s.preco)));
    li.append(txt, meta);
    ul.append(li);
  });
  // Mesmas opções no formulário de agendamento
  const sel = $('#f-servico'), atual = sel.value;
  sel.replaceChildren(new Option('Escolha um serviço', ''));
  servicos.forEach(s => sel.add(new Option(`${s.nome} — ${brl(s.preco)}`, s.id)));
  sel.value = atual;
}

// Serviços: qualquer visitante lê; atualiza sozinho quando a Elizabeth altera
onSnapshot(collection(db, 'servicos'), snap => {
  servicos = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  renderSite(); renderAdmin();
}, falha);

// Horários e data mínima (hoje)
HORAS.forEach(h => $('#f-hora').add(new Option(h, h)));
$('#f-data').min = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
$('#link-whats').href = 'https://wa.me/' + WHATS_ESTUDIO;

// Máscara (00) 00000-0000
$('#f-whats').addEventListener('input', e => {
  const d = e.target.value.replace(/\D/g, '').slice(0, 11);
  e.target.value = d.length > 6 ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
                 : d.length > 2 ? `(${d.slice(0,2)}) ${d.slice(2)}` : d;
});

$('#form-agenda').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, v = n => f.elements[n].value.trim(), btn = f.querySelector('button');
  const serv = servicos.find(s => s.id === v('servico'));
  if (v('nome').length < 3 || v('whats').replace(/\D/g, '').length !== 11 || !serv || !v('data') || !v('hora')) {
    $('#erro').textContent = 'Preencha todos os campos, com o WhatsApp completo.';
    return;
  }
  $('#erro').textContent = '';
  btn.disabled = true;
  try {
    // Grava online: aparece no painel da Elizabeth em tempo real
    await addDoc(collection(db, 'agendamentos'), {
      nome: v('nome'), whats: v('whats'), servicoId: serv.id, servicoNome: serv.nome,
      data: v('data'), hora: v('hora'), status: 'pendente', criado: serverTimestamp(),
    });
    f.reset(); f.hidden = true; $('#ok').hidden = false;
  } catch (err) {
    $('#erro').textContent = 'Não foi possível enviar agora. Tente de novo ou chame no WhatsApp.';
  }
  btn.disabled = false;
});
$('#novo').addEventListener('click', () => { $('#ok').hidden = true; $('#form-agenda').hidden = false; });

/* ---------- Painel da empresa ---------- */
function renderAdmin() {
  if (!emAdmin || !usuario) return;
  // Agendamentos, do mais próximo ao mais distante
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
      if (confirm(`Cancelar o agendamento de ${a.nome}?`)) deleteDoc(doc(db, 'agendamentos', a.id)).catch(falha);
    };

    acoes.append(conf, wpp, canc);
    li.append(info, el('span', 'tag ' + a.status, a.status === 'confirmado' ? 'Confirmado' : 'Pendente'), acoes);
    lista.append(li);
  });

  // Serviços cadastrados (com opção de excluir)
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
  emAdmin = admin;
  $('#site').hidden = admin;
  $('#admin').hidden = !admin;
  $('#form-login').hidden = !!usuario;
  $('#painel').hidden = !usuario;
  $('#sair').hidden = !usuario;
  renderAdmin();
  window.scrollTo(0, 0);
}
$('#abrir-admin').onclick = () => mostrar(true);
$('#voltar').onclick = () => mostrar(false);
$('#sair').onclick = () => { signOut(auth); mostrar(false); };
$('#form-login').addEventListener('submit', e => {
  e.preventDefault();
  signInWithEmailAndPassword(auth, $('#email').value.trim(), $('#senha').value)
    .then(() => { $('#senha').value = ''; $('#login-erro').textContent = ''; })
    .catch(() => { $('#login-erro').textContent = 'E-mail ou senha incorretos.'; });
});

// Só com a equipe logada o site passa a ler os agendamentos
onAuthStateChanged(auth, u => {
  usuario = u;
  if (cancelaAgs) { cancelaAgs(); cancelaAgs = null; }
  if (u) {
    cancelaAgs = onSnapshot(collection(db, 'agendamentos'), snap => {
      ags = snap.docs.map(d => ({id:d.id, ...d.data()}));
      renderAdmin();
    }, falha);
  } else ags = [];
  mostrar(emAdmin);
});
