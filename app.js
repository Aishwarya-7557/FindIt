/* ══════════════════════════════════════════════
   FindIt – Campus Lost & Found  |  app.js
   Auth: login/register by name+contact.
   Post requires auth. Edit/Delete/MarkFound
   only available to the item's owner.
   Found items show who found them.
══════════════════════════════════════════════ */

const firebaseConfig = {
  apiKey: "AIzaSyBargKKlwO7I5ndpS8PhGYT0RnXn3MsCYg",
  authDomain: "findit-f0be8.firebaseapp.com",
  projectId: "findit-f0be8",
  storageBucket: "findit-f0be8.firebasestorage.app",
  messagingSenderId: "527176734171",
  appId: "1:527176734171:web:71cafb8abd43e4a70303fe",
  measurementId: "G-LRTLSH79Q6"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const CAT_ICONS = {
  'ID Card': '🪪', 'Phone': '📱', 'Books': '📚',
  'Wallet': '👛', 'Keys': '🔑', 'Laptop': '💻', 'Other': '📦'
};

/* ── STATE ── */
let items = [];
let currentUser = null;        // Firebase User object or null

let lostCat = 'all';
let foundCat = 'all';
let lostSort = 'newest';
let selectedType = 'lost';
let postImg = null;
let editImg = null;
let editingId = null;
let pendingAuthCallback = null; // fn to call after login
let markingFoundId = null;

/* ══════════════════════════════════
   DATABASE
══════════════════════════════════ */
function loadDB() {
  auth.onAuthStateChanged(user => {
    currentUser = user;
    renderNav();
    renderLost();
    renderFound();
  });

  db.collection('items').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    items = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    updateStats();
    renderLost();
    renderFound();
  });
}

/* ══════════════════════════════════
   AUTH HELPERS
══════════════════════════════════ */

/** Returns true if currentUser is the owner of the item */
function isOwner(item) {
  if (!currentUser) return false;
  return item.authorId === currentUser.uid;
}

/**
 * Call this before any action that requires login.
 * If already logged in, runs cb immediately.
 * Otherwise opens the login modal and stores cb.
 */
function requireAuth(cb) {
  if (currentUser) { cb(); return; }
  pendingAuthCallback = cb;
  openModal('authLoginModal');
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('loginPanel').style.display = isLogin ? '' : 'none';
  document.getElementById('registerPanel').style.display = isLogin ? 'none' : '';
  document.getElementById('loginTab').classList.toggle('active', isLogin);
  document.getElementById('registerTab').classList.toggle('active', !isLogin);
  document.getElementById('authSubmitBtn').textContent = isLogin ? 'Sign In →' : 'Register →';
  document.getElementById('loginErr').textContent = '';
  document.getElementById('regErr').textContent = '';
}

function handleAuthSubmit() {
  const isLogin = document.getElementById('loginPanel').style.display !== 'none';
  if (isLogin) doLogin();
  else doRegister();
}

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { document.getElementById('loginErr').textContent = 'Please fill in both fields.'; return; }

  auth.signInWithEmailAndPassword(email, password)
    .then(userCred => {
      closeModal('authLoginModal');
      showToast('👋', `Welcome back!`);
      if (pendingAuthCallback) { pendingAuthCallback(); pendingAuthCallback = null; }
    })
    .catch(error => {
      document.getElementById('loginErr').textContent = '❌ ' + error.message;
    });
}

function doRegister() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  if (!name || !email || !password) { document.getElementById('regErr').textContent = 'Please fill in all fields.'; return; }

  auth.createUserWithEmailAndPassword(email, password)
    .then(userCred => {
      return userCred.user.updateProfile({ displayName: name }).then(() => {
        closeModal('authLoginModal');
        showToast('🎉', `Account created! Welcome, ${name}!`);
        if (pendingAuthCallback) { pendingAuthCallback(); pendingAuthCallback = null; }
      });
    })
    .catch(error => {
      document.getElementById('regErr').textContent = '❌ ' + error.message;
    });
}

function logout() {
  auth.signOut().then(() => {
    showToast('👋', 'Logged out successfully.');
  });
}

