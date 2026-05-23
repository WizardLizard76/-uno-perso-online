const socket = io();
let currentCode=null, state=null, myIndex=null, myHand=[];
const $=id=>document.getElementById(id);
const labels={red:'Rouge',yellow:'Jaune',green:'Vert',blue:'Bleu',wild:'Noir'};
function nameVal(){return $('name').value.trim()||'Joueur'}
socket.on('connect',()=>$('status').innerHTML='Connecté ✅');
socket.on('disconnect',()=>$('status').innerHTML='Pas connecté');
socket.on('roomState',r=>{state=r; currentCode=r.code; render();});
socket.on('hand',d=>{myIndex=d.index; myHand=d.hand||[]; render();});
socket.on('message',m=>$('gameMsg').textContent=m);
function createRoom(){socket.emit('createRoom',{name:nameVal()},res=>{if(!res.ok)return $('msg').textContent=res.msg; currentCode=res.code; state=res.room; render();});}
function joinRoom(){socket.emit('joinRoom',{name:nameVal(),code:$('code').value.trim()},res=>{if(!res.ok)return $('msg').textContent=res.msg; currentCode=res.code; state=res.room; render();});}
function startGame(){socket.emit('startGame',currentCode)}
function drawCard(){socket.emit('drawCard',currentCode)}
function sayUno(){socket.emit('uno',currentCode)}
function copyInvite(){navigator.clipboard?.writeText(location.origin+'?room='+currentCode);$('gameMsg').textContent='Lien copié'}
function chooseColor(){return prompt('Couleur ? red, yellow, green, blue','red')||'red'}
function playCard(id){const c=myHand.find(x=>x.id===id); socket.emit('playCard',{code:currentCode,cardId:id,color:c&&c.color==='wild'?chooseColor():null});}
function cardHtml(c,small=false){if(!c)return '<div class="uno-card">?</div>'; return `<button class="uno-card ${c.color}" ${small?'disabled':''} onclick="${small?'':`playCard('${c.id}')`}"><b>${c.value}</b><small>${labels[c.color]||c.color}</small></button>`}
function render(){
 if(!state)return; $('msg').textContent=''; $('lobby').classList.remove('hidden'); $('roomCode').textContent=state.code;
 $('players').innerHTML=state.players.map(p=>`<li>${p.name} (${p.cards} cartes)</li>`).join('');
 $('startBtn').style.display=state.started?'none':'inline-block';
 if(state.started){ $('game').classList.remove('hidden'); $('gameMsg').textContent=''; }
 $('topCard').innerHTML='<h3>Carte visible</h3>'+cardHtml(state.top,true)+`<p>Couleur active : ${labels[state.color]||state.color||''}</p>`;
 const turn=state.players[state.turn]; $('turnInfo').textContent=turn?`Tour de ${turn.name}${state.pending?` — pioche en attente : +${state.pending}`:''}`:'';
 $('hand').innerHTML=myHand.map(c=>cardHtml(c)).join('');
 $('scoreboard').innerHTML=state.players.map((p,i)=>`<li>${p.name} — ${p.score} pts — ${p.cards} cartes <button onclick="socket.emit('penaltyUno',{code:currentCode,target:${i}})">Oubli UNO</button></li>`).join('');
 $('log').innerHTML=(state.log||[]).map(x=>`<p>${x}</p>`).join('');
 if(state.winner) $('gameMsg').textContent=state.winner;
}
const params=new URLSearchParams(location.search); if(params.get('room')) $('code').value=params.get('room');
