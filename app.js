const STORAGE_KEYS = {
  posts: 'duduta_posts_v2',
  sharedMemo: 'duduta_shared_memo_v1',
  nickname: 'duduta_nickname_v2',
  users: 'duduta_users_v1',
  authUserId: 'duduta_auth_user_id_v1',
  guestToken: 'duduta_guest_token_v1',
  theme: 'duduta_theme_v1'
};

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDl71Ezdl85KnoEuBpBaz1pVfC2K3yR0QQ',
  authDomain: 'myworkboard-981bf.firebaseapp.com',
  projectId: 'myworkboard-981bf',
  storageBucket: 'myworkboard-981bf.firebasestorage.app',
  messagingSenderId: '840533947338',
  appId: '1:840533947338:web:74fc5506b12b39f9279533'
};

const CATEGORIES = ['쿠폰정보', '건축정보', '게임정보', '아이템위치정보', '소통'];

const defaultPosts = [
  {
    id: crypto.randomUUID(),
    nick: 'GM_Duduta',
    ownerType: 'guest',
    ownerId: 'seed',
    type: '게임정보',
    text: '3월 업데이트 적용\n신규 가구 세트 12종 추가\n건축 모드 충돌 안정화 패치 포함',
    createdAt: Date.now() - 1000 * 60 * 80
  },
  {
    id: crypto.randomUUID(),
    nick: 'BuildMaster',
    ownerType: 'guest',
    ownerId: 'seed',
    type: '건축정보',
    text: '지붕 먼저 배치하고 벽 마감하면 충돌이 덜 납니다.',
    createdAt: Date.now() - 1000 * 60 * 30
  },
  {
    id: crypto.randomUUID(),
    nick: 'CouponMate',
    ownerType: 'guest',
    ownerId: 'seed',
    type: '쿠폰정보',
    text: '쿠폰: DUDUTA-START-2026\n보상: 코인 200\n입력 위치: 설정 > 쿠폰',
    createdAt: Date.now() - 1000 * 60 * 12
  }
];

let users = loadJSON(STORAGE_KEYS.users, []);
let posts = loadJSON(STORAGE_KEYS.posts, defaultPosts).map(normalizePost);
let activeChannel = 'all';
let isAdmin = false;
let currentUser = null;
let editingPostId = null;
let expandedPostIds = new Set();
let currentFeedPage = 1;
const FEED_PAGE_SIZE = 4;
const guestToken = getGuestToken();

let remoteDb = null;
let remoteAuth = null;
let remoteReady = false;
let remoteSeedTried = false;
let remoteMemoSeedTried = false;

const channelList = document.getElementById('channelList');
const feedList = document.getElementById('feedList');
const feedPager = document.getElementById('feedPager');
const activeChannelTag = document.getElementById('activeChannelTag');
const nicknameInput = document.getElementById('nicknameInput');
const titleInput = document.getElementById('titleInput');
const messageInput = document.getElementById('messageInput');
const typeSelect = document.getElementById('typeSelect');
const strategyMemo = document.getElementById('strategyMemo');
const adminPanel = document.getElementById('adminPanel');
const adminPostList = document.getElementById('adminPostList');

const authStatus = document.getElementById('authStatus');
const authLoginBtn = document.getElementById('authLoginBtn');
const authRenameBtn = document.getElementById('authRenameBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const floatingAdminBtn = document.getElementById('floatingAdminBtn');
const loginUserSelect = document.getElementById('loginUserSelect');

const regNameInput = document.getElementById('regNameInput');
const regPwInput = document.getElementById('regPwInput');
const loginPwInput = document.getElementById('loginPwInput');
const renameNameInput = document.getElementById('renameNameInput');
const adminPwInput = document.getElementById('adminPwInput');
const editNickSelect = document.getElementById('editNickSelect');
const editTypeSelect = document.getElementById('editTypeSelect');
const editTitleInput = document.getElementById('editTitleInput');
const editMessageInput = document.getElementById('editMessageInput');

if (loginPwInput) {
  loginPwInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    loginUser();
  });
}

