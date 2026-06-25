import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut, onAuthStateChanged, updateProfile, deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, set, push, onValue, onChildAdded,
  get, update, remove, off, query, orderByKey
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getStorage, ref as sRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAMS45LQi5K-k_Yz0PUqb-noOqbOzj2a1w",
  authDomain: "mh22-chat.firebaseapp.com",
  databaseURL: "https://mh22-chat-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mh22-chat",
  storageBucket: "mh22-chat.firebasestorage.app",
  messagingSenderId: "863567518346",
  appId: "1:863567518346:web:bd36ee7da24514ecb1ab73",
  measurementId: "G-H04G5RHFTG"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getDatabase(fbApp);
const storage = getStorage(fbApp);

// ── STATE ──
let myUID=null, myEmail=null, myName=null, myBio=null, myPhoto=null, myPhone=null;
let currentChat=null, currentUserUID=null, currentUserName=null;
let allUsers=[];
let msgUnsubscribe=null;
let statusUnsubscribe=null;
let typingTimer=null;
let ctxMsgKey=null, ctxMsgData=null;
let replyingTo=null;
let pinnedMsgKey=null;
let starredMsgKeys={};
let blockedUsers={};
let mutedChats={};
let privacySettings={};
let forwardMsgData=null;
let editingKey=null;
let renderedDates={};
let darkMode=false;
let unreadListeners={};

// ── HELPERS ──
const COLORS=["#0B65D7","#38C7C0","#8B5CF6","#EC4899","#F59E0B","#10B981","#EF4444","#F97316"];
function colorOf(uid){let s=0;for(let c of String(uid||'')) s+=c.charCodeAt(0);return COLORS[s%COLORS.length];}
function initials(name){return String(name||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';}
function fmtTime(ts){if(!ts) return '';return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:true});}
function fmtDate(ts){
  if(!ts) return '';
  const d=new Date(ts),n=new Date();
  if(d.toDateString()===n.toDateString()) return 'Today';
  const y=new Date(n);y.setDate(n.getDate()-1);
  if(d.toDateString()===y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([],{day:'numeric',month:'short',year:'numeric'});
}
function fmtSize(b){if(b<1024) return b+'B';if(b<1048576) return (b/1024).toFixed(1)+'KB';return (b/1048576).toFixed(1)+'MB';}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function chatId(a,b){return [a,b].sort().join('_');}
function fileEmoji(ext){
  const map={PDF:'📄',DOC:'📝',DOCX:'📝',XLS:'📊',XLSX:'📊',PPT:'📊',PPTX:'📊',ZIP:'🗜️',RAR:'🗜️',MP3:'🎵',MP4:'🎬',AVI:'🎬',MOV:'🎬'};
  return map[ext]||'📎';
}

// ── PASSWORD STRENGTH ──
window.checkPassStrength=function(pw){
  const bar=document.getElementById('strength-bar');
  const fill=document.getElementById('strength-fill');
  const label=document.getElementById('strength-label');
  if(!pw){bar.style.display='none';label.style.display='none';return;}
  bar.style.display='block';label.style.display='block';
  let score=0;
  if(pw.length>=6) score++;
  if(pw.length>=8) score++;
  if(/[A-Z]/.test(pw)) score++;
  if(/[0-9]/.test(pw)) score++;
  if(/[^A-Za-z0-9]/.test(pw)) score++;
  const levels=[['#EF4444','20%','Weak'],['#F59E0B','40%','Fair'],['#F59E0B','60%','Good'],['#10B981','80%','Strong'],['#10B981','100%','Very Strong']];
  const [color,width,text]=levels[Math.min(score,4)];
  fill.style.width=width;fill.style.background=color;
  label.textContent=text;label.style.color=color;
};

window.togglePass=function(id,btn){
  const inp=document.getElementById(id);
  inp.type=inp.type==='password'?'text':'password';
  btn.querySelector('svg').style.opacity=inp.type==='text'?'0.4':'1';
};

// ── AUTH TABS ──
window.switchTab=function(tab){
  document.querySelectorAll('.auth-step').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.auth-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('step-'+tab).classList.add('active');
  document.getElementById('tab-'+tab).classList.add('active');
};
window.showStep=function(id){
  document.querySelectorAll('.auth-step').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
};
window.showForgotPass=function(){
  document.querySelectorAll('.auth-step').forEach(s=>s.classList.remove('active'));
  document.getElementById('step-forgot').classList.add('active');
};

// ── LOGIN ──
window.doLogin=async function(){
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  const err=document.getElementById('login-err');
  const btn=document.getElementById('login-btn');
  err.textContent='';
  if(!email||!email.includes('@')){err.textContent='Enter a valid email address';return;}
  if(!pass){err.textContent='Enter your password';return;}
  btn.classList.add('loading');btn.disabled=true;
  try{
    await signInWithEmailAndPassword(auth,email,pass);
    // onAuthStateChanged handles the rest
  }catch(e){
    const msgs={
      'auth/user-not-found':'No account with this email. Please register.',
      'auth/wrong-password':'Incorrect password. Try again.',
      'auth/invalid-credential':'Invalid email or password.',
      'auth/too-many-requests':'Too many attempts. Try again later.',
      'auth/user-disabled':'This account has been disabled.',
    };
    err.textContent=msgs[e.code]||'Login failed. Please try again.';
  }finally{btn.classList.remove('loading');btn.disabled=false;}
};

// ── REGISTER ──
window.doRegister=async function(){
  const name=document.getElementById('reg-name').value.trim();
  const phone=document.getElementById('reg-phone').value.trim();
  const email=document.getElementById('reg-email').value.trim();
  const pass=document.getElementById('reg-pass').value;
  const pass2=document.getElementById('reg-pass2').value;
  const err=document.getElementById('reg-err');
  const btn=document.getElementById('reg-btn');
  err.textContent='';
  if(!name){err.textContent='Enter your name';return;}
  if(!phone){err.textContent='Enter your phone number';return;}
  if(!email||!email.includes('@')){err.textContent='Enter a valid email address';return;}
  if(pass.length<6){err.textContent='Password must be at least 6 characters';return;}
  if(pass!==pass2){err.textContent='Passwords do not match';return;}
  btn.classList.add('loading');btn.disabled=true;
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,pass);
    const uid=cred.user.uid;
    await updateProfile(cred.user,{displayName:name});
    await set(ref(db,'users/'+uid),{
      uid,name,email,phone,
      bio:"Hey there! I'm using MH2 Chat",
      photo:null,online:true,
      lastSeen:Date.now(),typing:null,createdAt:Date.now()
    });
    // onAuthStateChanged handles the rest
  }catch(e){
    const msgs={
      'auth/email-already-in-use':'This email is already registered. Sign in instead.',
      'auth/invalid-email':'Enter a valid email address.',
      'auth/weak-password':'Password is too weak. Use at least 6 characters.',
    };
    err.textContent=msgs[e.code]||'Registration failed. Please try again.';
  }finally{btn.classList.remove('loading');btn.disabled=false;}
};

