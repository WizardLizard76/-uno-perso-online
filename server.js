const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const rooms = new Map();

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const COLORS = ['red','yellow','green','blue'];
const LABEL = {red:'Rouge', yellow:'Jaune', green:'Vert', blue:'Bleu', wild:'Noir'};
function makeCode(){ let c; do { c = String(Math.floor(1000 + Math.random()*9000)); } while (rooms.has(c)); return c; }
function cardId(){ return Math.random().toString(36).slice(2,10); }
function card(type,color,value){ return { id:cardId(), type, color, value }; }
function makeDeck(){
  const d=[];
  for(const color of COLORS){
    d.push(card('num', color, 0));
    for(let n=1;n<=9;n++){ d.push(card('num', color, n), card('num', color, n)); }
    for(let i=0;i<2;i++) d.push(card('skip', color, '⛔'), card('reverse', color, '↺'), card('draw2', color, '+2'));
  }
  for(let i=0;i<4;i++) d.push(card('wild','wild','🌈'), card('draw4','wild','+4'));
  return d.sort(()=>Math.random()-0.5);
}
function ensureDeck(r){
  if(r.deck.length) return;
  const top = r.discard.pop();
  r.deck = r.discard.sort(()=>Math.random()-0.5);
  r.discard = top ? [top] : [];
}
function drawTo(r,p,n=1){ for(let i=0;i<n;i++){ ensureDeck(r); const c=r.deck.pop(); if(c) p.hand.push(c); } }
function sameCard(a,b){ return a && b && a.type===b.type && a.color===b.color && a.value===b.value; }
function cardScore(c){ if(c.type==='num') return c.value; if(c.type==='wild'||c.type==='draw4') return 50; return 25; }
function nextIndex(r, from=r.turn, step=1){ const n=r.players.length; return (from + r.dir*step + n*10) % n; }
function publicRoom(r){ return { code:r.code, players:r.players.map((p,i)=>({name:p.name,cards:p.hand.length,score:p.score||0,uno:p.uno||false,index:i})), started:r.started, turn:r.turn, dir:r.dir, top:r.discard.at(-1), pending:r.pending, locked:r.locked, color:r.currentColor, log:r.log.slice(-8), winner:r.winner||null }; }
function sendState(r){
  io.to(r.code).emit('roomState', publicRoom(r));
  r.players.forEach((p,i)=>io.to(p.id).emit('hand', { index:i, hand:p.hand }));
}
function startRound(r){
  r.deck = makeDeck(); r.discard=[]; r.turn=0; r.dir=1; r.pending=0; r.locked=null; r.currentColor=null; r.started=true; r.winner=null; r.log=['Partie lancée'];
  r.players.forEach(p=>{ p.hand=[]; p.uno=false; drawTo(r,p,7); });
  let first; do { ensureDeck(r); first = r.deck.pop(); } while(first && first.color==='wild');
  r.discard.push(first); r.currentColor = first.color;
}
function canPlay(card, r, playerIndex){
  const top = r.discard.at(-1);
  if(!top) return true;
  if(r.pending>0){
    if(r.locked==='draw4') return card.type==='draw4';
    return card.type==='draw2' || card.type==='draw4';
  }
  const instant = playerIndex!==r.turn && sameCard(card, top);
  if(instant) return true;
  if(playerIndex!==r.turn) return false;
  return card.color==='wild' || card.color===r.currentColor || card.value===top.value || card.type===top.type;
}
function finishIfNeeded(r,p){
  if(p.hand.length) return false;
  r.started=false;
  r.players.forEach(x=>{ if(x!==p) x.score=(x.score||0)+x.hand.reduce((a,c)=>a+cardScore(c),0); });
  const loser = r.players.find(x=>(x.score||0)>=500);
  r.winner = loser ? `${loser.name} atteint 500 points et perd la partie` : `${p.name} finit la manche`;
  r.log.push(r.winner);
  return true;
}