if (adminPwInput) {
  adminPwInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    loginAdmin();
  });
}

hydrateAuth();
applySavedTheme();
renderUserSection();
syncInputsForCurrentUser();
initRealtimeSync();

channelList.addEventListener('click', (event) => {
  const button = event.target.closest('.channel-btn');
  if (!button) return;

  activeChannel = button.dataset.channel;
  if (activeChannel !== 'all' && CATEGORIES.includes(activeChannel)) {
    typeSelect.value = activeChannel;
  }
  channelList.querySelectorAll('.channel-btn').forEach((btn) => btn.classList.remove('active'));
  button.classList.add('active');

  activeChannelTag.textContent = activeChannel === 'all' ? '#전체' : `#${activeChannel}`;
  updateActiveTagStyle(activeChannel);
  currentFeedPage = 1;
  renderPosts();
});

function initRealtimeSync() {
  if (typeof firebase === 'undefined') return;

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    remoteDb = firebase.firestore();
    remoteAuth = firebase.auth();

    remoteAuth.signInAnonymously()
      .then(() => {
        remoteReady = true;
        subscribeRemotePosts();
        subscribeRemoteMemo();
      })
      .catch((error) => {
        console.error('[DUDUTA] Firebase 익명 로그인 실패:', error);
      });
  } catch (error) {
    console.error('[DUDUTA] Firebase 초기화 실패:', error);
  }
}

function subscribeRemotePosts() {
  if (!remoteDb) return;

  remoteDb.collection('duduta_posts')
    .orderBy('createdAt', 'desc')
    .onSnapshot(async (snap) => {
      if (snap.empty) {
        if (!remoteSeedTried && posts.length) {
          remoteSeedTried = true;
          await seedRemotePostsFromLocal();
          return;
        }
      }

      if (!snap.empty) remoteSeedTried = true;
      posts = snap.docs.map((doc) => normalizePost({ id: doc.id, ...doc.data() }));
      saveJSON(STORAGE_KEYS.posts, posts);
      renderPosts();
      renderAdminPanel();
    }, (error) => {
      console.error('[DUDUTA] 게시글 실시간 동기화 실패:', error);
    });
}

async function seedRemotePostsFromLocal() {
  if (!remoteDb || !posts.length) return;

  const batch = remoteDb.batch();
  posts.forEach((post) => {
    const normalized = normalizePost(post);
    const ref = remoteDb.collection('duduta_posts').doc(normalized.id);
    batch.set(ref, {
      nick: normalized.nick,
      ownerType: normalized.ownerType,
      ownerId: normalized.ownerId,
      type: normalized.type,
      text: normalized.text,
      createdAt: normalized.createdAt
    });
  });

  try {
    await batch.commit();
  } catch (error) {
    console.error('[DUDUTA] 초기 게시글 업로드 실패:', error);
  }
}

function subscribeRemoteMemo() {
  if (!remoteDb) return;

  const ref = remoteDb.collection('duduta_config').doc('sharedMemo');
  ref.onSnapshot(async (doc) => {
    if (!doc.exists) {
      const localMemo = localStorage.getItem(STORAGE_KEYS.sharedMemo) || '';
      if (!remoteMemoSeedTried && localMemo) {
        remoteMemoSeedTried = true;
        try {
          await ref.set({ text: localMemo, updatedAt: Date.now() }, { merge: true });
        } catch (error) {
          console.error('[DUDUTA] 초기 메모 업로드 실패:', error);
        }
      }
      return;
    }

    const text = String((doc.data() && doc.data().text) || '');
    localStorage.setItem(STORAGE_KEYS.sharedMemo, text);
    if (document.activeElement !== strategyMemo) {
      strategyMemo.value = text;
    }
  }, (error) => {
    console.error('[DUDUTA] 메모 실시간 동기화 실패:', error);
  });
}