// ── FORGOT PASSWORD ──
window.doForgotPass=async function(){
  const email=document.getElementById('forgot-email').value.trim();
  const err=document.getElementById('forgot-err');
  const suc=document.getElementById('forgot-success');
  const btn=document.getElementById('forgot-btn');
  err.textContent='';suc.textContent='';
  if(!email||!email.includes('@')){err.textContent='Enter a valid email address';return;}
  btn.classList.add('loading');btn.disabled=true;
  try{
    await sendPasswordResetEmail(auth,email);
    suc.textContent='Reset link sent! Check your email inbox.';
    setTimeout(()=>showStep('step-login'),3000);
  }catch(e){
    err.textContent='Could not send reset email. Check the address and try again.';
  }finally{btn.classList.remove('loading');btn.disabled=false;}
};

// ── AUTH STATE LISTENER ──
onAuthStateChanged(auth,async user=>{
  document.getElementById('splash').classList.add('hide');
  if(user){
    myUID=user.uid;myEmail=user.email;
    await loadMyProfile();
    initApp();
  } else {
    document.getElementById('auth-overlay').classList.add('show');
    document.getElementById('app').classList.remove('show');
  }
});

// ── LOAD MY PROFILE ──
async function loadMyProfile(){
  const snap=await get(ref(db,'users/'+myUID));
  const u=snap.val()||{};
  myName=u.name||auth.currentUser?.displayName||'User';
  myBio=u.bio||'';
  myPhoto=u.photo||null;
  myPhone=u.phone||'';
}

// ── INIT APP ──
function initApp(){
  document.getElementById('auth-overlay').classList.remove('show');
  document.getElementById('app').classList.add('show');
  renderMyAvatar();
  update(ref(db,'users/'+myUID),{online:true,lastSeen:Date.now()});
  const heartbeat=setInterval(()=>{
    if(myUID) update(ref(db,'users/'+myUID),{online:true,lastSeen:Date.now()});
  },30000);
  window.addEventListener('beforeunload',()=>{
    clearInterval(heartbeat);
    update(ref(db,'users/'+myUID),{online:false,lastSeen:Date.now(),typing:null});
  });
  // Load settings
  get(ref(db,'settings/'+myUID)).then(snap=>{
    const s=snap.val()||{};
    darkMode=!!s.darkMode;
    if(darkMode){document.body.classList.add('dark-mode');document.getElementById('dark-toggle').classList.add('on');}
    privacySettings=s.privacy||{};
    if(privacySettings.hideOnline) document.getElementById('toggle-hideOnline').classList.add('on');
    if(privacySettings.hideLastSeen) document.getElementById('toggle-hideLastSeen').classList.add('on');
    mutedChats=s.mutedChats||{};
    blockedUsers=s.blockedUsers||{};
  });
  if(Notification.permission==='granted') document.getElementById('toggle-notif').classList.add('on');
  loadContacts();
  setupEmojiPicker();
  setupReactionPicker();
}

function renderMyAvatar(){
  const el=document.getElementById('my-avatar');
  if(myPhoto){el.innerHTML=`<img src="${esc(myPhoto)}" alt="">`;}
  else{el.textContent=initials(myName);el.style.background=colorOf(myUID);}
}

// ── CONTACTS ──
function loadContacts(){
  onValue(ref(db,'users'),snap=>{
    allUsers=[];
    snap.forEach(c=>{const u=c.val();if(u.uid&&u.uid!==myUID) allUsers.push(u);});
    renderContacts(allUsers);
  });
}

function renderContacts(list){
  const div=document.getElementById('contacts-list');
  Object.values(unreadListeners).forEach(fn=>fn&&fn());
  unreadListeners={};
  const visible=list.filter(u=>!blockedUsers[u.uid]);
  if(!visible.length){
    div.innerHTML=`<div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div><p>No contacts yet.<br>Share the app to get started!</p></div>`;
    return;
  }
  div.innerHTML=`<div class="contacts-section-label">Chats</div>`;
  visible.forEach(u=>{
    const el=document.createElement('div');
    el.className='contact-item'+(currentUserUID===u.uid?' active':'');
    el.id='contact-'+u.uid;
    el.onclick=()=>openChat(u.uid,u.name);
    const color=colorOf(u.uid);
    const avHTML=u.photo?`<img src="${esc(u.photo)}" alt="">`:initials(u.name||'?');
    el.innerHTML=`
      <div class="c-avatar" style="background:${color}">${avHTML}${u.online?'<div class="online-dot"></div>':''}</div>
      <div class="c-info">
        <div class="c-top">
          <span class="c-name">${esc(u.name||'User')}</span>
          <span class="c-time" id="ctime-${u.uid}"></span>
        </div>
        <div class="c-bottom">
          <span class="c-last" id="clast-${u.uid}">Tap to chat</span>
          <span class="unread-badge" id="cunread-${u.uid}" style="display:none"></span>
        </div>
      </div>`;
    div.appendChild(el);
    listenLastMsg(u.uid);
    listenUnread(u.uid);
  });
}

function listenLastMsg(uid){
  const cid=chatId(myUID,uid);
  onValue(ref(db,'chats/'+cid+'/meta'),snap=>{
    const v=snap.val();if(!v) return;
    const te=document.getElementById('ctime-'+uid);
    const le=document.getElementById('clast-'+uid);
    if(te) te.textContent=fmtTime(v.lastTime);
    if(le) le.textContent=(v.lastSender===myUID?'You: ':'')+(v.lastMsg||'');
  });
}

function listenUnread(uid){
  const cid=chatId(myUID,uid);
  const unsubscribe=onValue(ref(db,'chats/'+cid+'/unread/'+myUID),snap=>{
    const cnt=snap.val()||0;
    const badge=document.getElementById('cunread-'+uid);
    if(badge){
      badge.style.display=cnt>0?'flex':'none';
      badge.textContent=cnt>99?'99+':String(cnt);
    }
    if(cnt>0&&currentUserUID!==uid&&Notification.permission==='granted'&&!mutedChats[cid]){
      const u=allUsers.find(x=>x.uid===uid);
      if(u) showBrowserNotif(u.name);
    }
  });
  unreadListeners[uid]=unsubscribe;
}

