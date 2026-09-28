const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static('public'));

const rooms = new Map();
const ROLE = {
  VILLAGER: 'Dân', WOLF: 'Sói', SEER: 'Tiên tri', GUARD: 'Bảo vệ', WITCH: 'Phù thủy',
  LITTLE_GIRL: 'Ti Hí', CUPID: 'Cupid', VAMPIRE: 'Ma cà rồng'
};

function code() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }
function token() { return crypto.randomBytes(16).toString('hex'); }
function shuffle(a) { return [...a].sort(() => Math.random() - 0.5); }
function roomPublic(r) {
  return {
    code: r.code, phase: r.phase, day: r.day, started: r.started,
    hostId: r.hostId,
    players: [...r.players.values()].map(p => ({ id:p.id, name:p.name, alive:p.alive, isHost:p.id===r.hostId })),
    log: r.log.slice(-30), winner: r.winner || null
  };
}
function getPlayer(r, socket) {
  const pid = socket.data.playerId;
  if (!pid) return null;
  return r.players.get(pid) || null;
}
function emitRoom(r) { io.to(r.code).emit('room:update', roomPublic(r)); }
function privateState(r, p) {
  return {
    id:p.id, name:p.name, role:p.role, alive:p.alive, loverId:p.loverId || null,
    potions: p.potions || null,
    teammates:[...r.players.values()].filter(x => x.alive && x.id!==p.id && (
      (p.role===ROLE.WOLF && x.role===ROLE.WOLF) || (p.role===ROLE.VAMPIRE && x.role===ROLE.VAMPIRE)
    )).map(x=>({id:x.id,name:x.name})),
    nightInfo:p.nightInfo || null
  };
}
function emitPrivate(r) {
  for (const p of r.players.values()) {
    if (p.socketId) io.to(p.socketId).emit('player:update', privateState(r,p));
  }
}
function alive(r) { return [...r.players.values()].filter(p=>p.alive); }
function wolves(r) { return alive(r).filter(p=>p.role===ROLE.WOLF); }
function vampires(r) { return alive(r).filter(p=>p.role===ROLE.VAMPIRE); }
function villageAlive(r) { return alive(r).filter(p=>p.role!==ROLE.WOLF && p.role!==ROLE.VAMPIRE); }
function announce(r, msg) { r.log.push(msg); emitRoom(r); }

function setupRoles(n) {
  const roles = [];
  const wolves = n >= 10 ? 3 : n >= 7 ? 2 : 1;
  for(let i=0;i<wolves;i++) roles.push(ROLE.WOLF);
  if(n>=5) roles.push(ROLE.SEER);
  if(n>=6) roles.push(ROLE.GUARD);
  if(n>=7) roles.push(ROLE.WITCH);
  if(n>=8) roles.push(ROLE.CUPID);
  if(n>=9) roles.push(ROLE.LITTLE_GIRL);
  if(n>=10) roles.push(ROLE.VAMPIRE);
  while(roles.length<n) roles.push(ROLE.VILLAGER);
  return shuffle(roles);
}
function checkWin(r) {
  const a = alive(r);
  const vs = vampires(r);
  const ws = wolves(r);
  const villagers = villageAlive(r);
  if (a.length===1 && vs.length===1) return 'Ma cà rồng';
  if (ws.length===0 && vs.length===0) return 'Dân làng';
  if (ws.length>0 && ws.length>=villagers.length + vs.length) return 'Sói';
  return null;
}
function revealAndEnd(r, winner) {
  r.winner = winner; r.phase='ended'; r.started=false;
  r.log.push(`🏁 Kết thúc ván. Phe thắng: ${winner}`);
  r.log.push('🎭 Role: ' + [...r.players.values()].map(p=>`${p.name} = ${p.role}`).join(' | '));
  emitRoom(r); emitPrivate(r);
}
function maybeEnd(r) { const w=checkWin(r); if(w){ revealAndEnd(r,w); return true; } return false; }

function killPlayer(r, pid, cause, deaths=[]) {
  const p = r.players.get(pid); if(!p || !p.alive) return deaths;
  p.alive=false; deaths.push({id:p.id,name:p.name,cause});
  if (p.loverId) {
    const lover = r.players.get(p.loverId);
    if (lover && lover.alive) killPlayer(r, lover.id, 'chết theo người yêu', deaths);
  }
  return deaths;
}