function addPost() {
  const title = (titleInput.value || '').trim();
  const body = (messageInput.value || '').trim();
  const type = typeSelect.value;
  const authorNick = currentUser ? currentUser.name : 'Guest';

  if (!title) {
    alert('게시판제목을 입력하세요.');
    return;
  }

  if (!body) {
    alert('게시판내용을 입력하세요.');
    return;
  }

  if (!CATEGORIES.includes(type)) {
    alert('카테고리를 선택하세요.');
    return;
  }

  const newPost = normalizePost({
    id: crypto.randomUUID(),
    nick: authorNick,
    ownerType: currentUser ? 'user' : 'guest',
    ownerId: currentUser ? currentUser.id : guestToken,
    type,
    text: `${title}\n${body}`,
    createdAt: Date.now()
  });

  posts.unshift(newPost);
  posts = posts.slice(0, 180);
  saveJSON(STORAGE_KEYS.posts, posts);

  if (remoteReady && remoteDb) {
    remoteDb.collection('duduta_posts').doc(newPost.id).set({
      nick: newPost.nick,
      ownerType: newPost.ownerType,
      ownerId: newPost.ownerId,
      type: newPost.type,
      text: newPost.text,
      createdAt: newPost.createdAt
    }).catch((error) => {
      console.error('[DUDUTA] 게시글 등록 실패:', error);
      alert('서버 저장에 실패했습니다. 잠시 후 다시 시도하세요.');
    });
  }

  titleInput.value = '';
  messageInput.value = '';
  currentFeedPage = 1;
  renderPosts();
  renderAdminPanel();
}

function clearPosts() {
  if (!confirm('게시글을 모두 초기화할까요?')) return;

  if (remoteReady && remoteDb) {
    remoteDb.collection('duduta_posts').get().then((snap) => {
      const batch = remoteDb.batch();
      snap.forEach((doc) => batch.delete(doc.ref));
      return batch.commit();
    }).catch((error) => {
      console.error('[DUDUTA] 게시글 초기화 실패:', error);
      alert('서버 초기화에 실패했습니다. 잠시 후 다시 시도하세요.');
    });
  }

  posts = [];
  expandedPostIds = new Set();
  currentFeedPage = 1;
  saveJSON(STORAGE_KEYS.posts, posts);
  renderPosts();
  renderAdminPanel();
}

function saveMemo() {
  const text = strategyMemo.value || '';
  localStorage.setItem(STORAGE_KEYS.sharedMemo, text);

  if (remoteReady && remoteDb) {
    remoteDb.collection('duduta_config').doc('sharedMemo').set({
      text,
      updatedAt: Date.now()
    }, { merge: true }).catch((error) => {
      console.error('[DUDUTA] 메모 저장 실패:', error);
      alert('서버 저장에 실패했습니다. 잠시 후 다시 시도하세요.');
    });
  }

  alert('전체 메모를 저장했습니다.');
}

function clearMemo() {
  if (!confirm('전체 메모를 초기화할까요?')) return;

  strategyMemo.value = '';
  localStorage.removeItem(STORAGE_KEYS.sharedMemo);

  if (remoteReady && remoteDb) {
    remoteDb.collection('duduta_config').doc('sharedMemo').set({
      text: '',
      updatedAt: Date.now()
    }, { merge: true }).catch((error) => {
      console.error('[DUDUTA] 메모 초기화 실패:', error);
      alert('서버 초기화에 실패했습니다. 잠시 후 다시 시도하세요.');
    });
  }
}

function insertTemplate(text, type) {
  messageInput.value = text;
  if (titleInput && !titleInput.value.trim() && CATEGORIES.includes(type)) {
    titleInput.value = `${type} 공유`;
  }
  if (CATEGORIES.includes(type)) {
    typeSelect.value = type;
    activeChannel = type;
    channelList.querySelectorAll('.channel-btn').forEach((btn) => {
      const isActive = btn.dataset.channel === type;
      btn.classList.toggle('active', isActive);
    });
    activeChannelTag.textContent = `#${type}`;
    updateActiveTagStyle(type);
    currentFeedPage = 1;
    renderPosts();
  }
  messageInput.focus();
}