window.filterContacts=function(q){
  const f=q?allUsers.filter(u=>
    (u.name||'').toLowerCase().includes(q.toLowerCase())||
    (u.email||'').toLowerCase().includes(q.toLowerCase())||
    (u.phone||'').includes(q)
  ):allUsers;
  renderContacts(f);
};

// ── OPEN CHAT ──
window.openChat=function(uid,name){
  if(msgUnsubscribe){msgUnsubscribe();msgUnsubscribe=null;}
  if(statusUnsubscribe){statusUnsubscribe();statusUnsubscribe=null;}
  if(currentUserUID&&currentUserUID!==uid) update(ref(db,'users/'+myUID),{typing:null});

  currentUserUID=uid;currentUserName=name;
  currentChat=chatId(myUID,uid);

  document.querySelectorAll('.contact-item').forEach(e=>e.classList.remove('active'));
  const ci=document.getElementById('contact-'+uid);
  if(ci) ci.classList.add('active');

  document.getElementById('sidebar').classList.add('mobile-hidden');

  const u=allUsers.find(x=>x.uid===uid)||{};
  const av=document.getElementById('chat-hdr-av');
  if(u.photo){av.innerHTML=`<img src="${esc(u.photo)}" alt="">`;}
  else{av.textContent=initials(name);av.style.background=colorOf(uid);}
  document.getElementById('chat-hdr-name').textContent=esc(name);

  document.getElementById('chat-welcome').style.display='none';
  document.getElementById('chat-header').style.display='flex';
  document.getElementById('messages-box').style.display='block';
  document.getElementById('input-area').classList.add('show');
  document.getElementById('messages-box').innerHTML='';
  document.getElementById('starred-panel').classList.remove('show');
  document.getElementById('star-btn').classList.remove('active');
  renderedDates={};
  cancelReply();
  editingKey=null;

  update(ref(db,'chats/'+currentChat+'/unread'),{[myUID]:0});

  statusUnsubscribe=onValue(ref(db,'users/'+uid),snap=>{
    const u2=snap.val()||{};
    const statusEl=document.getElementById('chat-hdr-status');
    if(!statusEl) return;
    if(u2.typing===myUID){
      statusEl.textContent='typing…';statusEl.className='chat-hdr-status online';
    } else if(u2.online&&!privacySettings.hideOnline){
      statusEl.textContent='online';statusEl.className='chat-hdr-status online';
    } else if(!privacySettings.hideLastSeen&&u2.lastSeen){
      statusEl.textContent='last seen '+fmtTime(u2.lastSeen);statusEl.className='chat-hdr-status';
    } else {
      statusEl.textContent='';statusEl.className='chat-hdr-status';
    }
  });

  get(ref(db,'chats/'+currentChat+'/meta')).then(snap=>{
    const m=snap.val()||{};
    pinnedMsgKey=m.pinnedKey||null;
    starredMsgKeys=m.starred||{};
    if(pinnedMsgKey&&m.pinnedText){
      document.getElementById('pinned-text').textContent=m.pinnedText;
      document.getElementById('pinned-banner').classList.add('show');
    } else {
      document.getElementById('pinned-banner').classList.remove('show');
    }
  });

  get(ref(db,'settings/'+myUID+'/blockedUsers')).then(snap=>{blockedUsers=snap.val()||{};});
  get(ref(db,'settings/'+myUID+'/mutedChats')).then(snap=>{mutedChats=snap.val()||{};});
  loadMessages();
};

window.closeMobileChat=function(){
  if(msgUnsubscribe){msgUnsubscribe();msgUnsubscribe=null;}
  if(statusUnsubscribe){statusUnsubscribe();statusUnsubscribe=null;}
  update(ref(db,'users/'+myUID),{typing:null});
  document.getElementById('sidebar').classList.remove('mobile-hidden');
  document.getElementById('chat-header').style.display='none';
  document.getElementById('messages-box').style.display='none';
  document.getElementById('input-area').classList.remove('show');
  document.getElementById('chat-welcome').style.display='flex';
  document.getElementById('pinned-banner').classList.remove('show');
  currentUserUID=null;currentChat=null;
};

// ── LOAD MESSAGES ──
function loadMessages(){
  if(msgUnsubscribe){msgUnsubscribe();msgUnsubscribe=null;}
  const box=document.getElementById('messages-box');
  const cid=currentChat;

  get(ref(db,'chats/'+cid+'/messages')).then(snap=>{
    if(cid!==currentChat) return;
    box.innerHTML='';renderedDates={};
    if(snap.exists()){
      snap.forEach(child=>{
        const m=child.val();
        if(m.deletedFor&&m.deletedFor[myUID]) return;
        appendMessage(child.key,m,box,false);
        if(m.sender!==myUID&&m.status!=='read')
          update(ref(db,'chats/'+cid+'/messages/'+child.key),{status:'read'});
      });
      box.scrollTop=box.scrollHeight;
    }

    let first=true;
    msgUnsubscribe=onChildAdded(query(ref(db,'chats/'+cid+'/messages'),orderByKey()),snap2=>{
      if(first){first=false;return;}
      const m=snap2.val();
      if(cid!==currentChat) return;
      if(m.deletedFor&&m.deletedFor[myUID]) return;
      if(document.getElementById('wrap-'+snap2.key)) return;
      appendMessage(snap2.key,m,box,true);
      if(m.sender!==myUID&&m.status!=='read')
        update(ref(db,'chats/'+cid+'/messages/'+snap2.key),{status:'read'});
    });

    onValue(ref(db,'chats/'+cid+'/messages'),snap3=>{
      if(cid!==currentChat) return;
      snap3.forEach(child=>{
        const m=child.val(),k=child.key;
        const tickEl=document.getElementById('tick-'+k);
        if(tickEl) tickEl.innerHTML=tickSVG(m.status||'sent');
        if(m.reactions){
          const re=document.getElementById('react-'+k);
          if(re) renderReactions(k,m.reactions);
        }
        if(m.edited){
          const bubble=document.getElementById('msg-'+k);
          if(bubble){
            const s=bubble.querySelector('.msg-text');
            if(s) s.textContent=m.text||'';
          }
        }
        if(m.deletedForAll){
          const bubble=document.getElementById('msg-'+k);
          if(bubble){
            const s=bubble.querySelector('.msg-text');
            if(s){s.textContent='This message was deleted';s.style.fontStyle='italic';s.style.opacity='0.7';}
          }
        }
        if(m.deletedFor&&m.deletedFor[myUID])
          document.getElementById('wrap-'+k)?.remove();
      });
    });
  });
}