/* ══════════════════════════════════
   NAV RENDER
══════════════════════════════════ */
function renderNav() {
  const nav = document.getElementById('navActions');
  if (currentUser) {
    const name = currentUser.displayName || currentUser.email || 'User';
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    nav.innerHTML = `
      <button class="btn btn-ghost" onclick="requireAuth(()=>openPostModal())">+ Post Item</button>
      <div class="nav-user">
        <div class="nav-avatar">${esc(initials)}</div>
        <span>${esc(name)}</span>
      </div>
      <button class="btn btn-sm btn-logout" onclick="logout()">Sign Out</button>`;
  } else {
    nav.innerHTML = `
      <button class="btn btn-ghost" onclick="openModal('authLoginModal')">Sign In</button>
      <button class="btn btn-primary" onclick="openModal('authLoginModal')">+ Post Item</button>`;
  }
}

/* ══════════════════════════════════
   PAGE SWITCHING
══════════════════════════════════ */
function switchPage(p) {
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(x => x.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
  document.getElementById('tab-' + p).classList.add('active');
  p === 'lost' ? renderLost() : renderFound();
}

/* ══════════════════════════════════
   STATS
══════════════════════════════════ */
function updateStats() {
  document.getElementById('stat-total').textContent = items.length;
  document.getElementById('stat-lost').textContent = items.filter(i => i.type === 'lost').length;
  document.getElementById('stat-found').textContent = items.filter(i => i.type === 'found').length;
}

/* ══════════════════════════════════
   RENDER
══════════════════════════════════ */
function renderLost() {
  const q = document.getElementById('searchLost').value.toLowerCase();
  let list = items.filter(i => i.type === 'lost');
  if (lostCat !== 'all') list = list.filter(i => i.category === lostCat);
  if (q) list = list.filter(i =>
    i.name.toLowerCase().includes(q) ||
    i.desc.toLowerCase().includes(q) ||
    (i.location || '').toLowerCase().includes(q)
  );
  list.sort((a, b) => lostSort === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
  document.getElementById('lostCount').textContent = list.length;
  const g = document.getElementById('lostGrid');
  g.innerHTML = list.length ? list.map((it, i) => cardHTML(it, i, false)).join('') : emptyHTML('lost');
}

function renderFound() {
  const q = document.getElementById('searchFound').value.toLowerCase();
  let list = items.filter(i => i.type === 'found');
  if (foundCat !== 'all') list = list.filter(i => i.category === foundCat);
  if (q) list = list.filter(i =>
    i.name.toLowerCase().includes(q) ||
    i.desc.toLowerCase().includes(q) ||
    (i.location || '').toLowerCase().includes(q)
  );
  list.sort((a, b) => b.createdAt - a.createdAt);
  document.getElementById('foundCount').textContent = list.length;
  const g = document.getElementById('foundGrid');
  g.innerHTML = list.length ? list.map((it, i) => cardHTML(it, i, true)).join('') : emptyHTML('found');
}

function emptyHTML(t) {
  return `<div class="empty-state">
    <div class="empty-icon">${t === 'lost' ? '🔍' : '📦'}</div>
    <h3>No items here</h3>
    <p>${t === 'lost'
      ? 'Nothing matches. <a href="#" onclick="requireAuth(()=>openPostModal());return false;" style="color:var(--accent)">Post one?</a>'
      : 'No found items match.'}</p>
  </div>`;
}

function cardHTML(item, idx, readOnly) {
  const icon = CAT_ICONS[item.category] || '📦';
  const imgH = item.img
    ? `<img src="${item.img}" alt="" loading="lazy">`
    : `<div class="card-img-placeholder">${icon}<span>${item.category}</span></div>`;
  const btnCls = readOnly ? 'contact-btn found-btn' : 'contact-btn';
  const mine = isOwner(item);
  const ownerBadge = mine ? `<span class="owner-badge">✏️ Mine</span>` : '';
  const foundByStrip = (item.type === 'found' && item.foundBy)
    ? `<div class="found-by-strip">🎉 Found by <strong style="margin-left:3px">${esc(item.foundBy)}</strong></div>`
    : '';
  const rewardBadge = (item.type === 'lost' && item.reward && item.reward.trim())
    ? `<div class="reward-strip">🎁 Reward: <strong>${esc(item.reward)}</strong></div>`
    : '';

  return `<div class="item-card" style="animation-delay:${idx * .04}s" onclick="openDetail('${item.id}',${readOnly})">
    <div class="card-img-wrap">
      ${imgH}
      <span class="status-badge badge-${item.type}">${item.type.toUpperCase()}</span>
      ${ownerBadge}
      ${item.type === 'lost' && item.reward && item.reward.trim() ? `<span class="reward-card-badge">🎁 ${esc(item.reward)}</span>` : ''}
    </div>
    <div class="card-body">
      <div class="card-category">${icon} ${item.category}</div>
      <div class="card-title">${esc(item.name)}</div>
      <div class="card-desc">${esc(item.desc)}</div>
      <div class="card-meta">
        <span class="card-location">📍 ${esc(item.location || 'Unknown')}</span>
        <span class="card-date">${item.date}</span>
      </div>
      <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:.72rem;color:var(--text3)">By ${esc(item.author)}</span>
        <button class="${btnCls}" onclick="event.stopPropagation();openDetail('${item.id}',${readOnly})">
          ${readOnly ? 'View & Contact' : 'Details'}
        </button>
      </div>
    </div>
    ${foundByStrip}
    ${rewardBadge}
  </div>`;
}

/* ══════════════════════════════════
   DETAIL MODAL
══════════════════════════════════ */
function openDetail(id, readOnly) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  const icon = CAT_ICONS[item.category] || '📦';
  const mine = isOwner(item);

  document.getElementById('detailTitle').textContent = item.name;
  document.getElementById('detailBody').innerHTML = `
    ${item.img ? `<img src="${item.img}" class="detail-img" alt="">` : ''}
    <div class="detail-badges">
      <span class="detail-badge badge-${item.type}">${item.type.toUpperCase()}</span>
      <span class="detail-badge" style="background:var(--bg2);color:var(--text2)">${icon} ${item.category}</span>
      <span class="detail-badge" style="background:var(--bg2);color:var(--text2)">📍 ${esc(item.location || 'Unknown')}</span>
      <span class="detail-badge" style="background:var(--bg2);color:var(--text2)">📅 ${item.date}</span>
    </div>
    <p class="detail-desc">${esc(item.desc)}</p>
    ${item.type === 'lost' && item.reward && item.reward.trim()
      ? `<div class="reward-detail-box">
          <div class="reward-detail-label">🎁 Reward Offered</div>
          <div class="reward-detail-amount">${esc(item.reward)}</div>
          <div class="reward-detail-note">The poster is offering this reward to whoever returns the item.</div>
        </div>`
      : ''}
    <div style="font-size:.78rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text3);margin-bottom:10px">Contact Info</div>
    <div class="contact-info-box"><div class="ci-label">Posted By</div><div class="ci-value">${esc(item.author)}</div></div>
    <div class="contact-info-box"><div class="ci-label">Contact</div><div class="ci-value" style="color:var(--accent)">${esc(item.contact)}</div></div>
    ${item.foundBy ? `<div class="found-by-detail">🎉 Found by <strong>${esc(item.foundBy)}</strong></div>` : ''}
    ${readOnly && !mine
      ? `<div style="background:#e8f4ff;border:1px solid #a8cdf5;border-radius:8px;padding:.7rem 1rem;font-size:.78rem;color:#1255a3;margin-top:.75rem">🔒 This item is in the Found Archive.</div>`
      : (!mine && !readOnly
        ? `<p style="font-size:.76rem;color:var(--text3);margin-top:.75rem">Reach out with a description of the item as proof before claiming.</p>`
        : '')
    }`;

  const footer = document.getElementById('detailFooter');

  if (readOnly) {
    // Found archive — no editing allowed for anyone
    footer.innerHTML = `<button class="btn-cancel" onclick="closeModal('detailModal')">Close</button>`;
  } else if (mine) {
    // Owner of a lost item — full controls
    footer.innerHTML = `
      <button class="btn-cancel" onclick="closeModal('detailModal')">Close</button>
      <button class="btn-danger" onclick="doDelete('${id}')">🗑 Delete</button>
      <button class="btn-edit-action" onclick="doEdit('${id}')">✏️ Edit</button>
      <button class="btn-mark-found" onclick="openMarkFound('${id}')">🎉 Mark as Found</button>`;
  } else {
    // Not the owner
    footer.innerHTML = `<button class="btn-cancel" onclick="closeModal('detailModal')">Close</button>`;
  }

  openModal('detailModal');
}

/* ══════════════════════════════════
   MARK AS FOUND
══════════════════════════════════ */
function openMarkFound(id) {
  markingFoundId = id;
  document.getElementById('finderName').value = '';
  document.getElementById('finderErr').textContent = '';
  closeModal('detailModal');
  openModal('markFoundModal');
}

function confirmMarkFound() {
  const finder = document.getElementById('finderName').value.trim();
  if (!finder) { document.getElementById('finderErr').textContent = 'Please enter the finder\'s name.'; return; }

  db.collection('items').doc(String(markingFoundId)).update({
    type: 'found',
    foundBy: finder
  }).catch(err => showToast('❌', 'Error updating item'));

  closeModal('markFoundModal');
  showToast('🎉', `Item marked as found! Credited to ${finder}.`);
  markingFoundId = null;
}

/* ══════════════════════════════════
   DELETE
══════════════════════════════════ */
function doDelete(id) {
  if (!currentUser) return;
  const item = items.find(i => i.id === id);
  if (!item || !isOwner(item)) { showToast('⛔', 'You can only delete your own items.'); return; }
  db.collection('items').doc(String(id)).delete().catch(err => showToast('❌', 'Error deleting item'));
  closeModal('detailModal');
  showToast('🗑️', 'Item deleted.');
}

/* ══════════════════════════════════
   EDIT
══════════════════════════════════ */
function doEdit(id) {
  if (!currentUser) return;
  const item = items.find(i => i.id === id);
  if (!item || !isOwner(item)) { showToast('⛔', 'You can only edit your own items.'); return; }

  editingId = id;
  editImg = item.img || null;

  document.getElementById('eName').value = item.name;
  document.getElementById('eCategory').value = item.category;
  document.getElementById('eDesc').value = item.desc;
  document.getElementById('eLocation').value = item.location || '';
  document.getElementById('eDate').value = item.date || '';
  document.getElementById('eContact').value = item.contact;
  document.getElementById('eReward').value = item.reward || '';
  // Show reward field only for lost items
  const erg = document.getElementById('editRewardGroup');
  if (erg) erg.style.display = item.type === 'lost' ? '' : 'none';

  const box = document.getElementById('editUploadBox');
  const prev = document.getElementById('editPreview');
  if (item.img) {
    prev.src = item.img; prev.style.display = 'block';
    box.classList.add('has-img');
  } else {
    prev.style.display = 'none'; box.classList.remove('has-img');
  }
  document.getElementById('editImgInput').value = '';
  closeModal('detailModal');
  openModal('editModal');
}

function saveEdit() {
  const name = document.getElementById('eName').value.trim();
  const cat = document.getElementById('eCategory').value;
  const desc = document.getElementById('eDesc').value.trim();
  if (!name || !cat || !desc) { showToast('⚠️', 'Fill required fields.'); return; }

  const rewardNum = document.getElementById('eReward').value.trim();

  db.collection('items').doc(String(editingId)).update({
    name, category: cat, desc,
    location: document.getElementById('eLocation').value.trim(),
    date: document.getElementById('eDate').value.trim(),
    contact: document.getElementById('eContact').value.trim(),
    reward: rewardNum || '',
    img: editImg
  }).catch(err => showToast('❌', 'Error updating item'));

  closeModal('editModal');
  showToast('✅', 'Item updated!');
}

/* ══════════════════════════════════
   POST
══════════════════════════════════ */
function openPostModal(type) {
  clearPostForm();
  if (type) selectType(type);
  // Pre-fill author/contact from session
  if (currentUser) {
    const name = currentUser.displayName || currentUser.email || 'User';
    document.getElementById('fAuthor').value = name;
    document.getElementById('fContact').value = currentUser.email;
  }
  openModal('postModal');
}

function selectType(t) {
  selectedType = t;
  document.getElementById('radioLost').classList.toggle('selected', t === 'lost');
  document.getElementById('radioFound').classList.toggle('selected', t === 'found');
  // Show reward field only for lost items
  const rg = document.getElementById('rewardGroup');
  if (rg) rg.style.display = t === 'lost' ? '' : 'none';
}

function clearPostForm() {
  ['fName', 'fDesc', 'fLocation', 'fDate', 'fAuthor', 'fContact'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fCategory').value = '';
  document.getElementById('fReward').value = '';
  postImg = null;
  const box = document.getElementById('postUploadBox');
  const prev = document.getElementById('postPreview');
  prev.style.display = 'none'; box.classList.remove('has-img');
  document.getElementById('postImgInput').value = '';
  selectType('lost');
}

function submitPost() {
  if (!currentUser) { showToast('⛔', 'Please sign in to post.'); return; }
  const name = document.getElementById('fName').value.trim();
  const cat = document.getElementById('fCategory').value;
  const desc = document.getElementById('fDesc').value.trim();
  if (!name || !cat || !desc) { showToast('⚠️', 'Please fill all required fields.'); return; }

  const isFoundType = selectedType === 'found';
  const rewardVal = (!isFoundType) ? document.getElementById('fReward').value.trim() : '';
  const authorName = currentUser.displayName || currentUser.email || 'User';
  const it = {
    type: selectedType,
    name, category: cat, desc,
    location: document.getElementById('fLocation').value.trim() || 'Campus',
    date: document.getElementById('fDate').value.trim() || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    author: authorName,
    contact: currentUser.email,
    authorId: currentUser.uid,
    img: postImg,
    reward: rewardVal || '',
    foundBy: isFoundType ? authorName : null,
    createdAt: Date.now()
  };

  db.collection('items').add(it)
  .then(() => {
    console.log("✅ Posted successfully:", it);
  })
  .catch(err => {
    console.error("❌ Firestore error:", err);
    showToast('❌', err.message);
  });
  
  if (isFoundType) { switchPage('found'); }
  else { switchPage('lost'); }
  closeModal('postModal');
  showToast('✅', isFoundType ? 'Added to Found Archive!' : 'Lost item posted!');
}

/* ══════════════════════════════════
   IMAGE UPLOAD
══════════════════════════════════ */
function handleImgUpload(input, previewId, boxId) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const data = e.target.result;
    if (boxId === 'postUploadBox') postImg = data;
    else editImg = data;
    const prev = document.getElementById(previewId);
    const box = document.getElementById(boxId);
    prev.src = data; prev.style.display = 'block';
    box.classList.add('has-img');
  };
  reader.readAsDataURL(file);
}

/* ══════════════════════════════════
   FILTERS
══════════════════════════════════ */
function setLostCat(cat, el) {
  lostCat = cat;
  document.querySelectorAll('#lostChips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderLost();
}
function setFoundCat(cat, el) {
  foundCat = cat;
  document.querySelectorAll('#foundChips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderFound();
}

/* ══════════════════════════════════
   MODAL HELPERS
══════════════════════════════════ */
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close on backdrop click
document.querySelectorAll('.modal-overlay').forEach(o =>
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); })
);

/* ══════════════════════════════════
   TOAST
══════════════════════════════════ */
let tt;
function showToast(icon, msg) {
  const t = document.getElementById('toast');
  document.getElementById('toastIcon').textContent = icon;
  document.getElementById('toastMsg').textContent = msg;
  t.classList.add('show');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('show'), 3500);
}

/* ══════════════════════════════════
   UTILS
══════════════════════════════════ */
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ══════════════════════════════════
   INIT
══════════════════════════════════ */
// Clear search boxes on load — prevents browser autofill from bleeding in
window.addEventListener('load', () => {
  document.getElementById('searchLost').value = '';
  document.getElementById('searchFound').value = '';
});
loadDB();
renderNav();
updateStats();
renderLost();
renderFound();