function renderPosts() {
  const filtered = activeChannel === 'all'
    ? posts
    : posts.filter((post) => post.type === activeChannel);

  const totalPages = Math.max(1, Math.ceil(filtered.length / FEED_PAGE_SIZE));
  if (currentFeedPage > totalPages) currentFeedPage = totalPages;
  const start = (currentFeedPage - 1) * FEED_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + FEED_PAGE_SIZE);

  if (!pageItems.length) {
    feedList.innerHTML = '<div class="post"><div class="post-content">해당 카테고리에 등록된 글이 없습니다.</div></div>';
    if (feedPager) feedPager.innerHTML = '';
    return;
  }

  feedList.innerHTML = pageItems.map((post) => `
    <article class="post">
      <div class="post-main">
        <div class="post-author">${escapeHtml(post.nick)}</div>
        <button class="post-title-btn" onclick="applyPostCategory('${escapeAttr(post.type)}')">${escapeHtml(getPostTitle(post.text))}</button>
        <div class="post-content ${shouldCollapseContent(getPostBody(post.text)) && !expandedPostIds.has(post.id) ? 'collapsed' : ''}">${renderPostContent(getPostBody(post.text))}</div>
        ${shouldCollapseContent(getPostBody(post.text)) ? `
          <button class="post-toggle-btn" onclick="togglePostExpand('${post.id}')">${expandedPostIds.has(post.id) ? '접기' : '펼치기'}</button>
        ` : ''}
      </div>
      <div class="post-side">
        <div class="post-date-text">${formatTime(post.createdAt)}</div>
        <div class="post-meta-chip post-type-chip ${getTypeClass(post.type)}">#${escapeHtml(post.type)}</div>
      </div>
      <div class="post-actions">
        ${canEditPost(post) ? `<button class="btn-ghost" onclick="openEditPostModal('${post.id}')">수정</button>` : ''}
        ${canDeletePost(post) ? `<button class="btn-ghost" onclick="deletePostById('${post.id}')">삭제</button>` : ''}
      </div>
    </article>
  `).join('');

  renderFeedPager(totalPages);
}

function renderFeedPager(totalPages) {
  if (!feedPager) return;
  if (totalPages <= 1) {
    feedPager.innerHTML = '';
    return;
  }

  const buttons = [];
  for (let page = 1; page <= totalPages; page += 1) {
    buttons.push(`
      <button class="pager-btn ${page === currentFeedPage ? 'active' : ''}" onclick="goFeedPage(${page})">${page}</button>
    `);
  }
  feedPager.innerHTML = buttons.join('');
}

function openEditPostModal(postId) {
  const post = posts.find((item) => item.id === postId);
  if (!post) return;
  if (!canEditPost(post)) return;

  editingPostId = postId;
  refreshEditNickOptions(post.nick, !isAdmin);
  editTypeSelect.value = post.type;
  editTitleInput.value = getPostTitle(post.text);
  editMessageInput.value = getPostBody(post.text);
  openModal('postEditModal');
}