function appendMessage(key,m,box,scroll){
  if(!box) return;
  const isMe=m.sender===myUID;
  const dateStr=fmtDate(m.time);
  if(!renderedDates[dateStr]){
    renderedDates[dateStr]=true;
    const dd=document.createElement('div');
    dd.className='date-divider';
    dd.innerHTML=`<span>${esc(dateStr)}</span>`;
    box.appendChild(dd);
  }

  const wrap=document.createElement('div');
  wrap.className='msg-wrap '+(isMe?'me':'them');
  wrap.id='wrap-'+key;

  let replyHtml='';
  if(m.replyTo) replyHtml=`<div class="reply-quote">↩ ${esc(m.replyTo)}</div>`;

  let fwdHtml='';
  if(m.forwarded) fwdHtml=`<div class="forward-tag"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>Forwarded</div>`;

  let contentHtml='';
  if(m.type==='image'){
    contentHtml=`<img class="msg-image" src="${esc(m.url||'')}" alt="Image" onclick="openMediaViewer('${esc(m.url||'')}')"><div style="font-size:12px;opacity:0.65;margin-top:2px;">${esc(m.fileName||'Image')}</div>`;
  } else if(m.type==='file'){
    const ext=(m.fileName||'').split('.').pop().toUpperCase();
    contentHtml=`<div class="file-pill" onclick="window.open('${esc(m.url||'')}','_blank')">
      <div class="file-icon">${fileEmoji(ext)}</div>
      <div class="file-meta"><div class="file-name">${esc(m.fileName||'File')}</div><div class="file-size">${esc(m.fileSize||'')} · ${esc(ext)}</div></div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    </div>`;
  } else {
    contentHtml=`<span class="msg-text">${esc(m.text||'')}</span>${m.edited?'<span class="edited-tag">(edited)</span>':''}`;
  }

  wrap.innerHTML=`
    ${!isMe?`<div style="font-size:11px;font-weight:700;color:${colorOf(m.sender)};margin-bottom:3px;padding:0 4px;">${esc(m.senderName||currentUserName||'')}</div>`:''}
    <div class="msg-bubble" id="msg-${key}" oncontextmenu="showCtxMenu(event,'${key}')">
      ${fwdHtml}${replyHtml}${contentHtml}
      <div class="msg-meta">
        <span>${fmtTime(m.time)}</span>
        ${isMe?`<span id="tick-${key}">${tickSVG(m.status||'sent')}</span>`:''}
      </div>
    </div>
    <div class="msg-reactions" id="react-${key}"></div>`;

  box.appendChild(wrap);
  if(m.reactions) renderReactions(key,m.reactions);
  if(scroll){
    const near=box.scrollHeight-box.scrollTop-box.clientHeight<200;
    if(near||isMe) box.scrollTop=box.scrollHeight;
  }
}

function tickSVG(status){
  if(status==='sent') return `<svg viewBox="0 0 16 11"><path d="M11 1L5.5 9 3 6.5 1.5 8l4 4 7-11-1.5-1z" fill="#94A3B8"/></svg>`;
  if(status==='delivered') return `<svg viewBox="0 0 20 11"><path d="M18 1l-9 9-3-3-1.5 1.5L9 12 19.5 2z" fill="#94A3B8"/><path d="M8 9L2 3.5.5 5l7 7L18 1l-1.5-1.5z" fill="#94A3B8" opacity="0.5"/></svg>`;
  if(status==='read') return `<svg viewBox="0 0 20 11"><path d="M18 1l-9 9-3-3-1.5 1.5L9 12 19.5 2z" fill="#38C7C0"/><path d="M8 9L2 3.5.5 5l7 7L18 1l-1.5-1.5z" fill="#38C7C0" opacity="0.6"/></svg>`;
  return '';
}

// ── SEND MESSAGE ──
window.sendMessage=async function(){
  if(!currentChat) return;
  if(editingKey){await finishEdit();return;}
  const input=document.getElementById('msg-input');
  const text=input.value.trim();
  if(!text) return;
  if(blockedUsers[currentUserUID]){showToast('You have blocked this user','🚫');return;}

  const msgRef=push(ref(db,'chats/'+currentChat+'/messages'));
  const payload={sender:myUID,senderName:myName,text,time:Date.now(),status:'sent',type:'text'};
  if(replyingTo){payload.replyTo=replyingTo;cancelReply();}
  input.value='';input.style.height='auto';
  stopTyping();

  await set(msgRef,payload);
  await update(ref(db,'chats/'+currentChat+'/meta'),{
    lastMsg:text.substring(0,60),lastSender:myUID,lastTime:Date.now()
  });
  const unreadSnap=await get(ref(db,'chats/'+currentChat+'/unread/'+currentUserUID));
  await update(ref(db,'chats/'+currentChat+'/unread'),{[currentUserUID]:(unreadSnap.val()||0)+1});
  setTimeout(()=>{
    if(msgRef.key) update(ref(db,'chats/'+currentChat+'/messages/'+msgRef.key),{status:'delivered'});
  },1500);
};

window.msgKeydown=function(e){
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}
};
window.autoResize=function(el){
  el.style.height='auto';el.style.height=Math.min(el.scrollHeight,120)+'px';
};

// ── TYPING ──
window.sendTyping=function(){
  if(!myUID||!currentUserUID) return;
  update(ref(db,'users/'+myUID),{typing:currentUserUID});
  clearTimeout(typingTimer);
  typingTimer=setTimeout(stopTyping,2500);
};
function stopTyping(){
  clearTimeout(typingTimer);
  if(myUID) update(ref(db,'users/'+myUID),{typing:null});
}

// ── UPLOADS ──
window.triggerImageUpload=()=>document.getElementById('img-input').click();
window.triggerFileUpload=()=>document.getElementById('file-input').click();

window.handleImageUpload=async function(input){
  const file=input.files[0];if(!file) return;
  if(file.size>10*1024*1024){showToast('Image too large (max 10MB)','❌');return;}
  closeAttachMenu();showToast('Uploading image…','📤');
  try{
    const storRef=sRef(storage,`media/${currentChat}/${Date.now()}_${file.name}`);
    await uploadBytes(storRef,file);
    const url=await getDownloadURL(storRef);
    const msgRef=push(ref(db,'chats/'+currentChat+'/messages'));
    await set(msgRef,{sender:myUID,senderName:myName,time:Date.now(),status:'sent',type:'image',url,fileName:file.name});
    await update(ref(db,'chats/'+currentChat+'/meta'),{lastMsg:'📷 Image',lastSender:myUID,lastTime:Date.now()});
    const us=await get(ref(db,'chats/'+currentChat+'/unread/'+currentUserUID));
    await update(ref(db,'chats/'+currentChat+'/unread'),{[currentUserUID]:(us.val()||0)+1});
    showToast('Image sent!','✅');
  }catch(e){showToast('Upload failed. Check Firebase Storage rules.','❌');}
  input.value='';
};

