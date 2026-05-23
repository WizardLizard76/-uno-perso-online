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

function makeCode(){ let c; do { c = String(Math.floor(1000 + Math.random()*9000)); } while (rooms.has(c)); return c; }
function publicRoom(r){ return { code:r.code, players:r.players.map(p=>p.name), started:r.started }; }

io.on('connection', socket => {
  socket.on('createRoom', ({name}, cb=()=>{}) => {
    const code = makeCode();
    const room = { code, players:[{ id:socket.id, name:name || 'Joueur 1' }], started:false };
    rooms.set(code, room);
    socket.join(code);
    cb({ ok:true, code, room:publicRoom(room) });
    io.to(code).emit('roomState', publicRoom(room));
  });
  socket.on('joinRoom', ({name, code}, cb=()=>{}) => {
    code = String(code || '').trim();
    const room = rooms.get(code);
    if (!room) return cb({ ok:false, msg:'Salle introuvable' });
    if (!room.players.find(p => p.id === socket.id)) room.players.push({ id:socket.id, name:name || 'Joueur' });
    socket.join(code);
    cb({ ok:true, code, room:publicRoom(room) });
    io.to(code).emit('roomState', publicRoom(room));
  });
  socket.on('startGame', (code) => {
  const room = rooms.get(String(code || '').trim());
  if (!room) return;
  room.started = true;
  io.to(room.code).emit('roomState', publicRoom(room));
  io.to(room.code).emit('message', 'Partie lancée !');
});
  socket.on('disconnect', () => {
    for (const [code, room] of rooms) {
      const before = room.players.length;
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) rooms.delete(code);
      else if (room.players.length !== before) io.to(code).emit('roomState', publicRoom(room));
    }
  });
});

server.listen(process.env.PORT || 3000, () => console.log('UNO Perso Online prêt'));