function saveEditedPost() {
  if (!editingPostId) return;
  const targetPost = posts.find((post) => post.id === editingPostId);
  if (!targetPost) return;
  if (!canEditPost(targetPost)) return;

  const type = editTypeSelect.value;
  const title = (editTitleInput.value || '').trim();
  const body = (editMessageInput.value || '').trim();
  const nick = isAdmin ? (editNickSelect?.value || '').trim() : targetPost.nick;

  if ((isAdmin && !nick) || !CATEGORIES.includes(type) || !title || !body) {
    alert('작성자/카테고리/제목/내용을 확인하세요.');
    return;
  }

  let ownerType = targetPost.ownerType || inferOwnerType(targetPost);
  let ownerId = targetPost.ownerId || inferOwnerId(targetPost);

  if (isAdmin) {
    const matchedUser = users.find((user) => user.name === nick);
    if (matchedUser) {
      ownerType = 'user';
      ownerId = matchedUser.id;
    } else {
      ownerType = 'guest';
      ownerId = targetPost.ownerType === 'guest' && targetPost.ownerId ? targetPost.ownerId : guestToken;
    }
  }

  posts = posts.map((post) => {
    if (post.id !== editingPostId) return post;
    return { ...post, nick, ownerType, ownerId, type, text: `${title}\n${body}` };
  });

  saveJSON(STORAGE_KEYS.posts, posts);
  if (remoteReady && remoteDb) {
    remoteDb.collection('duduta_posts').doc(editingPostId).set({
      nick,
      ownerType,
      ownerId,
      type,
      text: `${title}\n${body}`,
      createdAt: targetPost.createdAt
    }, { merge: true }).catch((error) => {
      console.error('[DUDUTA] 게시글 수정 실패:', error);
      alert('서버 수정에 실패했습니다. 잠시 후 다시 시도하세요.');
    });
  }

  closeModal('postEditModal');
  editingPostId = null;
  renderPosts();
  renderAdminPanel();
}

function renderAdminPanel() {
  if (!adminPanel || !adminPostList) return;
  adminPanel.classList.toggle('hidden', !isAdmin);
  updateAdminButton();

  if (!isAdmin) return;

  if (!posts.length) {
    adminPostList.innerHTML = '<div class="admin-item"><div class="post-content">삭제할 게시글이 없습니다.</div></div>';
    return;
  }

  adminPostList.innerHTML = posts.map((post) => `
    <article class="admin-item">
      <div class="admin-item-head">
        <div class="admin-item-title">
          <strong>${escapeHtml(post.nick)}</strong> · #${escapeHtml(post.type)} · ${formatTime(post.createdAt)}
        </div>
        <div class="action-row">
          <button class="btn-ghost" onclick="openEditPostModal('${post.id}')">수정</button>
          <button class="btn-ghost" onclick="deletePostById('${post.id}')">삭제</button>
        </div>
      </div>
      <div class="post-content">${renderPostContent(post.text)}</div>
    </article>
  `).join('');
}

function deletePostById(id) {
  const targetPost = posts.find((post) => post.id === id);
  if (!targetPost) return;
  if (!canDeletePost(targetPost)) return;
  if (!confirm('이 게시글을 삭제할까요?')) return;

  posts = posts.filter((post) => post.id !== id);
  expandedPostIds.delete(id);
  currentFeedPage = 1;
  saveJSON(STORAGE_KEYS.posts, posts);

  if (remoteReady && remoteDb) {
    remoteDb.collection('duduta_posts').doc(id).delete().catch((error) => {
      console.error('[DUDUTA] 게시글 삭제 실패:', error);
      alert('서버 삭제에 실패했습니다. 잠시 후 다시 시도하세요.');
    });
  }

  renderPosts();
  renderAdminPanel();
}

function toggleAdminAuth() {
  if (isAdmin) {
    logoutAdmin();
    return;
  }
  openModal('adminModal');
}

function loginAdmin() {
  const key = (adminPwInput.value || '').trim();
  if (key !== '0512') {
    alert('비밀번호가 올바르지 않습니다.');
    return;
  }
  isAdmin = true;
  adminPwInput.value = '';
  closeModal('adminModal');
  renderAdminPanel();
  renderPosts();
}

function logoutAdmin() {
  isAdmin = false;
  renderAdminPanel();
  renderPosts();
}