window.handleFileUpload=async function(input){
  const file=input.files[0];if(!file) return;
  if(file.size>25*1024*1024){showToast('File too large (max 25MB)','❌');return;}
  closeAttachMenu();showToast('Uploading file…','📤');
  try{
    const storRef=sRef(storage,`files/${currentChat}/${Date.now()}_${file.name}`);
    await uploadBytes(storRef,file);
    const url=await getDownloadURL(storRef);
    const msgRef=push(ref(db,'chats/'+currentChat+'/messages'));
    await set(msgRef,{sender:myUID,senderName:myName,time:Date.now(),status:'sent',type:'file',url,fileName:file.name,fileSize:fmtSize(file.size)});
    await update(ref(db,'chats/'+currentChat+'/meta'),{lastMsg:'📎 '+file.name,lastSender:myUID,lastTime:Date.now()});
    const us=await get(ref(db,'chats/'+currentChat+'/unread/'+currentUserUID));
    await update(ref(db,'chats/'+currentChat+'/unread'),{[currentUserUID]:(us.val()||0)+1});
    showToast('File sent!','✅');
  }catch(e){showToast('Upload failed. Check Firebase Storage rules.','❌');}
  input.value='';
};

// ── PROFILE PICTURE ──
window.triggerProfilePicUpload=()=>document.getElementById('profile-pic-input').click();
window.handleProfilePic=async function(input){
  const file=input.files[0];if(!file) return;
  if(file.size>5*1024*1024){showToast('Photo too large (max 5MB)','❌');return;}
  showToast('Uploading…','📤');
  try{
    const storRef=sRef(storage,`avatars/${myUID}`);
    await uploadBytes(storRef,file);
    const url=await getDownloadURL(storRef);
    myPhoto=url;
    await update(ref(db,'users/'+myUID),{photo:url});
    renderMyAvatar();
    const pp=document.getElementById('profile-pic-display');
    pp.innerHTML=`<img src="${esc(url)}" alt=""><div class="pic-overlay">📷</div>`;
    showToast('Photo updated!','✅');
  }catch(e){showToast('Upload failed.','❌');}
  input.value='';
};

// ── CONTEXT MENU ──
window.showCtxMenu=function(e,key){
  e.preventDefault();e.stopPropagation();
  ctxMsgKey=key;
  get(ref(db,'chats/'+currentChat+'/messages/'+key)).then(snap=>{
    ctxMsgData=snap.val()||{};
    const isMe=ctxMsgData.sender===myUID;
    const isStar=!!starredMsgKeys[key];
    const isPin=pinnedMsgKey===key;
    const menu=document.getElementById('ctx-menu');
    menu.innerHTML=`
      <div class="ctx-item" onclick="ctxReply()">↩ Reply</div>
      <div class="ctx-item" onclick="ctxCopy()">📋 Copy</div>
      <div class="ctx-item" onclick="ctxForward()">↗ Forward</div>
      <div class="ctx-item" onclick="ctxStar()">${isStar?'☆ Unstar':'⭐ Star'}</div>
      <div class="ctx-item" onclick="ctxPin()">${isPin?'📌 Unpin':'📌 Pin'}</div>
      ${isMe?`<div class="ctx-item" onclick="ctxEdit()">✏️ Edit</div>`:''}
      <div class="ctx-item" onclick="ctxReact()">😊 React</div>
      <div class="ctx-divider"></div>
      <div class="ctx-item danger" onclick="ctxDeleteForMe()">🗑 Delete for me</div>
      ${isMe?`<div class="ctx-item danger" onclick="ctxDeleteForAll()">🗑 Delete for everyone</div>`:''}
    `;
    const x=Math.min(e.clientX,window.innerWidth-225);
    const y=Math.min(e.clientY,window.innerHeight-320);
    menu.style.left=x+'px';menu.style.top=y+'px';
    menu.classList.add('open');
  });
};

window.ctxReply=function(){
  if(!ctxMsgData) return;
  replyingTo=ctxMsgData.text||'[Media]';
  const container=document.getElementById('reply-preview-container');
  container.innerHTML=`<div class="reply-preview-bar"><div class="rp-text">↩ ${esc(replyingTo)}</div><button class="rp-close" onclick="cancelReply()">✕</button></div>`;
  document.getElementById('msg-input').focus();
  closeCtx();
};
window.ctxCopy=function(){
  if(ctxMsgData?.text) navigator.clipboard?.writeText(ctxMsgData.text).catch(()=>{});
  showToast('Copied!','📋');closeCtx();
};
window.ctxForward=function(){forwardMsgData=ctxMsgData;openForwardModal();closeCtx();};
window.ctxStar=async function(){
  if(!ctxMsgKey||!currentChat) return;
  if(starredMsgKeys[ctxMsgKey]){delete starredMsgKeys[ctxMsgKey];showToast('Unstarred','☆');}
  else{starredMsgKeys[ctxMsgKey]=true;showToast('Starred!','⭐');}
  await update(ref(db,'chats/'+currentChat+'/meta'),{starred:starredMsgKeys});
  closeCtx();
};
window.ctxPin=async function(){
  if(!ctxMsgKey||!currentChat) return;
  if(pinnedMsgKey===ctxMsgKey){
    pinnedMsgKey=null;
    await update(ref(db,'chats/'+currentChat+'/meta'),{pinnedKey:null,pinnedText:null});
    document.getElementById('pinned-banner').classList.remove('show');
    showToast('Unpinned','📌');
  } else {
    pinnedMsgKey=ctxMsgKey;
    const txt=(ctxMsgData?.text||'[Media]').substring(0,80);
    await update(ref(db,'chats/'+currentChat+'/meta'),{pinnedKey:ctxMsgKey,pinnedText:txt});
    document.getElementById('pinned-text').textContent=txt;
    document.getElementById('pinned-banner').classList.add('show');
    showToast('Pinned!','📌');
  }
  closeCtx();
};
window.ctxEdit=function(){
  if(!ctxMsgData||ctxMsgData.sender!==myUID) return;
  if(ctxMsgData.type!=='text'){showToast('Can only edit text messages','ℹ️');return;}
  editingKey=ctxMsgKey;
  const input=document.getElementById('msg-input');
  input.value=ctxMsgData.text||'';
  input.focus();
  showToast('Editing… press Enter to save','✏️');
  closeCtx();
};
async function finishEdit(){
  if(!editingKey||!currentChat) return;
  const text=document.getElementById('msg-input').value.trim();
  if(!text){editingKey=null;return;}
  await update(ref(db,'chats/'+currentChat+'/messages/'+editingKey),{text,edited:true});
  editingKey=null;
  document.getElementById('msg-input').value='';
  document.getElementById('msg-input').style.height='auto';
  showToast('Message edited','✅');
}
window.ctxReact=function(){
  const menu=document.getElementById('ctx-menu');
  const rect=menu.getBoundingClientRect();
  openReactionPicker(rect.left,rect.top-60,ctxMsgKey);
  closeCtx();
};
window.ctxDeleteForMe=async function(){
  if(!ctxMsgKey||!currentChat) return;
  await update(ref(db,'chats/'+currentChat+'/messages/'+ctxMsgKey+'/deletedFor'),{[myUID]:true});
  document.getElementById('wrap-'+ctxMsgKey)?.remove();
  showToast('Deleted for you','🗑');closeCtx();
};
window.ctxDeleteForAll=function(){
  showConfirm('Delete for everyone?','This will delete the message for all participants.',async()=>{
    if(!ctxMsgKey||!currentChat) return;
    await update(ref(db,'chats/'+currentChat+'/messages/'+ctxMsgKey),{text:'This message was deleted',type:'text',deletedForAll:true});
    showToast('Deleted for everyone','🗑');
  });
  closeCtx();
};
function closeCtx(){document.getElementById('ctx-menu').classList.remove('open');}