io.on('connection', socket => {
  socket.on('createRoom', ({name}, cb=()=>{}) => {
    const code = makeCode();
    const room = { code, players:[{ id:socket.id, name:name || 'Joueur 1', hand:[], score:0, uno:false }], started:false, deck:[], discard:[], turn:0, dir:1, pending:0, locked:null, currentColor:null, log:[`Salle ${code} créée`] };
    rooms.set(code, room); socket.join(code);
    cb({ ok:true, code, room:publicRoom(room) }); sendState(room);
  });
  socket.on('joinRoom', ({name, code}, cb=()=>{}) => {
    code = String(code||'').trim(); const room = rooms.get(code);
    if(!room) return cb({ ok:false, msg:'Salle introuvable' });
    if(room.started) return cb({ ok:false, msg:'Partie déjà lancée' });
    if(!room.players.find(p=>p.id===socket.id)) room.players.push({ id:socket.id, name:name||'Joueur', hand:[], score:0, uno:false });
    socket.join(code); room.log.push(`${name||'Joueur'} rejoint`);
    cb({ ok:true, code, room:publicRoom(room) }); sendState(room);
  });
  socket.on('startGame', code => {
    const r=rooms.get(String(code||'').trim()); if(!r || r.players.length<2) return;
    if(r.players[0].id!==socket.id) return;
    startRound(r); sendState(r);
  });
  socket.on('playCard', ({code, cardId:cid, color}) => {
    const r=rooms.get(String(code||'').trim()); if(!r||!r.started) return;
    const p=r.players.find(x=>x.id===socket.id); if(!p) return;
    const pi=r.players.indexOf(p); const idx=p.hand.findIndex(c=>c.id===cid); if(idx<0) return;
    const c=p.hand[idx]; if(!canPlay(c,r,pi)) return;
    p.hand.splice(idx,1); p.uno=false;
    if(c.color==='wild') r.currentColor = COLORS.includes(color) ? color : 'red'; else r.currentColor=c.color;
    r.discard.push(c); r.log.push(`${p.name} joue ${c.value} ${LABEL[r.currentColor]||''}`);
    if(c.type==='draw2'){ r.pending+=2; r.locked='draw2'; r.turn=nextIndex(r,pi); }
    else if(c.type==='draw4'){ r.pending+=4; r.locked='draw4'; r.turn=nextIndex(r,pi); }
    else { r.pending=0; r.locked=null; if(c.type==='skip') r.turn=nextIndex(r,pi,2); else if(c.type==='reverse'){ r.dir*=-1; r.turn=nextIndex(r,pi); } else r.turn=nextIndex(r,pi); }
    finishIfNeeded(r,p); sendState(r);
  });
  socket.on('drawCard', code => {
    const r=rooms.get(String(code||'').trim()); if(!r||!r.started) return;
    const p=r.players[r.turn]; if(!p || p.id!==socket.id) return;
    const n=r.pending||1; drawTo(r,p,n); r.log.push(`${p.name} pioche ${n}`); r.pending=0; r.locked=null; r.turn=nextIndex(r); sendState(r);
  });
  socket.on('uno', code => {
    const r=rooms.get(String(code||'').trim()); if(!r||!r.started) return;
    const p=r.players.find(x=>x.id===socket.id); if(p && p.hand.length===1){ p.uno=true; r.log.push(`${p.name} dit UNO !`); sendState(r); }
  });
  socket.on('penaltyUno', ({code,target}) => {
    const r=rooms.get(String(code||'').trim()); if(!r||!r.started) return;
    const p=r.players[target]; if(p && p.hand.length===1 && !p.uno){ drawTo(r,p,2); if(r.turn===target) r.turn=nextIndex(r); r.log.push(`${p.name} oublie UNO : +2 et passe son tour`); sendState(r); }
  });
  socket.on('disconnect', () => {
    for(const [code,r] of rooms){ const before=r.players.length; r.players=r.players.filter(p=>p.id!==socket.id); if(!r.players.length) rooms.delete(code); else if(before!==r.players.length){ if(r.turn>=r.players.length) r.turn=0; r.log.push('Un joueur déconnecté'); sendState(r); } }
  });
});
server.listen(process.env.PORT || 3000, () => console.log('UNO Perso jouable lancé'));