function registerUser() {
  const name = (regNameInput.value || '').trim();
  const pw = (regPwInput.value || '').trim();
  if (!name || !pw) {
    alert('가입 닉네임과 비밀번호를 입력하세요.');
    return;
  }
  if (users.some((user) => user.name === name)) {
    alert('이미 존재하는 닉네임입니다.');
    return;
  }

  users.push({ id: crypto.randomUUID(), name, pw });
  saveJSON(STORAGE_KEYS.users, users);

  regNameInput.value = '';
  regPwInput.value = '';
  renderUserSection();
  closeModal('signupModal');
  alert('회원가입이 완료되었습니다.');
}

function loginUser() {
  const userId = loginUserSelect.value;
  const pw = (loginPwInput.value || '').trim();
  const user = users.find((item) => item.id === userId);
  if (!user || user.pw !== pw) {
    alert('로그인 정보가 올바르지 않습니다.');
    return;
  }

  currentUser = user;
  localStorage.setItem(STORAGE_KEYS.authUserId, user.id);
  localStorage.setItem(STORAGE_KEYS.nickname, user.name);
  loginPwInput.value = '';
  renderUserSection();
  syncInputsForCurrentUser();
  closeModal('loginModal');
}

function logoutUser() {
  currentUser = null;
  localStorage.removeItem(STORAGE_KEYS.authUserId);
  renderUserSection();
  syncInputsForCurrentUser();
}

function changeNickname() {
  if (!currentUser) {
    alert('로그인 후 닉네임 변경이 가능합니다.');
    return;
  }

  const nextName = (renameNameInput?.value || '').trim();
  if (!nextName) {
    alert('새 닉네임을 입력하세요.');
    return;
  }

  if (nextName === currentUser.name) {
    alert('현재 닉네임과 같습니다.');
    return;
  }

  if (users.some((user) => user.name === nextName && user.id !== currentUser.id)) {
    alert('이미 존재하는 닉네임입니다.');
    return;
  }

  const prevName = currentUser.name;
  users = users.map((user) => (user.id === currentUser.id ? { ...user, name: nextName } : user));
  currentUser = { ...currentUser, name: nextName };
  saveJSON(STORAGE_KEYS.users, users);
  localStorage.setItem(STORAGE_KEYS.nickname, nextName);

  posts = posts.map((post) => {
    const ownedByCurrentUser = post.ownerType === 'user' && post.ownerId === currentUser.id;
    const legacyOwned = !post.ownerType && post.nick === prevName;
    if (!ownedByCurrentUser && !legacyOwned) return post;
    return {
      ...post,
      nick: nextName,
      ownerType: 'user',
      ownerId: currentUser.id
    };
  });
  saveJSON(STORAGE_KEYS.posts, posts);

  if (remoteReady && remoteDb) {
    const owned = posts.filter((post) => post.ownerType === 'user' && post.ownerId === currentUser.id);
    owned.forEach((post) => {
      remoteDb.collection('duduta_posts').doc(post.id).set({
        nick: post.nick,
        ownerType: post.ownerType,
        ownerId: post.ownerId,
        type: post.type,
        text: post.text,
        createdAt: post.createdAt
      }, { merge: true }).catch((error) => {
        console.error('[DUDUTA] 닉네임 변경 반영 실패:', error);
      });
    });
  }

  if (renameNameInput) renameNameInput.value = '';
  closeModal('renameModal');
  renderUserSection();
  syncInputsForCurrentUser();
  renderPosts();
  renderAdminPanel();
}

function hydrateAuth() {
  const authUserId = localStorage.getItem(STORAGE_KEYS.authUserId);
  if (!authUserId) return;
  currentUser = users.find((user) => user.id === authUserId) || null;
}