// ── REACTIONS ──
const REACT_EMOJIS=['❤️','😂','😮','😢','👍','👎','🔥','🎉'];
function setupReactionPicker(){
  const rp=document.getElementById('reaction-picker');
  rp.innerHTML='';
  REACT_EMOJIS.forEach(e=>{
    const d=document.createElement('button');
    d.className='rp-emoji';d.textContent=e;d.type='button';
    d.onclick=()=>sendReaction(rp.dataset.msgKey,e);
    rp.appendChild(d);
  });
}
function openReactionPicker(x,y,key){
  const rp=document.getElementById('reaction-picker');
  rp.dataset.msgKey=key;
  rp.style.left=Math.min(x,window.innerWidth-320)+'px';
  rp.style.top=Math.max(y,10)+'px';
  rp.classList.add('open');
}
window.sendReaction=function(key,emoji){
  if(!key||!currentChat) return;
  update(ref(db,'chats/'+currentChat+'/messages/'+key+'/reactions'),{[myUID]:emoji});
  document.getElementById('reaction-picker').classList.remove('open');
  showToast('Reacted '+emoji,'');
};
function renderReactions(key,reactions){
  const el=document.getElementById('react-'+key);if(!el) return;
  el.innerHTML='';
  const counts={};
  Object.entries(reactions).forEach(([uid,emoji])=>{
    if(!counts[emoji]) counts[emoji]={count:0,mine:false};
    counts[emoji].count++;
    if(uid===myUID) counts[emoji].mine=true;
  });
  Object.entries(counts).forEach(([emoji,{count,mine}])=>{
    const pill=document.createElement('div');
    pill.className='reaction-pill';
    if(mine) pill.style.borderColor='var(--primary)';
    pill.innerHTML=`${emoji}<span class="r-count">${count}</span>`;
    const k=key;pill.onclick=()=>sendReaction(k,emoji);
    el.appendChild(pill);
  });
}

// ── EMOJI PICKER ──
const EMOJIS=['😀','😂','😍','🥰','😎','🤔','😢','😡','👍','👎','❤️','🔥','🎉','✅','❌','👋','🙏','💪','🤝','😴','🤣','😅','💯','🙈','🎊','✨','💬','📱','💻','🚀','🌟','💎','🎵','🎮','🍕','☕','🌸','🦋','🎯','⚡'];
function setupEmojiPicker(){
  const picker=document.getElementById('emoji-picker');
  picker.innerHTML='';
  EMOJIS.forEach(e=>{
    const btn=document.createElement('button');
    btn.className='ep-btn';btn.textContent=e;btn.type='button';
    btn.onclick=()=>{insertEmoji(e);document.getElementById('emoji-picker').classList.remove('open');};
    picker.appendChild(btn);
  });
}
function insertEmoji(e){
  const inp=document.getElementById('msg-input');
  const pos=inp.selectionStart||0;
  inp.value=inp.value.slice(0,pos)+e+inp.value.slice(inp.selectionEnd);
  inp.setSelectionRange(pos+e.length,pos+e.length);
  inp.focus();autoResize(inp);
}
window.toggleEmojiPicker=function(ev){ev?.stopPropagation();document.getElementById('emoji-picker').classList.toggle('open');};
window.toggleAttachMenu=function(ev){ev?.stopPropagation();document.getElementById('attach-menu').classList.toggle('open');};
function closeAttachMenu(){document.getElementById('attach-menu').classList.remove('open');}
window.cancelReply=function(){replyingTo=null;document.getElementById('reply-preview-container').innerHTML='';};

document.addEventListener('click',()=>{
  document.getElementById('emoji-picker')?.classList.remove('open');
  document.getElementById('attach-menu')?.classList.remove('open');
  document.getElementById('ctx-menu')?.classList.remove('open');
  document.getElementById('reaction-picker')?.classList.remove('open');
  document.getElementById('chat-ctx-menu')?.classList.remove('open');
});

// ── SEARCH ──
window.toggleChatSearch=function(){
  const bar=document.getElementById('chat-search-bar');
  bar.classList.toggle('show');
  if(bar.classList.contains('show')) document.getElementById('chat-search-input').focus();
  else{document.getElementById('chat-search-input').value='';clearSearchHighlights();}
};
window.searchMessages=function(q){
  clearSearchHighlights();
  document.getElementById('search-result-info').textContent='';
  if(!q.trim()) return;
  const bubbles=document.querySelectorAll('.msg-bubble');
  const hits=[];
  bubbles.forEach(b=>{
    if(b.textContent.toLowerCase().includes(q.toLowerCase())){
      b.style.outline='2.5px solid var(--secondary)';b.style.outlineOffset='2px';
      hits.push(b);
    }
  });
  document.getElementById('search-result-info').textContent=hits.length?`${hits.length} result(s)`:'No results';
  if(hits.length) hits[0].scrollIntoView({behavior:'smooth',block:'center'});
};
function clearSearchHighlights(){
  document.querySelectorAll('.msg-bubble').forEach(b=>{b.style.outline='';b.style.outlineOffset='';});
}

