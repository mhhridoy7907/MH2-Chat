
const firebaseConfig = {
  apiKey: "AIz**********************kjs",
  authDomain: "mh2-chat-9829f.firebaseapp.com",
  databaseURL: "https********************************e.app",
  projectId: "mh2-chat-9829f",
  storageBucket: "mh******************ot.com",
  messagingSenderId: "8************04",
  appId: "1:89899*************a925"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ── STATE ──
let myPhone = "", myName = "";
let currentChat = null, currentUserPhone = null, currentUserName = null;
let allContacts = [];
let typingTimer = null;
let lastMsgListeners = {};
let msgListener = null;
let ctxMsgKey = null, ctxMsgText = null;
let replyingTo = null;
let deletedKeys = {};

const COLORS = ["#1e6e8e","#d9614c","#7b5ea7","#e08a3c","#2e7d52","#c05780","#3a7ca5"];
function colorOf(phone) { let s=0; for(let c of phone) s+=c.charCodeAt(0); return COLORS[s%COLORS.length]; }
function initials(name) { return name.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase(); }
function fmtTime(ts) { if(!ts) return ""; const d=new Date(ts); return d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",hour12:true}); }
function fmtDate(ts) { if(!ts) return ""; const d=new Date(ts), n=new Date(); if(d.toDateString()===n.toDateString()) return "Today"; const y=new Date(n); y.setDate(n.getDate()-1); if(d.toDateString()===y.toDateString()) return "Yesterday"; return d.toLocaleDateString([],{day:"numeric",month:"short",year:"numeric"}); }
function chatId(p1,p2) { return [p1,p2].sort().join("_"); }

const EMOJIS = ["😀","😂","😍","🥰","😎","🤔","😢","😡","👍","👎","❤️","🔥","🎉","✅","❌","👋","🙏","💪","🤝","😴","🤣","😅","💯","🙈","🎊","✨","💬","📱","💻","🚀"];

function tickSVG(status) {
  if(status==="sent") return `<span class="tick sent"><svg viewBox="0 0 16 11"><path d="M11.07.88L5.77 9.1 3.09 6.42 1.67 7.83l4.19 4.17 6.78-10.56-1.57-0.56z" fill="#8696a0"/></svg></span>`;
  if(status==="delivered") return `<span class="tick delivered"><svg viewBox="0 0 16 11"><path d="M15.01.88l-1.57-.56L7.46 9.5 5.54 7.59l-1.07 1.06 3.1 3.11 7.44-10.88zM6.07.88L.77 9.1-.01 8.33l-1.42 1.41 4.19 4.17 6.78-10.56-1.57-0.56 0.01-.01z" fill="#8696a0"/></svg></span>`;
  if(status==="read") return `<span class="tick read"><svg viewBox="0 0 16 11"><path d="M15.01.88l-1.57-.56L7.46 9.5 5.54 7.59l-1.07 1.06 3.1 3.11 7.44-10.88zM6.07.88L.77 9.1-.01 8.33l-1.42 1.41 4.19 4.17 6.78-10.56-1.57-0.56 0.01-.01z" fill="#53bdeb"/></svg></span>`;
  return "";
}

// ── LOGIN ──
window.doLogin = function() {
  const name = document.getElementById("login-name").value.trim();
  const phone = document.getElementById("login-phone").value.trim().replace(/\s/g,"");
  const err = document.getElementById("login-err");
  if(!name){ err.textContent="Please enter your name"; return; }
  if(!phone || phone.length < 7){ err.textContent="Please enter a valid phone number"; return; }
  err.textContent="";
  myName = name; myPhone = phone;
  set(ref(db,"users/"+phone), { name, phone, online: true, lastSeen: Date.now() });
  window.addEventListener("beforeunload", () => {
    update(ref(db,"users/"+phone), { online: false, lastSeen: Date.now() });
  });
  document.getElementById("login-overlay").style.display="none";
  document.getElementById("my-avatar").textContent=initials(name);
  document.getElementById("my-avatar").style.background=colorOf(phone);
  document.getElementById("my-name-display").textContent=name;
  setupEmojiPicker();
  loadContacts();
  setInterval(pingOnline, 30000);
};

function pingOnline() {
  if(!myPhone) return;
  update(ref(db,"users/"+myPhone), { online: true, lastSeen: Date.now() });
}

// ── CONTACTS ──
function loadContacts() {
  onValue(ref(db,"users"), snap => {
    allContacts = [];
    snap.forEach(child => {
      const u = child.val();
      if(u.phone !== myPhone) allContacts.push(u);
    });
    renderContacts(allContacts);
  });
}

function renderContacts(list) {
  const div = document.getElementById("contacts-list");
  div.innerHTML = "";
  if(!list.length){ div.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:24px;font-size:14px;">No users yet</div>'; return; }
  list.forEach(u => {
    const cid = chatId(myPhone, u.phone);
    const el = document.createElement("div");
    el.className = "contact-item" + (currentUserPhone===u.phone?" active":"");
    el.id = "contact-"+u.phone;
    el.onclick = () => openChat(u.phone, u.name);
    const color = colorOf(u.phone);
    el.innerHTML = `
      <div class="contact-avatar" style="background:${color}">
        ${initials(u.name)}
        ${u.online?'<div class="online-dot"></div>':''}
      </div>
      <div class="contact-info">
        <div class="contact-top">
          <span class="contact-name">${escHtml(u.name)}</span>
          <span class="contact-time" id="ctime-${u.phone}"></span>
        </div>
        <div class="contact-bottom">
          <span class="contact-last-msg" id="clast-${u.phone}">Tap to chat</span>
          <span class="unread-badge" id="cunread-${u.phone}" style="display:none"></span>
        </div>
      </div>`;
    div.appendChild(el);
    listenLastMsg(cid, u.phone);
  });
}

function listenLastMsg(cid, phone) {
  if(lastMsgListeners[cid]) return;
  lastMsgListeners[cid] = true;
  onValue(ref(db,"chats/"+cid+"/last"), snap => {
    const v = snap.val(); if(!v) return;
    const timeEl = document.getElementById("ctime-"+phone);
    const lastEl = document.getElementById("clast-"+phone);
    if(timeEl) timeEl.textContent = fmtTime(v.time);
    if(lastEl) lastEl.textContent = (v.sender===myPhone?"You: ":"")+v.text;
  });
  onValue(ref(db,"chats/"+cid+"/unread/"+myPhone), snap => {
    const cnt = snap.val()||0;
    const badge = document.getElementById("cunread-"+phone);
    if(badge){ badge.style.display=cnt>0?"flex":"none"; badge.textContent=cnt>99?"99+":cnt; }
  });
}

window.filterContacts = function(q) {
  const filtered = q ? allContacts.filter(u=>u.name.toLowerCase().includes(q.toLowerCase())||u.phone.includes(q)) : allContacts;
  renderContacts(filtered);
};

// ── OPEN CHAT ──
function openChat(phone, name) {
  if(currentUserPhone===phone) return;
  currentUserPhone = phone; currentUserName = name; currentChat = chatId(myPhone, phone);
  document.querySelectorAll(".contact-item").forEach(e=>e.classList.remove("active"));
  const ci = document.getElementById("contact-"+phone);
  if(ci) ci.classList.add("active");

  const color = colorOf(phone);
  const avatarEl = document.getElementById("chat-header-avatar");
  avatarEl.textContent = initials(name);
  avatarEl.style.background = color;
  document.getElementById("chat-header-name").textContent = name;
  document.getElementById("chat-header").style.display="flex";
  document.getElementById("messages-box").style.display="block";
  document.getElementById("input-area").style.display="flex";
  document.getElementById("empty-state").style.display="none";
  document.getElementById("messages-box").innerHTML="";
  replyingTo = null;
  removeReplyBar();

  // Clear unread
  update(ref(db,"chats/"+currentChat+"/unread"), {[myPhone]:0});

  // Watch online/typing
  onValue(ref(db,"users/"+phone), snap => {
    const u = snap.val(); if(!u) return;
    const statusEl = document.getElementById("chat-header-status");
    if(u.typing===myPhone) {
      statusEl.textContent="typing..."; statusEl.className="online";
    } else if(u.online) {
      statusEl.textContent="online"; statusEl.className="online";
    } else {
      statusEl.textContent=u.lastSeen?"last seen "+fmtTime(u.lastSeen):"offline";
      statusEl.className="";
    }
  });

  if(msgListener) msgListener();
  loadMessages();
}

// ── MESSAGES ──
let renderedDates = {};
function loadMessages() {
  renderedDates = {};
  const box = document.getElementById("messages-box");
  if(msgListener) msgListener();
  msgListener = onChildAdded(ref(db,"chats/"+currentChat+"/messages"), snap => {
    const key = snap.key; const m = snap.val();
    if(deletedKeys[key]) return;
    appendMessage(key, m, box, true);
    // Mark as read
    if(m.sender !== myPhone && m.status !== "read") {
      update(ref(db,"chats/"+currentChat+"/messages/"+key), {status:"read"});
    }
  });
  // Listen for status updates
  onValue(ref(db,"chats/"+currentChat+"/messages"), snap => {
    snap.forEach(child => {
      const m = child.val(); const key = child.key;
      const tickEl = document.getElementById("tick-"+key);
      if(tickEl) tickEl.innerHTML = tickSVG(m.status||"sent");
    });
  });
}

function appendMessage(key, m, box, scroll) {
  if(!box) return;
  const isMe = m.sender === myPhone;
  const dateStr = fmtDate(m.time);
  if(!renderedDates[dateStr]) {
    renderedDates[dateStr]=true;
    const div=document.createElement("div");
    div.className="date-divider";
    div.innerHTML=`<span>${dateStr}</span>`;
    box.appendChild(div);
  }

  // Remove typing bubble if exists
  const tb = document.getElementById("typing-bubble");
  if(tb) tb.remove();

  const wrap = document.createElement("div");
  wrap.className="msg-wrap "+(isMe?"me":"them");
  wrap.id="wrap-"+key;

  let replyHtml="";
  if(m.replyTo) replyHtml=`<div style="background:rgba(0,0,0,0.2);border-left:3px solid var(--green);border-radius:4px;padding:4px 8px;margin-bottom:4px;font-size:12px;color:var(--text-muted);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(m.replyTo)}</div>`;

  wrap.innerHTML=`
    ${!isMe?`<div style="font-size:11px;color:${colorOf(m.sender)};margin-bottom:2px;padding:0 4px;">${escHtml(m.senderName)}</div>`:""}
    <div class="msg-bubble" id="msg-${key}" oncontextmenu="showCtxMenu(event,'${key}',\`${escJs(m.text)}\`)">
      ${replyHtml}
      <span>${escHtml(m.text)}</span>
      <div class="msg-meta">
        <span>${fmtTime(m.time)}</span>
        ${isMe?`<span id="tick-${key}">${tickSVG(m.status||"sent")}</span>`:""}
      </div>
    </div>
    <div class="msg-reactions" id="react-${key}"></div>`;

  box.appendChild(wrap);
  if(m.reactions) renderReactions(key, m.reactions);
  if(scroll) box.scrollTop=box.scrollHeight;
}

// ── SEND ──
window.sendMessage = function() {
  const input = document.getElementById("msg-input");
  const text = input.value.trim();
  if(!text||!currentChat) return;
  const msgRef = push(ref(db,"chats/"+currentChat+"/messages"));
  const payload = {
    sender: myPhone, senderName: myName,
    text, time: Date.now(), status:"sent"
  };
  if(replyingTo) { payload.replyTo=replyingTo; replyingTo=null; removeReplyBar(); }
  set(msgRef, payload);
  update(ref(db,"chats/"+currentChat+"/last"), {sender:myPhone,text,time:Date.now()});
  const unreadRef = ref(db,"chats/"+currentChat+"/unread/"+currentUserPhone);
  get(unreadRef).then(s=>{ update(ref(db,"chats/"+currentChat+"/unread"),{[currentUserPhone]:(s.val()||0)+1}); });
  // Mark sent → delivered after 1s
  setTimeout(()=>{ update(ref(db,"chats/"+currentChat+"/messages/"+msgRef.key),{status:"delivered"}); },1000);
  input.value=""; input.style.height="auto";
  stopTyping();
};

window.msgKeydown = function(e) {
  if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendMessage(); }
};

window.autoResize = function(el) {
  el.style.height="auto"; el.style.height=Math.min(el.scrollHeight,120)+"px";
};

// ── TYPING ──
window.sendTyping = function() {
  if(!myPhone||!currentUserPhone) return;
  update(ref(db,"users/"+myPhone),{typing:currentUserPhone});
  clearTimeout(typingTimer);
  typingTimer=setTimeout(stopTyping,2000);
};
function stopTyping() {
  if(!myPhone) return;
  update(ref(db,"users/"+myPhone),{typing:null});
}

// ── EMOJI ──
function setupEmojiPicker() {
  const picker=document.getElementById("emoji-picker");
  EMOJIS.forEach(e=>{
    const btn=document.createElement("div");
    btn.className="emoji-btn"; btn.textContent=e;
    btn.onclick=()=>{ insertEmoji(e); toggleEmojiPicker(); };
    picker.appendChild(btn);
  });
}
function insertEmoji(e) {
  const inp=document.getElementById("msg-input");
  const pos=inp.selectionStart;
  inp.value=inp.value.slice(0,pos)+e+inp.value.slice(inp.selectionEnd);
  inp.setSelectionRange(pos+e.length,pos+e.length);
  inp.focus();
}
window.toggleEmojiPicker=function(event) {
  const p=document.getElementById("emoji-picker");
  p.classList.toggle("open");
  if(event) event.stopPropagation();
};
document.addEventListener("click",()=>{ document.getElementById("emoji-picker")?.classList.remove("open"); });

// ── REACTIONS ──
function renderReactions(key, reactions) {
  const el=document.getElementById("react-"+key); if(!el) return;
  el.innerHTML="";
  const counts={};
  Object.values(reactions).forEach(r=>{ counts[r]=(counts[r]||0)+1; });
  Object.entries(counts).forEach(([emoji,count])=>{
    const pill=document.createElement("div");
    pill.className="reaction-pill";
    pill.textContent=emoji+(count>1?" "+count:"");
    pill.onclick=()=>sendReaction(key,emoji);
    el.appendChild(pill);
  });
}
function sendReaction(msgKey, emoji) {
  if(!myPhone||!currentChat) return;
  update(ref(db,"chats/"+currentChat+"/messages/"+msgKey+"/reactions"),{[myPhone]:emoji});
  onValue(ref(db,"chats/"+currentChat+"/messages/"+msgKey+"/reactions"), snap=>{
    renderReactions(msgKey,snap.val()||{});
  });
}

// ── CONTEXT MENU ──
window.showCtxMenu=function(e,key,text) {
  e.preventDefault();
  ctxMsgKey=key; ctxMsgText=text;
  const menu=document.getElementById("ctx-menu");
  menu.style.display="block";
  menu.classList.add("open");
  menu.style.left=Math.min(e.clientX,window.innerWidth-200)+"px";
  menu.style.top=Math.min(e.clientY,window.innerHeight-180)+"px";
};
document.addEventListener("click",()=>{ document.getElementById("ctx-menu").classList.remove("open"); });

window.ctxCopy=function() { if(ctxMsgText) navigator.clipboard.writeText(ctxMsgText); };
window.ctxReply=function() {
  if(!ctxMsgText) return;
  replyingTo=ctxMsgText;
  showReplyBar(ctxMsgText);
};
window.ctxDelete=function() {
  if(!ctxMsgKey||!currentChat) return;
  deletedKeys[ctxMsgKey]=true;
  const wrap=document.getElementById("wrap-"+ctxMsgKey);
  if(wrap) wrap.remove();
  showNotif("Message deleted for you");
};

function showReplyBar(text) {
  removeReplyBar();
  const bar=document.createElement("div");
  bar.id="reply-bar";
  bar.style="display:flex;align-items:center;gap:10px;background:var(--panel2);border-radius:8px 8px 0 0;padding:10px 14px;border-left:3px solid var(--green);font-size:13px;color:var(--text-muted);";
  bar.innerHTML=`<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">↩ ${escHtml(text)}</span><span onclick="cancelReply()" style="cursor:pointer;padding:2px 6px;border-radius:4px;background:var(--hover)">✕</span>`;
  document.getElementById("input-area").prepend(bar);
}
function removeReplyBar() { document.getElementById("reply-bar")?.remove(); }
window.cancelReply=function(){ replyingTo=null; removeReplyBar(); };

// ── NOTIFICATION ──
function showNotif(title, body) {
  const n=document.getElementById("notif");
  n.innerHTML=body?`<strong>${escHtml(title)}</strong>${escHtml(body)}`:`${escHtml(title)}`;
  n.classList.add("show");
  setTimeout(()=>n.classList.remove("show"),3500);
}

// Watch for new messages from others
onValue(ref(db,"chats"), snap => {
  snap.forEach(chatSnap => {
    if(!chatSnap.key.includes(myPhone)) return;
    const last = chatSnap.val()?.last;
    if(last&&last.sender!==myPhone&&last.time>(Date.now()-5000)) {
      if(chatSnap.key!==currentChat) {
        const phones=chatSnap.key.split("_");
        const otherPhone=phones.find(p=>p!==myPhone);
        const contact=allContacts.find(u=>u.phone===otherPhone);
        showNotif(contact?.name||"New message",last.text);
      }
    }
  });
});

// ── HELPERS ──
function escHtml(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function escJs(s) { return String(s||"").replace(/\\/g,"\\\\").replace(/`/g,"\\`").replace(/\$/g,"\\$"); }

window.toggleSearch=function(){ document.getElementById("search-input").focus(); };

// Enter key on login
document.getElementById("login-phone").addEventListener("keydown",e=>{ if(e.key==="Enter") doLogin(); });
document.getElementById("login-name").addEventListener("keydown",e=>{ if(e.key==="Enter") document.getElementById("login-phone").focus(); });