io.on('connection', socket => {
  socket.on('room:create', ({name}, cb) => {
    let c; do { c=code(); } while(rooms.has(c));
    const pid=token();
    const r={code:c,hostId:pid,players:new Map(),phase:'lobby',day:0,started:false,log:['Phòng đã được tạo.'],actions:{},history:[]};
    const p={id:pid,name:(name||'Host').trim(),alive:true,role:null,socketId:socket.id};
    r.players.set(pid,p); rooms.set(c,r); socket.join(c); socket.data={roomCode:c,playerId:pid};
    cb({ok:true,code:c,playerId:pid}); emitRoom(r); emitPrivate(r);
  });

  socket.on('room:join', ({code:raw,name,playerId}, cb) => {
    const c=(raw||'').toUpperCase(); const r=rooms.get(c); if(!r) return cb({ok:false,error:'Không tìm thấy phòng.'});
    if(r.started && !playerId) return cb({ok:false,error:'Ván đã bắt đầu.'});
    let p = playerId ? r.players.get(playerId) : null;
    if(!p){
      if(r.started) return cb({ok:false,error:'Ván đã bắt đầu.'});
      const pid=token(); p={id:pid,name:(name||'Player').trim(),alive:true,role:null,socketId:socket.id}; r.players.set(pid,p); playerId=pid;
    } else { p.socketId=socket.id; }
    socket.join(c); socket.data={roomCode:c,playerId}; cb({ok:true,code:c,playerId}); emitRoom(r); emitPrivate(r);
  });

  socket.on('room:leave', (_,cb)=>{
    const r=rooms.get(socket.data.roomCode); if(!r) return cb?.({ok:true});
    const p=getPlayer(r,socket); if(!p) return cb?.({ok:true});
    if(r.started){ p.socketId=null; } else {
      r.players.delete(p.id);
      if(r.hostId===p.id){ const next=[...r.players.keys()][0]; r.hostId=next||null; }
      if(r.players.size===0) rooms.delete(r.code);
    }
    socket.leave(r.code); emitRoom(r); cb?.({ok:true});
  });

  socket.on('game:start', (_,cb)=>{
    const r=rooms.get(socket.data.roomCode); const p=r&&getPlayer(r,socket);
    if(!r||!p||p.id!==r.hostId) return cb({ok:false,error:'Chỉ host được bắt đầu.'});
    if(r.players.size<5) return cb({ok:false,error:'Cần ít nhất 5 người.'});
    const roles=setupRoles(r.players.size); let i=0;
    for(const pl of r.players.values()){
      pl.role=roles[i++]; pl.alive=true; pl.loverId=null; pl.nightInfo=null;
      pl.potions=pl.role===ROLE.WITCH?{heal:true,poison:true}:null;
    }
    r.started=true; r.phase='cupid'; r.day=0; r.actions={}; r.winner=null;
    r.log=['🎮 Ván mới bắt đầu. Role đã được phát riêng.'];
    const cupid=[...r.players.values()].find(x=>x.role===ROLE.CUPID);
    if(!cupid){ r.phase='night'; r.day=1; r.log.push('🌙 Đêm 1 bắt đầu.'); }
    emitRoom(r); emitPrivate(r); cb({ok:true});
  });

  socket.on('cupid:link', ({a,b},cb)=>{
    const r=rooms.get(socket.data.roomCode); const p=r&&getPlayer(r,socket);
    if(!r||!p||p.role!==ROLE.CUPID||r.phase!=='cupid') return cb({ok:false,error:'Không thể ghép đôi lúc này.'});
    if(a===b || !r.players.get(a) || !r.players.get(b)) return cb({ok:false,error:'Chọn 2 người khác nhau.'});
    r.players.get(a).loverId=b; r.players.get(b).loverId=a; r.phase='night'; r.day=1; r.actions={};
    r.log.push('💘 Cupid đã ghép một cặp đôi.'); r.log.push('🌙 Đêm 1 bắt đầu.'); emitRoom(r); emitPrivate(r); cb({ok:true});
  });

  socket.on('night:act', ({type,target},cb)=>{
    const r=rooms.get(socket.data.roomCode); const p=r&&getPlayer(r,socket);
    if(!r||!p||!p.alive||r.phase!=='night') return cb({ok:false,error:'Không thể hành động lúc này.'});
    const t=r.players.get(target); if(!t||!t.alive) return cb({ok:false,error:'Mục tiêu không hợp lệ.'});
    r.actions[p.id]={type,target};
    if(type==='seer' && p.role===ROLE.SEER){
      const shown = t.role===ROLE.WOLF ? 'Phe Sói' : 'Phe Dân làng';
      p.nightInfo=`🔮 ${t.name}: ${shown}`;
    }
    cb({ok:true}); emitPrivate(r);
  });

  socket.on('night:resolve', (_,cb)=>{
    const r=rooms.get(socket.data.roomCode); const host=r&&getPlayer(r,socket);
    if(!r||!host||host.id!==r.hostId||r.phase!=='night') return cb({ok:false,error:'Chỉ host được chốt đêm.'});
    const a=[...r.actions.entries()];
    const guardAct=a.find(([pid,x])=>r.players.get(pid)?.role===ROLE.GUARD && x.type==='guard');
    const protectedId=guardAct?.[1].target;
    const wolfActs=a.filter(([pid,x])=>r.players.get(pid)?.role===ROLE.WOLF && x.type==='wolf');
    let wolfVictim=null;
    if(wolfActs.length){
      const counts={}; for(const [,x] of wolfActs) counts[x.target]=(counts[x.target]||0)+1;
      wolfVictim=Object.entries(counts).sort((x,y)=>y[1]-x[1])[0][0];
    }
    const vampireAct=a.find(([pid,x])=>r.players.get(pid)?.role===ROLE.VAMPIRE && x.type==='vampire');
    const vampireVictim=vampireAct?.[1].target || null;

    // Ti Hí chỉ thấy nạn nhân Sói cắn vào đêm chẵn.
    for(const pl of r.players.values()) if(pl.role===ROLE.LITTLE_GIRL) pl.nightInfo=null;
    if(r.day%2===0 && wolfVictim){
      const victim=r.players.get(wolfVictim);
      for(const pl of r.players.values()) if(pl.role===ROLE.LITTLE_GIRL && pl.alive) pl.nightInfo=`👀 Đêm chẵn: Sói đã chọn cắn ${victim.name}.`;
    }

    const witch=[...r.players.values()].find(x=>x.role===ROLE.WITCH && x.alive);
    if(witch && witch.socketId){
      witch.nightInfo = wolfVictim ? `🧪 Nạn nhân Sói: ${r.players.get(wolfVictim)?.name}. Bạn có thể cứu người này nếu còn bình cứu.` : '🧪 Đêm nay Sói chưa chốt được nạn nhân.';
    }

    r.pending={wolfVictim,vampireVictim,protectedId}; r.phase='witch'; emitRoom(r); emitPrivate(r); cb({ok:true});
  });

  socket.on('witch:act', ({heal,poisonTarget},cb)=>{
    const r=rooms.get(socket.data.roomCode); const p=r&&getPlayer(r,socket);
    if(!r||!p||p.role!==ROLE.WITCH||r.phase!=='witch') return cb({ok:false,error:'Không thể dùng thuốc lúc này.'});
    r.actions.witchFinal={heal:!!heal,poisonTarget:poisonTarget||null}; cb({ok:true});
  });

  socket.on('day:resolve', (_,cb)=>{
    const r=rooms.get(socket.data.roomCode); const host=r&&getPlayer(r,socket);
    if(!r||!host||host.id!==r.hostId||r.phase!=='witch') return cb({ok:false,error:'Chỉ host được sang ngày.'});
    const {wolfVictim,vampireVictim,protectedId}=r.pending||{};
    const witch=[...r.players.values()].find(x=>x.role===ROLE.WITCH);
    const wa=r.actions.witchFinal||{};
    let deaths=[];
    if(wolfVictim){
      const savedByGuard=wolfVictim===protectedId;
      const savedByWitch=witch?.potions?.heal && wa.heal;
      if(savedByWitch) witch.potions.heal=false;
      if(!savedByGuard && !savedByWitch) killPlayer(r,wolfVictim,'bị Sói cắn',deaths);
    }
    if(vampireVictim){
      // Chỉ Bảo vệ cứu được nạn nhân Ma cà rồng.
      if(vampireVictim!==protectedId) killPlayer(r,vampireVictim,'bị Ma cà rồng cắn',deaths);
    }
    if(witch?.potions?.poison && wa.poisonTarget){ witch.potions.poison=false; killPlayer(r,wa.poisonTarget,'trúng độc',deaths); }
    r.phase='day'; r.actions={}; r.pending=null;
    if(deaths.length) r.log.push('☀️ Trời sáng. ' + deaths.map(d=>`${d.name} đã chết (${d.cause})`).join('; ')); else r.log.push('☀️ Trời sáng. Không ai chết.');
    if(!maybeEnd(r)){ emitRoom(r); emitPrivate(r); } cb({ok:true});
  });

  socket.on('vote:cast', ({target},cb)=>{
    const r=rooms.get(socket.data.roomCode); const p=r&&getPlayer(r,socket); const t=r?.players.get(target);
    if(!r||!p||!p.alive||r.phase!=='day'||!t?.alive) return cb({ok:false,error:'Không thể vote.'});
    r.actions[p.id]={type:'vote',target}; cb({ok:true});
  });

  socket.on('vote:resolve', (_,cb)=>{
    const r=rooms.get(socket.data.roomCode); const host=r&&getPlayer(r,socket);
    if(!r||!host||host.id!==r.hostId||r.phase!=='day') return cb({ok:false,error:'Chỉ host được chốt vote.'});
    const counts={}; for(const [pid,x] of Object.entries(r.actions)){
      if(x.type==='vote' && r.players.get(pid)?.alive) counts[x.target]=(counts[x.target]||0)+1;
    }
    const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]); let deaths=[];
    if(ranked.length && (ranked.length===1 || ranked[0][1]>ranked[1][1])) killPlayer(r,ranked[0][0],'bị treo cổ',deaths);
    if(deaths.length) r.log.push('🗳️ ' + deaths.map(d=>`${d.name} đã chết (${d.cause})`).join('; ')); else r.log.push('🗳️ Không ai bị treo cổ.');
    if(!maybeEnd(r)){ r.day+=1; r.phase='night'; r.actions={}; r.log.push(`🌙 Đêm ${r.day} bắt đầu.`); emitRoom(r); emitPrivate(r); }
    cb({ok:true});
  });

  socket.on('chat:send', ({channel,message},cb)=>{
    const r=rooms.get(socket.data.roomCode); const p=r&&getPlayer(r,socket);
    if(!r||!p||!message?.trim()) return;
    const msg={from:p.name,message:message.trim(),channel};
    if(channel==='wolves' && p.role===ROLE.WOLF){
      for(const x of r.players.values()) if(x.role===ROLE.WOLF && x.socketId) io.to(x.socketId).emit('chat:message',msg);
    } else if(channel==='vampires' && p.role===ROLE.VAMPIRE){
      for(const x of r.players.values()) if(x.role===ROLE.VAMPIRE && x.socketId) io.to(x.socketId).emit('chat:message',msg);
    } else if(channel==='public') io.to(r.code).emit('chat:message',msg);
    cb?.({ok:true});
  });

  socket.on('game:restart', (_,cb)=>{
    const r=rooms.get(socket.data.roomCode); const p=r&&getPlayer(r,socket);
    if(!r||!p||p.id!==r.hostId) return cb({ok:false,error:'Chỉ host được restart.'});
    for(const pl of r.players.values()){ pl.role=null; pl.alive=true; pl.loverId=null; pl.nightInfo=null; pl.potions=null; }
    r.phase='lobby'; r.started=false; r.day=0; r.actions={}; r.pending=null; r.winner=null; r.log=['🔄 Đã reset phòng.']; emitRoom(r); emitPrivate(r); cb({ok:true});
  });

  socket.on('disconnect',()=>{
    const r=rooms.get(socket.data.roomCode); if(!r) return; const p=getPlayer(r,socket); if(p) p.socketId=null;
  });
});

const PORT=process.env.PORT || 3000;
server.listen(PORT,()=>console.log(`Werewolf web running on :${PORT}`));