// ── STARRED PANEL ──
window.toggleStarredPanel=function(){
  const panel=document.getElementById('starred-panel');
  panel.classList.toggle('show');
  if(panel.classList.contains('show')){
    document.getElementById('star-btn').classList.add('active');
    loadStarredMessages();
  } else {
    document.getElementById('star-btn').classList.remove('active');
  }
};
async function loadStarredMessages(){
  const list=document.getElementById('starred-list');
  if(!currentChat||!Object.keys(starredMsgKeys).length){
    list.innerHTML='<div class="empty-state" style="padding:24px"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg></div><p>No starred messages yet</p></div>';
    return;
  }
  list.innerHTML='<div style="padding:14px 12px;color:var(--text-muted);font-size:13px;">Loading…</div>';
  const items=[];
  for(const key of Object.keys(starredMsgKeys)){
    const snap=await get(ref(db,'chats/'+currentChat+'/messages/'+key));
    if(snap.exists()) items.push({key,m:snap.val()});
  }
  if(!items.length){
    list.innerHTML='<div class="empty-state" style="padding:24px"><p>No starred messages</p></div>';
    return;
  }
  list.innerHTML='';
  items.forEach(({key,m})=>{
    const el=document.createElement('div');
    el.style.cssText='padding:13px;border-bottom:1px solid var(--border);cursor:pointer;border-radius:10px;transition:background 0.15s;';
    el.onmouseover=()=>el.style.background='var(--hover)';
    el.onmouseout=()=>el.style.background='';
    el.innerHTML=`
      <div style="font-size:12px;color:var(--primary);font-weight:700;margin-bottom:5px;">${esc(m.senderName||'')}</div>
      <div style="font-size:14px;color:var(--text);">${esc((m.text||'[Media]').substring(0,120))}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:5px;">${fmtTime(m.time)} · ${fmtDate(m.time)}</div>`;
    el.onclick=()=>document.getElementById('wrap-'+key)?.scrollIntoView({behavior:'smooth',block:'center'});
    list.appendChild(el);
  });
}

// ── PIN ──
window.scrollToPinned=function(){if(pinnedMsgKey) document.getElementById('wrap-'+pinnedMsgKey)?.scrollIntoView({behavior:'smooth',block:'center'});};
window.unpinAll=async function(){
  pinnedMsgKey=null;
  await update(ref(db,'chats/'+currentChat+'/meta'),{pinnedKey:null,pinnedText:null});
  document.getElementById('pinned-banner').classList.remove('show');
  showToast('Unpinned','📌');
};

// ── MEDIA VIEWER ──
window.openMediaViewer=function(url){
  document.getElementById('media-img').src=url;
  document.getElementById('media-viewer').classList.add('show');
};
window.closeMediaViewer=function(){
  document.getElementById('media-viewer').classList.remove('show');
  setTimeout(()=>{document.getElementById('media-img').src='';},300);
};

// ── FORWARD ──
function openForwardModal(){
  const list=document.getElementById('fw-list');
  list.innerHTML='';
  allUsers.forEach(u=>{
    const el=document.createElement('div');
    el.className='fw-item';
    const avHTML=u.photo?`<img src="${esc(u.photo)}" alt="">`:initials(u.name);
    el.innerHTML=`<div class="fw-av" style="background:${colorOf(u.uid)}">${avHTML}</div><div class="fw-name">${esc(u.name)}</div>`;
    el.onclick=()=>forwardTo(u.uid,u.name);
    list.appendChild(el);
  });
  document.getElementById('forward-modal').classList.add('show');
}
window.closeForward=()=>document.getElementById('forward-modal').classList.remove('show');
async function forwardTo(uid,name){
  if(!forwardMsgData) return;
  const cid=chatId(myUID,uid);
  const msgRef=push(ref(db,'chats/'+cid+'/messages'));
  const payload={sender:myUID,senderName:myName,time:Date.now(),status:'sent',type:'text',forwarded:true};
  if(forwardMsgData.type==='text') payload.text=forwardMsgData.text||'';
  else{payload.type=forwardMsgData.type;payload.url=forwardMsgData.url||'';payload.fileName=forwardMsgData.fileName||'File';payload.fileSize=forwardMsgData.fileSize||'';}
  await set(msgRef,payload);
  const lastMsg=forwardMsgData.type==='image'?'📷 Image':(forwardMsgData.text||'📎 File').substring(0,60);
  await update(ref(db,'chats/'+cid+'/meta'),{lastMsg,lastSender:myUID,lastTime:Date.now()});
  const us=await get(ref(db,'chats/'+cid+'/unread/'+uid));
  await update(ref(db,'chats/'+cid+'/unread'),{[uid]:(us.val()||0)+1});
  closeForward();showToast('Forwarded to '+name,'↗');
}

// ── PROFILE ──
window.openProfile=function(){
  document.getElementById('edit-name').value=myName||'';
  document.getElementById('edit-bio').value=myBio||'';
  document.getElementById('edit-phone').value=myPhone||'';
  document.getElementById('edit-email').value=myEmail||'';
  const pp=document.getElementById('profile-pic-display');
  if(myPhoto){pp.innerHTML=`<img src="${esc(myPhoto)}" alt=""><div class="pic-overlay">📷</div>`;}
  else{pp.innerHTML=`<span style="font-size:34px;font-weight:900">${initials(myName)}</span><div class="pic-overlay">📷</div>`;pp.style.background=colorOf(myUID);}
  document.getElementById('profile-overlay').classList.add('show');
};
window.closeProfile=()=>document.getElementById('profile-overlay').classList.remove('show');
window.saveProfile=async function(){
  const name=document.getElementById('edit-name').value.trim();
  const bio=document.getElementById('edit-bio').value.trim();
  const phone=document.getElementById('edit-phone').value.trim();
  if(!name){showToast('Name is required','❌');return;}
  myName=name;myBio=bio;myPhone=phone;
  await update(ref(db,'users/'+myUID),{name,bio,phone});
  await updateProfile(auth.currentUser,{displayName:name});
  renderMyAvatar();
  closeProfile();showToast('Profile saved!','✅');
};

// ── CHAT PROFILE ──
window.openChatProfile=function(){
  if(!currentUserUID) return;
  const u=allUsers.find(x=>x.uid===currentUserUID)||{};
  const pp=document.getElementById('chat-profile-pic');
  if(u.photo){pp.innerHTML=`<img src="${esc(u.photo)}" alt="">`;}
  else{pp.innerHTML=`<span style="font-size:30px;font-weight:900">${initials(u.name||'?')}</span>`;pp.style.background=colorOf(currentUserUID);}
  document.getElementById('chat-profile-name').textContent=u.name||'';
  document.getElementById('chat-profile-bio').textContent=u.bio||'';
  document.getElementById('chat-profile-phone').textContent=u.phone||'';
  document.getElementById('block-btn-label').textContent=blockedUsers[currentUserUID]?'Unblock User':'Block User';
  document.getElementById('mute-btn-label').textContent=mutedChats[currentChat]?'Unmute Notifications':'Mute Notifications';
  document.getElementById('chat-profile-overlay').classList.add('show');
};
window.closeChatProfile=()=>document.getElementById('chat-profile-overlay').classList.remove('show');