function renderUserSection() {
  if (!loginUserSelect) return;

  if (!users.length) {
    loginUserSelect.innerHTML = '<option value="">회원 없음</option>';
  } else {
    loginUserSelect.innerHTML = users
      .map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`)
      .join('');
  }

  if (currentUser) {
    loginUserSelect.value = currentUser.id;
    if (authStatus) authStatus.textContent = `로그인: ${currentUser.name}`;
  } else {
    if (authStatus) authStatus.textContent = '로그인: Guest';
  }

  updateAuthButtons();
  updateRenameButton();
  updateAdminButton();
  refreshEditNickOptions();
}

function refreshEditNickOptions(selectedNick, lockSingle = false) {
  if (!editNickSelect) return;
  if (lockSingle) {
    const nick = selectedNick || 'Guest';
    editNickSelect.innerHTML = `<option value="${escapeHtml(nick)}">${escapeHtml(nick)}</option>`;
    editNickSelect.value = nick;
    editNickSelect.disabled = true;
    return;
  }

  editNickSelect.disabled = false;
  const names = users.map((user) => user.name);
  editNickSelect.innerHTML = [
    '<option value="Guest">Guest</option>',
    ...names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
  ].join('');

  const target = selectedNick && (selectedNick === 'Guest' || names.includes(selectedNick)) ? selectedNick : 'Guest';
  editNickSelect.value = target;
}

function updateAuthButtons() {
  if (!authLoginBtn) return;
  if (currentUser) {
    authLoginBtn.textContent = '로그아웃';
    authLoginBtn.onclick = logoutUser;
    return;
  }
  authLoginBtn.textContent = '로그인';
  authLoginBtn.onclick = () => openModal('loginModal');
}

function updateRenameButton() {
  if (!authRenameBtn) return;
  authRenameBtn.disabled = !currentUser;
}

function applySavedTheme() {
  const theme = localStorage.getItem(STORAGE_KEYS.theme) || 'light';
  document.body.classList.toggle('dark-mode', theme === 'dark');
  updateThemeButton(theme === 'dark');
}

function toggleTheme() {
  const isDark = !document.body.classList.contains('dark-mode');
  document.body.classList.toggle('dark-mode', isDark);
  localStorage.setItem(STORAGE_KEYS.theme, isDark ? 'dark' : 'light');
  updateThemeButton(isDark);
}

function updateThemeButton(isDark) {
  if (!themeToggleBtn) return;
  themeToggleBtn.textContent = isDark ? '☀' : '🌙';
  themeToggleBtn.title = isDark ? '라이트모드 전환' : '다크모드 전환';
  themeToggleBtn.setAttribute('aria-label', isDark ? '라이트모드 전환' : '다크모드 전환');
}

function updateAdminButton() {
  if (!floatingAdminBtn) return;
  floatingAdminBtn.textContent = isAdmin ? '로그아웃' : 'ADMIN';
}

function syncInputsForCurrentUser() {
  nicknameInput.disabled = true;
  if (currentUser) {
    nicknameInput.value = currentUser.name;
    strategyMemo.value = localStorage.getItem(STORAGE_KEYS.sharedMemo) || '';
    return;
  }

  nicknameInput.value = 'Guest';
  strategyMemo.value = localStorage.getItem(STORAGE_KEYS.sharedMemo) || '';
}

function getGuestToken() {
  let token = localStorage.getItem(STORAGE_KEYS.guestToken);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEYS.guestToken, token);
  }
  return token;
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'none';
  if (id === 'postEditModal') {
    editingPostId = null;
    if (editNickSelect) {
      editNickSelect.value = 'Guest';
      editNickSelect.disabled = false;
    }
    if (editTitleInput) editTitleInput.value = '';
    if (editMessageInput) editMessageInput.value = '';
  }
}

function closeOnBackdrop(event, modalId) {
  if (event.target.id === modalId) closeModal(modalId);
}

function renderPostContent(text) {
  const escaped = escapeHtml(text || '');
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
  });
}

function formatTime(ms) {
  const date = new Date(ms);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function saveJSON(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function normalizePost(post) {
  return {
    id: post.id || crypto.randomUUID(),
    nick: post.nick || 'Guest',
    ownerType: post.ownerType || (post.nick === 'Guest' ? 'guest' : 'user'),
    ownerId: post.ownerId || '',
    type: CATEGORIES.includes(post.type) ? post.type : '소통',
    text: String(post.text || ''),
    createdAt: Number(post.createdAt) || Date.now()
  };
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/`/g, '&#96;');
}

