const socket=io();
let room=null, me=null;
const $=id=>document.getElementById(id);
function save(){ if(room&&me) localStorage.setItem('wwSession',JSON.stringify({code:room.code,playerId:me.id,name:me.name})); }
function cbErr(res){ if(!res?.ok) alert(res?.error||'Có lỗi xảy ra'); }
function joinUI(){ $('home').classList.add('hidden'); $('game').classList.remove('hidden'); }
$('create').onclick=()=>socket.emit('room:create',{name:$('name').value},res=>{if(!res.ok)return $('homeErr').textContent=res.error; socket.emit('room:join',{code:res.code,playerId:res.playerId,name:$('name').value},r=>{joinUI();});});
$('join').onclick=()=>socket.emit('room:join',{code:$('code').value,name:$('name').value},res=>{if(!res.ok)return $('homeErr').textContent=res.error; joinUI();});
$('leave').onclick=()=>socket.emit('room:leave',{},()=>{localStorage.removeItem('wwSession');location.reload();});

socket.on('room:update',r=>{room=r; joinUI(); $('roomCode').textContent=r.code; $('phase').textContent=`${r.phase}${r.day?` • Đêm/Ngày ${r.day}`:''}`;
 $('players').innerHTML=r.players.map(p=>`<div class="player ${p.alive?'':'dead'}"><span>${p.name}${p.isHost?' 👑':''}</span><span>${p.alive?'Đang sống':'Đã chết'}</span></div>`).join('');
 $('log').innerHTML=r.log.map(x=>`<div class="logline">${x}</div>`).join('');
 if(r.winner){$('winner').classList.remove('hidden');$('winner').innerHTML=`<h2>🏁 ${r.winner} thắng</h2>`;} else $('winner').classList.add('hidden'); renderActions();
});
socket.on('player:update',p=>{me=p; save(); $('roleBox').innerHTML=p.role?`<b>${p.role}</b>${p.loverId?'<div class="muted">Bạn đang có người yêu do Cupid ghép.</div>':''}`:'Chưa bắt đầu'; $('nightInfo').textContent=p.nightInfo||'';
 const sel=$('chatChannel'); const opts=['<option value="public">Chat chung</option>']; if(p.role==='Sói')opts.push('<option value="wolves">Chat phe Sói</option>'); if(p.role==='Ma cà rồng')opts.push('<option value="vampires">Chat Ma cà rồng</option>'); sel.innerHTML=opts.join(''); renderActions();
});
function aliveTargets(excludeSelf=true){return (room?.players||[]).filter(p=>p.alive&&(!excludeSelf||p.id!==me?.id));}
function targetButtons(type,label){return `<div class="action-grid">${aliveTargets().map(p=>`<button onclick="act('${type}','${p.id}')">${label} ${p.name}</button>`).join('')}</div>`}
window.act=(type,target)=>socket.emit('night:act',{type,target},cbErr);
function renderActions(){ if(!room||!me)return; const b=$('actionBody'); let html=''; const host=room.hostId===me.id;
 if(room.phase==='lobby') html=host?'<button onclick="startGame()">Bắt đầu ván</button>':'Chờ host bắt đầu.';
 else if(room.phase==='cupid'&&me.role==='Cupid') html=`<div class="muted">Chọn 2 người để ghép đôi:</div>${cupidUI()}`;
 else if(room.phase==='night'&&me.alive){ if(me.role==='Sói')html=targetButtons('wolf','Cắn'); else if(me.role==='Tiên tri')html=targetButtons('seer','Soi'); else if(me.role==='Bảo vệ')html=targetButtons('guard','Bảo vệ'); else if(me.role==='Ma cà rồng')html=targetButtons('vampire','Cắn'); else html='Bạn không có hành động trực tiếp đêm nay.'; if(host) html+='<hr><button onclick="resolveNight()">Host: Chốt hành động đêm</button>'; }
 else if(room.phase==='witch'){ if(me.role==='Phù thủy'&&me.alive) html=witchUI(); if(host) html+='<hr><button onclick="resolveDay()">Host: Sang ngày</button>'; }
 else if(room.phase==='day'&&me.alive){ html='<div class="muted">Vote treo cổ:</div>'+targetButtons('vote','Vote'); if(host) html+='<hr><button onclick="resolveVote()">Host: Chốt vote</button>'; }
 else if(room.phase==='ended'&&host) html='<button onclick="restart()">Chơi ván mới</button>';
 b.innerHTML=html||'Không có hành động.';
}
window.startGame=()=>socket.emit('game:start',{},cbErr); window.resolveNight=()=>socket.emit('night:resolve',{},cbErr); window.resolveDay=()=>socket.emit('day:resolve',{},cbErr); window.resolveVote=()=>socket.emit('vote:resolve',{},cbErr); window.restart=()=>socket.emit('game:restart',{},cbErr);
function cupidUI(){ const ps=aliveTargets(false); return `<select id="c1">${ps.map(p=>`<option value="${p.id}">${p.name}</option>`)}</select><select id="c2">${ps.map(p=>`<option value="${p.id}">${p.name}</option>`)}</select><button onclick="linkCupid()">Ghép đôi</button>`; }
window.linkCupid=()=>socket.emit('cupid:link',{a:$('c1').value,b:$('c2').value},cbErr);
function witchUI(){ const ps=aliveTargets(); return `<label><input id="heal" type="checkbox" style="width:auto"> Dùng bình cứu nạn nhân Sói</label><select id="poison"><option value="">Không dùng độc</option>${ps.map(p=>`<option value="${p.id}">Độc ${p.name}</option>`).join('')}</select><button onclick="witchAct()">Xác nhận</button>`; }
window.witchAct=()=>socket.emit('witch:act',{heal:$('heal').checked,poisonTarget:$('poison').value||null},cbErr);
window.act=(type,target)=>{ if(type==='vote')socket.emit('vote:cast',{target},cbErr); else socket.emit('night:act',{type,target},cbErr); };
$('sendChat').onclick=()=>{const m=$('chatInput').value.trim();if(!m)return;socket.emit('chat:send',{channel:$('chatChannel').value,message:m},()=>{$('chatInput').value='';});};
socket.on('chat:message',m=>{const d=document.createElement('div');d.className='chatmsg';d.textContent=`${m.from}: ${m.message}`;$('chatLog').appendChild(d);$('chatLog').scrollTop=999999;});
const sess=JSON.parse(localStorage.getItem('wwSession')||'null'); if(sess)socket.emit('room:join',sess,res=>{if(res.ok)joinUI();else localStorage.removeItem('wwSession');});