// ── BLOCK ──
window.toggleBlock=async function(){
  if(!currentUserUID) return;
  if(blockedUsers[currentUserUID]){delete blockedUsers[currentUserUID];showToast('User unblocked','✅');document.getElementById('block-btn-label').textContent='Block User';}
  else{blockedUsers[currentUserUID]=true;showToast('User blocked','🚫');document.getElementById('block-btn-label').textContent='Unblock User';}
  await set(ref(db,'settings/'+myUID+'/blockedUsers'),blockedUsers);
  closeChatProfile();
};

// ── MUTE ──
window.muteCurrent=async function(){
  if(!currentChat) return;
  if(mutedChats[currentChat]){delete mutedChats[currentChat];showToast('Unmuted','🔔');document.getElementById('mute-btn-label').textContent='Mute Notifications';}
  else{mutedChats[currentChat]=true;showToast('Muted','🔇');document.getElementById('mute-btn-label').textContent='Unmute Notifications';}
  await set(ref(db,'settings/'+myUID+'/mutedChats'),mutedChats);
};

// ── SETTINGS ──
window.openSettings=()=>document.getElementById('settings-overlay').classList.add('show');
window.closeSettings=()=>document.getElementById('settings-overlay').classList.remove('show');
window.toggleDarkMode=function(){
  darkMode=!darkMode;
  document.body.classList.toggle('dark-mode',darkMode);
  document.getElementById('dark-toggle').classList.toggle('on',darkMode);
  if(myUID) update(ref(db,'settings/'+myUID),{darkMode});
};
window.togglePrivacy=async function(key){
  privacySettings[key]=!privacySettings[key];
  document.getElementById('toggle-'+key).classList.toggle('on',!!privacySettings[key]);
  if(myUID) await set(ref(db,'settings/'+myUID+'/privacy'),privacySettings);
  showToast('Privacy setting updated','✅');
};
window.requestNotifPermission=function(){
  Notification.requestPermission().then(p=>{
    document.getElementById('toggle-notif').classList.toggle('on',p==='granted');
    document.getElementById('notif-permission-text').textContent=p==='granted'?'Notifications enabled':'Notifications disabled';
    showToast(p==='granted'?'Notifications enabled!':'Permission denied',p==='granted'?'🔔':'🔕');
  });
};
window.clearCurrentChat=function(){
  if(!currentChat){showToast('Open a chat first','ℹ️');closeSettings();return;}
  showConfirm('Clear this chat?','All messages will be removed for you only.',async()=>{
    closeSettings();
    const snap=await get(ref(db,'chats/'+currentChat+'/messages'));
    const updates={};
    snap.forEach(c=>{updates[c.key+'/deletedFor/'+myUID]=true;});
    await update(ref(db,'chats/'+currentChat+'/messages'),updates);
    document.getElementById('messages-box').innerHTML='';
    renderedDates={};
    showToast('Chat cleared','🗑');
  });
};
window.logout=function(){
  showConfirm('Logout?','You will be signed out of your account.',async()=>{
    if(myUID) await update(ref(db,'users/'+myUID),{online:false,lastSeen:Date.now(),typing:null});
    await signOut(auth);
  });
};
window.deleteAccount=function(){
  showConfirm('Delete Account?','This permanently deletes your account and all data. This cannot be undone.',async()=>{
    try{
      await remove(ref(db,'users/'+myUID));
      await remove(ref(db,'settings/'+myUID));
      await deleteUser(auth.currentUser);
    }catch(e){showToast('Delete failed. Re-login and try again.','❌');}
  });
};

// ── CHAT HEADER MENU ──
window.openChatMenu=function(e){
  e.stopPropagation();
  const menu=document.getElementById('chat-ctx-menu');
  menu.innerHTML=`
    <div class="ctx-item" onclick="openChatProfile();document.getElementById('chat-ctx-menu').classList.remove('open')">👤 Contact Info</div>
    <div class="ctx-item" onclick="toggleStarredPanel();document.getElementById('chat-ctx-menu').classList.remove('open')">⭐ Starred Messages</div>
    <div class="ctx-item" onclick="muteCurrent();document.getElementById('chat-ctx-menu').classList.remove('open')">🔇 Mute / Unmute</div>
    <div class="ctx-divider"></div>
    <div class="ctx-item danger" onclick="clearCurrentChat();document.getElementById('chat-ctx-menu').classList.remove('open')">🗑 Clear Chat</div>
  `;
  menu.style.right='16px';menu.style.top='68px';menu.style.left='auto';
  menu.classList.add('open');
};

// ── CONFIRM DIALOG ──
let confirmCb=null;
function showConfirm(title,msg,cb){
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-msg').textContent=msg;
  confirmCb=cb;
  document.getElementById('confirm-dialog').classList.add('show');
}
window.closeConfirm=function(){document.getElementById('confirm-dialog').classList.remove('show');confirmCb=null;};
document.getElementById('confirm-ok').onclick=function(){if(confirmCb){confirmCb();confirmCb=null;}closeConfirm();};

// ── BROWSER NOTIFICATIONS ──
function showBrowserNotif(from){
  if(Notification.permission==='granted'&&document.hidden){
    try{new Notification('MH2 Chat',{body:`New message from ${from}`});}catch(e){}
  }
}

// ── TOAST ──
let toastTimer=null;
window.showToast=function(msg,icon='✓'){
  const t=document.getElementById('toast');
  document.getElementById('toast-text').textContent=msg;
  t.querySelector('.t-icon').textContent=icon||'✓';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),3000);
};

// ── ESC ──
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    closeCtx();
    ['reaction-picker','emoji-picker','attach-menu'].forEach(id=>document.getElementById(id)?.classList.remove('open'));
    ['forward-modal','chat-profile-overlay','profile-overlay','settings-overlay','media-viewer','confirm-dialog'].forEach(id=>document.getElementById(id)?.classList.remove('show'));
    document.getElementById('starred-panel')?.classList.remove('show');
    document.getElementById('star-btn')?.classList.remove('active');
    document.getElementById('chat-ctx-menu')?.classList.remove('open');
  }
});