function getPostTitle(text) {
  const firstLine = String(text || '').split('\n')[0].trim();
  if (!firstLine) return '제목 없음';
  return firstLine.length > 28 ? `${firstLine.slice(0, 28)}...` : firstLine;
}

function getPostBody(text) {
  const lines = String(text || '').split(/\r?\n/);
  if (lines.length <= 1) return String(text || '').trim();
  return lines.slice(1).join('\n').trim();
}

function shouldCollapseContent(text) {
  const normalized = String(text || '');
  const lines = normalized.split(/\r?\n/);
  return lines.length > 3;
}

function inferOwnerType(post) {
  return post.nick === 'Guest' ? 'guest' : 'user';
}

function inferOwnerId(post) {
  if (post.nick === 'Guest') return guestToken;
  const matchedUser = users.find((user) => user.name === post.nick);
  return matchedUser ? matchedUser.id : '';
}

function canEditPost(post) {
  if (!post) return false;
  if (isAdmin) return true;

  const ownerType = post.ownerType || inferOwnerType(post);
  const ownerId = post.ownerId || inferOwnerId(post);

  if (currentUser) {
    return ownerType === 'user' && ownerId === currentUser.id;
  }

  return ownerType === 'guest' && ownerId === guestToken;
}

function canDeletePost(post) {
  return canEditPost(post);
}

function applyPostCategory(type) {
  if (!CATEGORIES.includes(type)) return;
  typeSelect.value = type;
  activeChannel = type;
  channelList.querySelectorAll('.channel-btn').forEach((btn) => {
    const isActive = btn.dataset.channel === type;
    btn.classList.toggle('active', isActive);
  });
  activeChannelTag.textContent = `#${type}`;
  updateActiveTagStyle(type);
  renderPosts();
}

function getTypeClass(type) {
  if (type === '쿠폰정보') return 'type-coupon';
  if (type === '건축정보') return 'type-build';
  if (type === '게임정보') return 'type-game';
  if (type === '아이템위치정보') return 'type-item';
  if (type === '소통') return 'type-chat';
  return '';
}

function updateActiveTagStyle(type) {
  if (!activeChannelTag) return;
  activeChannelTag.classList.remove('type-coupon', 'type-build', 'type-game', 'type-item', 'type-chat');
  const cls = getTypeClass(type);
  if (cls) activeChannelTag.classList.add(cls);
}

function togglePostExpand(id) {
  if (expandedPostIds.has(id)) {
    expandedPostIds.delete(id);
  } else {
    expandedPostIds.add(id);
  }
  renderPosts();
}

function goFeedPage(page) {
  const next = Number(page);
  if (!Number.isFinite(next) || next < 1) return;
  currentFeedPage = next;
  renderPosts();
}

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  ['signupModal', 'loginModal', 'renameModal', 'adminModal', 'postEditModal'].forEach(closeModal);
});

renderPosts();
renderAdminPanel();
updateActiveTagStyle(activeChannel);

window.addPost = addPost;
window.clearPosts = clearPosts;
window.saveMemo = saveMemo;
window.insertTemplate = insertTemplate;
window.clearMemo = clearMemo;
window.deletePostById = deletePostById;
window.toggleAdminAuth = toggleAdminAuth;
window.loginAdmin = loginAdmin;
window.logoutAdmin = logoutAdmin;
window.registerUser = registerUser;
window.loginUser = loginUser;
window.logoutUser = logoutUser;
window.changeNickname = changeNickname;
window.toggleTheme = toggleTheme;
window.openModal = openModal;
window.closeModal = closeModal;
window.closeOnBackdrop = closeOnBackdrop;
window.openEditPostModal = openEditPostModal;
window.saveEditedPost = saveEditedPost;
window.applyPostCategory = applyPostCategory;
window.togglePostExpand = togglePostExpand;
window.goFeedPage = goFeedPage;
