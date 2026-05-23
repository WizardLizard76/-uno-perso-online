const socket = io();
let currentCode = null;
const $ = id => document.getElementById(id);
socket.on('connect', () => $('status').innerHTML = 'Connecté ✅');
socket.on('disconnect', () => $('status').innerHTML = 'Pas connecté');
socket.on('roomState', room => showRoom(room));
socket.on('message', msg => $('gameMsg').textContent = msg);
function nameVal(){ return $('name').value.trim() || 'Joueur'; }
function createRoom(){ socket.emit('createRoom', {name:nameVal()}, res => { if(!res.ok) return $('msg').textContent=res.msg; currentCode=res.code; showRoom(res.room); }); }
function joinRoom(){ socket.emit('joinRoom', {name:nameVal(), code:$('code').value.trim()}, res => { if(!res.ok) return $('msg').textContent=res.msg; currentCode=res.code; showRoom(res.room); }); }
function showRoom(room){ currentCode=room.code; $('msg').textContent=''; $('lobby').classList.remove('hidden'); $('roomCode').textContent=room.code; $('players').innerHTML=room.players.map(p=>`<li>${p}</li>`).join(''); if(room.started) $('gameMsg').textContent='Partie lancée !'; }
function startGame(){ socket.emit('startGame', currentCode); }
function copyInvite(){ navigator.clipboard?.writeText(location.origin + '?room=' + currentCode); $('gameMsg').textContent='Lien copié'; }
const params = new URLSearchParams(location.search); if(params.get('room')) $('code').value = params.get('room');
