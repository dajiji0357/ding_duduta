const STORAGE_KEYS = {
  posts: 'duduta_posts_v2',
  albumItems: 'duduta_album_items_v1',
  sharedMemo: 'duduta_shared_memo_v1',
  nickname: 'duduta_nickname_v2',
  users: 'duduta_users_v1',
  authUserId: 'duduta_auth_user_id_v1',
  adminAuth: 'duduta_admin_auth_v1',
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

const CATEGORIES = ['쿠폰정보', '게임정보', '소통'];
const REMOVED_POST_TYPES = ['건축정보', '아이템위치정보'];
const ALBUM_CHANNEL = '앨범';
const ALBUM_MAX_ITEMS = 10;
const ALBUM_MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALBUM_INLINE_IMAGE_MAX_BYTES = 450 * 1024;
const ALBUM_INLINE_MAX_WIDTH = 960;
const ALBUM_INLINE_JPEG_QUALITY = 0.72;
const ALBUM_UPLOAD_CONCURRENCY = 2;
const STORAGE_UPLOAD_TOTAL_TIMEOUT_MS = 30000;
const STORAGE_UPLOAD_STALL_TIMEOUT_MS = 12000;

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
let albumItems = loadJSON(STORAGE_KEYS.albumItems, []).map(normalizeAlbumItem);
let activeChannel = 'all';
let isAdmin = false;
let currentUser = null;
let editingPostId = null;
let expandedPostIds = new Set();
let currentMainFeedPage = 1;
let currentChatFeedPage = 1;
const FEED_PAGE_SIZE = 4;
const CHAT_FEED_PAGE_SIZE = 5;
const guestToken = getGuestToken();

let remoteDb = null;
let remoteAuth = null;
let remoteStorage = null;
let remoteReady = false;
let remoteAuthReadyPromise = null;
let remoteSubscriptionsReady = false;
let remoteSeedTried = false;
let remoteMemoSeedTried = false;
let remoteUsersSeedTried = false;
let remoteDeprecatedCleanupTried = false;
let albumTrimRunning = false;
let albumUploadInProgress = false;
let storageUploadDisabled = false;
let albumProgressDisplay = 0;
let albumProgressTarget = 0;
let albumProgressRaf = null;
let albumProgressHeartbeat = null;

const channelList = document.getElementById('channelList');
const mainFeedList = document.getElementById('mainFeedList');
const mainFeedPager = document.getElementById('mainFeedPager');
const mainFeedPanel = document.getElementById('mainFeedPanel');
const albumPanel = document.getElementById('albumPanel');
const albumGrid = document.getElementById('albumGrid');
const chatFeedList = document.getElementById('chatFeedList');
const chatFeedPager = document.getElementById('chatFeedPager');
const rightFeedPreview = document.getElementById('rightFeedPreview');
const activeChannelTag = document.getElementById('activeChannelTag');
const nicknameInput = document.getElementById('nicknameInput');
const titleInput = document.getElementById('titleInput');
const messageInput = document.getElementById('messageInput');
const typeSelect = document.getElementById('typeSelect');
const albumImageInput = document.getElementById('albumImageInput');
const albumCaptionInput = document.getElementById('albumCaptionInput');
const albumUploadBtn = document.getElementById('albumUploadBtn');
const albumUploadProgress = document.getElementById('albumUploadProgress');
const albumUploadBar = document.getElementById('albumUploadBar');
const albumUploadPercent = document.getElementById('albumUploadPercent');
const albumUploadStatusText = document.getElementById('albumUploadStatusText');
const albumLightbox = document.getElementById('albumLightbox');
const albumLightboxImage = document.getElementById('albumLightboxImage');
const strategyMemo = document.getElementById('strategyMemo');
const adminPanel = document.getElementById('adminPanel');
const adminPostList = document.getElementById('adminPostList');
const adminUserList = document.getElementById('adminUserList');

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

purgeDeprecatedLocalData();

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
hydrateAdminAuth();
applySavedTheme();
applyInitialChannelFromUrl();
renderUserSection();
syncInputsForCurrentUser();
initRealtimeSync();

channelList.addEventListener('click', (event) => {
  const button = event.target.closest('.channel-btn');
  if (!button) return;

  const nextChannel = button.dataset.channel;
  if (nextChannel === '소통') {
    const url = new URL(window.location.href);
    if (url.searchParams.get('channel') !== '소통') {
      url.searchParams.set('channel', '소통');
      window.location.href = url.toString();
      return;
    }
  }

  activeChannel = nextChannel;
  if (activeChannel !== '소통') {
    const url = new URL(window.location.href);
    if (url.searchParams.get('channel')) {
      url.searchParams.delete('channel');
      window.history.replaceState({}, '', url.toString());
    }
  }
  if (activeChannel !== 'all' && CATEGORIES.includes(activeChannel)) {
    typeSelect.value = activeChannel;
  }
  channelList.querySelectorAll('.channel-btn').forEach((btn) => btn.classList.remove('active'));
  button.classList.add('active');

  activeChannelTag.textContent = activeChannel === 'all' ? '#전체' : `#${activeChannel}`;
  updateActiveTagStyle(activeChannel);
  currentMainFeedPage = 1;
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
    remoteStorage = firebase.storage();

    remoteAuthReadyPromise = remoteAuth.signInAnonymously()
      .then(() => {
        remoteReady = true;
        ensureRemoteSubscriptions();
        return true;
      })
      .catch((error) => {
        console.error('[DUDUTA] Firebase 익명 로그인 실패:', error);
        remoteAuthReadyPromise = null;
        remoteReady = false;
      });
  } catch (error) {
    console.error('[DUDUTA] Firebase 초기화 실패:', error);
  }
}

function ensureRemoteSubscriptions() {
  if (remoteSubscriptionsReady) return;
  remoteSubscriptionsReady = true;
  subscribeRemoteUsers();
  subscribeRemotePosts();
  subscribeRemoteMemo();
  runRemoteDeprecatedCleanup();
}

function subscribeRemotePosts() {
  if (!remoteDb) return;

  remoteDb.collection('duduta_posts')
    .orderBy('createdAt', 'desc')
    .onSnapshot(async (snap) => {
      const docs = snap.docs || [];
      const removedDocs = docs.filter((doc) => {
        const data = doc.data() || {};
        return isDeprecatedPostType(data.type);
      });
      if (removedDocs.length) {
        deleteRemoteDocsInChunks(removedDocs.map((doc) => doc.ref)).catch((error) => {
          console.error('[DUDUTA] 제거 대상 게시글 삭제 실패:', error);
        });
      }

      if (snap.empty) {
        if (!remoteSeedTried && posts.length) {
          remoteSeedTried = true;
          await seedRemotePostsFromLocal();
          return;
        }
      }

      if (!snap.empty) remoteSeedTried = true;
      posts = docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((post) => !isDeprecatedPostType(post.type))
        .map(normalizePost);
      saveJSON(STORAGE_KEYS.posts, posts);
      renderPosts();
      renderAdminPanel();
    }, (error) => {
      console.error('[DUDUTA] 게시글 실시간 동기화 실패:', error);
    });
}

function subscribeRemoteUsers() {
  if (!remoteDb) return;

  remoteDb.collection('duduta_users')
    .orderBy('name')
    .onSnapshot(async (snap) => {
      if (snap.empty) {
        if (!remoteUsersSeedTried && users.length) {
          remoteUsersSeedTried = true;
          await seedRemoteUsersFromLocal();
          return;
        }
      }

      if (!snap.empty) remoteUsersSeedTried = true;
      users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      saveJSON(STORAGE_KEYS.users, users);
      syncCurrentUserFromStoredAuth();
      renderUserSection();
      syncInputsForCurrentUser();
    }, (error) => {
      console.error('[DUDUTA] 사용자 실시간 동기화 실패:', error);
    });
}

async function seedRemoteUsersFromLocal() {
  if (!remoteDb || !users.length) return;

  const batch = remoteDb.batch();
  users.forEach((user) => {
    if (!user || !user.id || !user.name) return;
    const ref = remoteDb.collection('duduta_users').doc(user.id);
    batch.set(ref, {
      name: String(user.name),
      pw: String(user.pw || ''),
      createdAt: Date.now()
    }, { merge: true });
  });

  try {
    await batch.commit();
  } catch (error) {
    console.error('[DUDUTA] 초기 사용자 업로드 실패:', error);
  }
}

async function seedRemotePostsFromLocal() {
  if (!remoteDb || !posts.length) return;

  const batch = remoteDb.batch();
  posts.forEach((post) => {
    if (isDeprecatedPostType(post.type)) return;
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

async function runRemoteDeprecatedCleanup() {
  if (!remoteDb || remoteDeprecatedCleanupTried) return;
  remoteDeprecatedCleanupTried = true;

  try {
    const removedPostsSnap = await remoteDb.collection('duduta_posts')
      .where('type', 'in', REMOVED_POST_TYPES)
      .get();
    if (!removedPostsSnap.empty) {
      await deleteRemoteDocsInChunks(removedPostsSnap.docs.map((doc) => doc.ref));
    }
  } catch (error) {
    console.error('[DUDUTA] 제거 대상 카테고리 게시글 정리 실패:', error);
  }

  try {
    const albumSnap = await remoteDb.collection('duduta_album').get();
    if (!albumSnap.empty) {
      await Promise.all(albumSnap.docs.map(async (doc) => {
        const data = doc.data() || {};
        const storagePath = data && data.storagePath ? String(data.storagePath) : '';
        if (storagePath && remoteStorage) {
          try {
            await remoteStorage.ref().child(storagePath).delete();
          } catch (error) {
            const code = error && error.code ? String(error.code) : '';
            if (code !== 'storage/object-not-found') {
              console.warn('[DUDUTA] 앨범 스토리지 파일 삭제 실패:', error);
            }
          }
        }
      }));
      await deleteRemoteDocsInChunks(albumSnap.docs.map((doc) => doc.ref));
    }
  } catch (error) {
    console.error('[DUDUTA] 앨범 서버 기록 정리 실패:', error);
  }
}

async function deleteRemoteDocsInChunks(docRefs) {
  if (!remoteDb) return;
  const refs = (docRefs || []).filter(Boolean);
  if (!refs.length) return;
  const chunkSize = 400;
  for (let i = 0; i < refs.length; i += chunkSize) {
    const chunk = refs.slice(i, i + chunkSize);
    const batch = remoteDb.batch();
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
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

function subscribeRemoteAlbum() {
  if (!remoteDb) return;

  remoteDb.collection('duduta_album')
    .orderBy('createdAtMs', 'desc')
    .onSnapshot((snap) => {
      albumItems = snap.docs.map((doc) => normalizeAlbumItem({ id: doc.id, ...doc.data() }));
      saveJSON(STORAGE_KEYS.albumItems, albumItems);
      renderAlbumBoard();
      if (snap.size > ALBUM_MAX_ITEMS) {
        trimAlbumOverflow();
      }
    }, (error) => {
      console.error('[DUDUTA] 앨범 실시간 동기화 실패:', error);
    });
}

function renderAlbumBoard() {
  if (!albumGrid) return;
  if (!albumItems.length) {
    albumGrid.innerHTML = '<div class="post"><div class="post-content">등록된 사진이 없습니다.</div></div>';
    return;
  }

  albumGrid.innerHTML = albumItems
    .slice(0, ALBUM_MAX_ITEMS)
    .map((item) => {
      const canDelete = canManageAlbumItem(item);
      return `
        <article class="album-card">
          <img class="album-image" src="${escapeAttr(item.imageUrl || '')}" alt="album image" loading="lazy" onclick="openAlbumLightbox('${escapeAttr(item.imageUrl || '')}')">
          <div class="album-meta-row">
            <span>${escapeHtml(item.uploaderName || 'Guest')}</span>
            <span>${formatTime(item.createdAtMs)}</span>
          </div>
          ${item.caption ? `<div class="album-caption">${escapeHtml(item.caption)}</div>` : ''}
          ${canDelete ? `<div class="album-actions"><button class="btn-ghost" onclick="deleteAlbumById('${item.id}')">삭제</button></div>` : ''}
        </article>
      `;
    })
    .join('');
}

function uploadAlbumImages() {
  if (albumUploadInProgress) {
    alert('이미 업로드 중입니다. 잠시만 기다려주세요.');
    return;
  }
  const files = albumImageInput && albumImageInput.files ? Array.from(albumImageInput.files) : [];
  const caption = albumCaptionInput ? (albumCaptionInput.value || '').trim() : '';

  if (!files.length) {
    alert('업로드할 이미지를 선택하세요.');
    return;
  }

  const invalidType = files.find((file) => !String(file.type || '').startsWith('image/'));
  if (invalidType) {
    alert('이미지 파일만 업로드할 수 있습니다.');
    return;
  }
  const oversized = files.find((file) => Number(file.size || 0) > ALBUM_MAX_FILE_SIZE);
  if (oversized) {
    alert('파일당 최대 10MB까지 업로드할 수 있습니다.');
    return;
  }

  albumUploadInProgress = true;
  startAlbumProgressHeartbeat();
  if (albumUploadBtn) {
    albumUploadBtn.disabled = true;
    albumUploadBtn.textContent = '업로드 중...';
  }
  setAlbumUploadProgress(true, 1, '업로드 준비 중...');

  const progressByFile = files.map(() => 0);
  const pushProgress = (index, value) => {
    const safe = Math.max(0, Math.min(1, Number(value) || 0));
    if (safe < progressByFile[index]) return;
    progressByFile[index] = safe;
    const avg = progressByFile.reduce((sum, item) => sum + item, 0) / Math.max(1, progressByFile.length);
    const percent = Math.max(1, Math.round(avg * 100));
    setAlbumUploadProgress(true, percent, percent < 95 ? `${percent}% 업로드 중...` : '마무리 중...');
  };

  withTimeout(ensureAlbumBackendReady(), 8000, 'auth-timeout')
    .then(() => {
      setAlbumUploadProgress(true, 2, '파일 업로드 시작...');
      storageUploadDisabled = false;
      return runWithConcurrencyLimit(files, ALBUM_UPLOAD_CONCURRENCY, (file, index) => {
        return uploadSingleAlbumFile(file, caption, (p) => pushProgress(index, p));
      });
    })
    .then(() => {
      setAlbumUploadProgress(true, 100, '업로드 완료, 정리 중...');
      return trimAlbumOverflow().catch((error) => {
        // 보관 개수 정리는 후처리이므로 업로드 성공을 실패로 바꾸지 않음
        console.warn('[DUDUTA] 앨범 후처리 정리 실패:', error);
      });
    })
    .then(() => {
      if (albumImageInput) albumImageInput.value = '';
      if (albumCaptionInput) albumCaptionInput.value = '';
      setAlbumUploadProgress(true, 100, '업로드 완료');
      alert('사진 업로드가 완료되었습니다.');
    })
    .catch((error) => {
      console.error('[DUDUTA] 앨범 업로드 실패:', error);
      const code = error && error.code ? ` (${error.code})` : '';
      if (error && error.code === 'inline-image-too-large') {
        alert('이미지 용량이 너무 커서 업로드에 실패했습니다. 더 작은 이미지로 시도하세요.');
        return;
      }
      alert(`업로드에 실패했습니다${code}. 잠시 후 다시 시도하세요.`);
    })
    .finally(() => {
      albumUploadInProgress = false;
      stopAlbumProgressHeartbeat();
      if (albumUploadBtn) {
        albumUploadBtn.disabled = false;
        albumUploadBtn.textContent = '사진 올리기';
      }
      setTimeout(() => {
        if (!albumUploadInProgress) {
          setAlbumUploadProgress(false, 0, '업로드 준비 중...');
        }
      }, 900);
    });
}

function ensureAlbumBackendReady() {
  if (typeof firebase === 'undefined') {
    return Promise.reject(new Error('firebase-unavailable'));
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
  }
  if (!remoteDb) remoteDb = firebase.firestore();
  if (!remoteAuth) remoteAuth = firebase.auth();
  if (!remoteStorage) remoteStorage = firebase.storage();
  if (!remoteAuth) {
    return Promise.reject(new Error('auth-unavailable'));
  }

  if (remoteAuth.currentUser) {
    remoteReady = true;
    ensureRemoteSubscriptions();
    return Promise.resolve();
  }

  if (!remoteAuthReadyPromise) {
    remoteAuthReadyPromise = remoteAuth.signInAnonymously()
      .then(() => {
        remoteReady = true;
        return true;
      })
      .catch((error) => {
        remoteAuthReadyPromise = null;
        throw error;
      });
  }

  return remoteAuthReadyPromise.then(() => {
    remoteReady = true;
    ensureRemoteSubscriptions();
  });
}

function withTimeout(promise, timeoutMs, code) {
  const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : 10000;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeoutError = new Error(code || 'timeout');
      timeoutError.code = code || 'timeout';
      reject(timeoutError);
    }, ms);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function runWithConcurrencyLimit(items, limit, worker) {
  const list = Array.isArray(items) ? items : [];
  const maxWorkers = Math.max(1, Number(limit) || 1);
  if (!list.length) return Promise.resolve([]);
  const results = new Array(list.length);
  let nextIndex = 0;

  function runOne() {
    if (nextIndex >= list.length) return Promise.resolve();
    const current = nextIndex;
    nextIndex += 1;
    return Promise.resolve(worker(list[current], current))
      .then((value) => {
        results[current] = value;
        return runOne();
      });
  }

  const workers = Array.from({ length: Math.min(maxWorkers, list.length) }, () => runOne());
  return Promise.all(workers).then(() => results);
}

function uploadSingleAlbumFile(file, caption, onProgress) {
  if (!remoteDb) return Promise.reject(new Error('remote db unavailable'));
  const now = Date.now();
  const safeName = String(file.name || 'image.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `duduta_album/${now}_${Math.random().toString(36).slice(2, 10)}_${safeName}`;
  const uploaderId = currentUser ? currentUser.id : guestToken;
  const uploaderName = currentUser ? currentUser.name : 'Guest';
  const ownerType = currentUser ? 'user' : 'guest';
  const basePayload = {
    caption,
    uploaderId,
    uploaderName,
    ownerType,
    createdAtMs: now
  };

  if (remoteStorage && !storageUploadDisabled) {
    return uploadToStorageWithProgress(path, file, onProgress)
      .then((snapshot) => snapshot.ref.getDownloadURL())
      .then((imageUrl) => {
        if (typeof onProgress === 'function') onProgress(1);
        return remoteDb.collection('duduta_album').add({
          ...basePayload,
          imageUrl,
          storagePath: path
        });
      })
      .catch((error) => {
        // Storage 권한/버킷 이슈가 있어도 Firestore 인라인 업로드로 계속 진행
        console.warn('[DUDUTA] Storage 업로드 실패, Firestore 인라인 업로드로 대체:', error);
        if (typeof onProgress === 'function') onProgress(0.22);
        setAlbumUploadStatus('대체 업로드 경로로 전환 중...');
        const code = String(error && error.code ? error.code : '');
        if (isStorageFallbackError(code)) {
          storageUploadDisabled = true;
        }
        return uploadInlineAlbumImage(file, basePayload, onProgress);
      });
  }

  return uploadInlineAlbumImage(file, basePayload, onProgress);
}

function uploadInlineAlbumImage(file, basePayload, onProgress) {
  if (typeof onProgress === 'function') onProgress(0.1);
  setAlbumUploadStatus('이미지 최적화 중...');
  return fileToInlineJpeg(file, ALBUM_INLINE_MAX_WIDTH, ALBUM_INLINE_JPEG_QUALITY, (step) => {
    if (typeof onProgress !== 'function') return;
    const mapped = 0.2 + (Math.max(0, Math.min(1, Number(step) || 0)) * 0.55);
    onProgress(mapped);
  })
    .then((dataUrl) => {
      if (typeof onProgress === 'function') onProgress(0.82);
      const bytes = estimateDataUrlBytes(dataUrl);
      if (bytes > ALBUM_INLINE_IMAGE_MAX_BYTES) {
        const sizeError = new Error('inline-image-too-large');
        sizeError.code = 'inline-image-too-large';
        throw sizeError;
      }
      setAlbumUploadStatus('서버 저장 중...');
      return remoteDb.collection('duduta_album').add({
        ...basePayload,
        imageUrl: dataUrl,
        storagePath: '',
        inline: true
      });
    })
    .then((result) => {
      if (typeof onProgress === 'function') onProgress(1);
      return result;
    });
}

function uploadToStorageWithProgress(path, file, onProgress) {
  if (!remoteStorage) return Promise.reject(new Error('remote-storage-unavailable'));
  return new Promise((resolve, reject) => {
    const task = remoteStorage.ref().child(path).put(file);
    let settled = false;
    let stallTimer = null;
    let totalTimer = null;

    const clearTimers = () => {
      if (stallTimer) clearTimeout(stallTimer);
      if (totalTimer) clearTimeout(totalTimer);
      stallTimer = null;
      totalTimer = null;
    };
    const failWithCode = (code) => {
      if (settled) return;
      settled = true;
      clearTimers();
      try { task.cancel(); } catch (_) {}
      const err = new Error(code);
      err.code = code;
      reject(err);
    };
    const bumpStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => failWithCode('storage/stall-timeout'), STORAGE_UPLOAD_STALL_TIMEOUT_MS);
    };

    totalTimer = setTimeout(() => failWithCode('storage/total-timeout'), STORAGE_UPLOAD_TOTAL_TIMEOUT_MS);
    bumpStallTimer();

    task.on('state_changed', (snapshot) => {
      if (settled) return;
      bumpStallTimer();
      if (typeof onProgress !== 'function') return;
      const total = Number(snapshot && snapshot.totalBytes) || 0;
      const transferred = Number(snapshot && snapshot.bytesTransferred) || 0;
      const ratio = total > 0 ? transferred / total : 0;
      onProgress(0.08 + (ratio * 0.84));
    }, (error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      reject(error);
    }, () => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve(task.snapshot);
    });
  });
}

function isStorageFallbackError(code) {
  const blockedCodes = [
    'storage/unauthorized',
    'storage/retry-limit-exceeded',
    'storage/quota-exceeded',
    'storage/object-not-found',
    'storage/bucket-not-found',
    'storage/invalid-url',
    'storage/unknown',
    'storage/stall-timeout',
    'storage/total-timeout'
  ];
  return blockedCodes.includes(String(code || '').trim());
}

function setAlbumUploadProgress(visible, percent, statusText) {
  if (albumUploadProgress) albumUploadProgress.classList.toggle('hidden', !visible);
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  if (!visible) {
    albumProgressTarget = 0;
    albumProgressDisplay = 0;
    if (albumProgressRaf) cancelAnimationFrame(albumProgressRaf);
    albumProgressRaf = null;
    if (albumUploadBar) albumUploadBar.style.width = '0%';
    if (albumUploadPercent) albumUploadPercent.textContent = '0%';
  } else {
    if (safePercent > albumProgressTarget) {
      albumProgressTarget = safePercent;
    }
    startAlbumProgressAnimator();
  }
  if (albumUploadStatusText && statusText) albumUploadStatusText.textContent = statusText;
}

function setAlbumUploadStatus(text) {
  if (!albumUploadStatusText) return;
  albumUploadStatusText.textContent = text || '업로드 중...';
}

function startAlbumProgressAnimator() {
  if (albumProgressRaf) return;
  const tick = () => {
    const gap = albumProgressTarget - albumProgressDisplay;
    if (gap <= 0.05) {
      albumProgressDisplay = albumProgressTarget;
    } else {
      const step = Math.max(0.4, Math.min(2.8, gap * 0.22));
      albumProgressDisplay = Math.min(albumProgressTarget, albumProgressDisplay + step);
    }

    const shown = Math.max(0, Math.min(100, Math.round(albumProgressDisplay)));
    if (albumUploadBar) albumUploadBar.style.width = `${shown}%`;
    if (albumUploadPercent) albumUploadPercent.textContent = `${shown}%`;

    if (albumProgressDisplay < albumProgressTarget - 0.05) {
      albumProgressRaf = requestAnimationFrame(tick);
      return;
    }
    albumProgressRaf = null;
  };

  albumProgressRaf = requestAnimationFrame(tick);
}

function startAlbumProgressHeartbeat() {
  stopAlbumProgressHeartbeat();
  albumProgressHeartbeat = setInterval(() => {
    if (!albumUploadInProgress) return;
    if (albumProgressTarget >= 92) return;
    albumProgressTarget = Math.min(92, albumProgressTarget + 1);
    startAlbumProgressAnimator();
  }, 1200);
}

function stopAlbumProgressHeartbeat() {
  if (!albumProgressHeartbeat) return;
  clearInterval(albumProgressHeartbeat);
  albumProgressHeartbeat = null;
}

function fileToInlineJpeg(file, maxWidth, quality, onStep) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onprogress = (event) => {
      if (!event || !event.lengthComputable || typeof onStep !== 'function') return;
      const ratio = event.total > 0 ? event.loaded / event.total : 0;
      onStep(0.05 + (ratio * 0.35));
    };
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) {
        reject(new Error('file-read-failed'));
        return;
      }
      if (typeof onStep === 'function') onStep(0.45);

      const img = new Image();
      img.onerror = () => reject(new Error('image-decode-failed'));
      img.onload = () => {
        if (typeof onStep === 'function') onStep(0.7);
        const safeMaxWidth = Number(maxWidth) > 0 ? Number(maxWidth) : 1280;
        const ratio = img.width > safeMaxWidth ? safeMaxWidth / img.width : 1;
        const targetW = Math.max(1, Math.round(img.width * ratio));
        const targetH = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas-unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        if (typeof onStep === 'function') onStep(0.95);
        resolve(canvas.toDataURL('image/jpeg', Number(quality) || 0.8));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlBytes(dataUrl) {
  const raw = String(dataUrl || '');
  const marker = raw.indexOf(',');
  if (marker < 0) return 0;
  const b64 = raw.slice(marker + 1);
  return Math.ceil((b64.length * 3) / 4);
}

function trimAlbumOverflow() {
  if (!remoteDb || albumTrimRunning) return Promise.resolve();
  albumTrimRunning = true;

  return remoteDb.collection('duduta_album')
    .orderBy('createdAtMs', 'desc')
    .get()
    .then((snap) => {
      const overflowDocs = snap.docs.slice(ALBUM_MAX_ITEMS);
      if (!overflowDocs.length) return;
      return Promise.all(overflowDocs.map((doc) => removeAlbumDoc(doc.id, doc.data())));
    })
    .catch((error) => {
      console.error('[DUDUTA] 앨범 정리 실패:', error);
    })
    .finally(() => {
      albumTrimRunning = false;
    });
}

function removeAlbumDoc(id, data) {
  if (!remoteDb) return Promise.resolve();
  const storagePath = data && data.storagePath ? String(data.storagePath) : '';
  const deleteStorage = storagePath && remoteStorage
    ? remoteStorage.ref().child(storagePath).delete().catch((error) => {
      const code = String(error && error.code ? error.code : '');
      if (code === 'storage/object-not-found') return;
      throw error;
    })
    : Promise.resolve();
  return deleteStorage.then(() => remoteDb.collection('duduta_album').doc(id).delete());
}

function openAlbumLightbox(imageUrl) {
  if (!albumLightbox || !albumLightboxImage) return;
  albumLightboxImage.src = imageUrl || '';
  albumLightbox.style.display = 'flex';
}

function closeAlbumLightbox() {
  if (!albumLightbox || !albumLightboxImage) return;
  albumLightboxImage.src = '';
  albumLightbox.style.display = 'none';
}

function canManageAlbumItem(item) {
  if (!item) return false;
  if (isAdmin) return true;
  if (currentUser && item.ownerType === 'user' && item.uploaderId === currentUser.id) return true;
  return !currentUser && item.ownerType === 'guest' && item.uploaderId === guestToken;
}

function deleteAlbumById(id) {
  const target = albumItems.find((item) => item.id === id);
  if (!target) return;
  if (!canManageAlbumItem(target)) {
    alert('삭제 권한이 없습니다.');
    return;
  }
  if (!confirm('이 사진을 삭제할까요?')) return;
  removeAlbumDoc(id, target).catch((error) => {
    console.error('[DUDUTA] 앨범 삭제 실패:', error);
    alert('삭제에 실패했습니다. 잠시 후 다시 시도하세요.');
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
  currentMainFeedPage = 1;
  currentChatFeedPage = 1;
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
  currentMainFeedPage = 1;
  currentChatFeedPage = 1;
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
    currentMainFeedPage = 1;
    renderPosts();
  }
  messageInput.focus();
}

function renderPosts() {
  syncChannelSelectionUI();
  const mainFiltered = activeChannel === 'all'
    ? posts.filter((post) => post.type !== '소통')
    : posts.filter((post) => post.type === activeChannel);
  const chatFiltered = posts.filter((post) => post.type === '소통');
  updateRightFeedPreviewVisibility();
  toggleMainPanelsByChannel();
  renderFeedList(mainFeedList, mainFeedPager, mainFiltered, currentMainFeedPage, 'main', FEED_PAGE_SIZE);
  renderFeedList(chatFeedList, chatFeedPager, chatFiltered, currentChatFeedPage, 'chat', CHAT_FEED_PAGE_SIZE);
}

function updateRightFeedPreviewVisibility() {
  if (!rightFeedPreview) return;
  rightFeedPreview.classList.toggle('hidden', activeChannel === '소통');
}

function toggleMainPanelsByChannel() {
  if (mainFeedPanel) {
    mainFeedPanel.classList.remove('hidden');
  }
}

function applyInitialChannelFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const channelFromUrl = params.get('channel');
  if (!channelFromUrl) return;
  if (channelFromUrl === 'all' || CATEGORIES.includes(channelFromUrl)) {
    activeChannel = channelFromUrl;
  }
}

function syncChannelSelectionUI() {
  if (channelList) {
    channelList.querySelectorAll('.channel-btn').forEach((btn) => {
      const isActive = btn.dataset.channel === activeChannel;
      btn.classList.toggle('active', isActive);
    });
  }
  if (activeChannelTag) {
    activeChannelTag.textContent = activeChannel === 'all' ? '#전체' : `#${activeChannel}`;
  }
  if (activeChannel !== 'all' && CATEGORIES.includes(activeChannel) && typeSelect) {
    typeSelect.value = activeChannel;
  }
  updateActiveTagStyle(activeChannel);
}

function renderFeedList(listEl, pagerEl, filtered, currentPage, mode, pageSize) {
  if (!listEl || !pagerEl) return;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  if (mode === 'main') {
    currentMainFeedPage = safePage;
  } else {
    currentChatFeedPage = safePage;
  }
  const start = (safePage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  if (!pageItems.length) {
    const emptyText = mode === 'main'
      ? '해당 카테고리에 등록된 글이 없습니다.'
      : '소통 카테고리에 등록된 글이 없습니다.';
    listEl.innerHTML = `<div class="post"><div class="post-content">${emptyText}</div></div>`;
    pagerEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = pageItems.map((post) => `
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

  renderFeedPager(pagerEl, totalPages, safePage, mode);
}

function renderFeedPager(pagerEl, totalPages, currentPage, mode) {
  if (totalPages <= 1) {
    pagerEl.innerHTML = '';
    return;
  }

  const buttons = [];
  for (let page = 1; page <= totalPages; page += 1) {
    const fn = mode === 'main' ? 'goFeedPage' : 'goChatFeedPage';
    buttons.push(`
      <button class="pager-btn ${page === currentPage ? 'active' : ''}" onclick="${fn}(${page})">${page}</button>
    `);
  }
  pagerEl.innerHTML = buttons.join('');
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
  if (!adminPanel) return;
  adminPanel.classList.toggle('hidden', !isAdmin);
  updateAdminButton();
  renderAdminUserList();

  if (!isAdmin) return;

  if (!adminPostList) return;
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
    currentMainFeedPage = 1;
    currentChatFeedPage = 1;
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

function renderAdminUserList() {
  if (!adminUserList) return;
  if (!isAdmin) {
    adminUserList.innerHTML = '';
    return;
  }
  if (!users.length) {
    adminUserList.innerHTML = '<div class="admin-item"><div class="post-content">등록된 회원이 없습니다.</div></div>';
    return;
  }

  const sortedUsers = users.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  adminUserList.innerHTML = sortedUsers.map((user) => `
    <article class="admin-item">
      <div class="admin-item-head">
        <div class="admin-item-title">
          <strong>${escapeHtml(user.name || '')}</strong>
        </div>
        <div class="action-row">
          <button class="btn-ghost" onclick="adminRenameUser('${user.id}')">닉네임 변경</button>
          <button class="btn-ghost" onclick="adminDeleteUser('${user.id}')">회원 삭제</button>
        </div>
      </div>
    </article>
  `).join('');
}

function openAdminUsersModal() {
  if (!isAdmin) return;
  renderAdminUserList();
  openModal('adminUsersModal');
}

function adminRenameUser(userId) {
  if (!isAdmin) return;
  const targetUser = users.find((user) => user.id === userId);
  if (!targetUser) return;

  const nextName = prompt('변경할 닉네임', targetUser.name || '');
  if (nextName === null) return;
  const trimmed = nextName.trim();
  if (!trimmed) {
    alert('닉네임을 입력하세요.');
    return;
  }
  if (users.some((user) => user.name === trimmed && user.id !== userId)) {
    alert('이미 존재하는 닉네임입니다.');
    return;
  }
  if (trimmed === targetUser.name) return;

  users = users.map((user) => (user.id === userId ? { ...user, name: trimmed } : user));
  saveJSON(STORAGE_KEYS.users, users);

  posts = posts.map((post) => {
    if ((post.ownerType === 'user' && post.ownerId === userId) || (!post.ownerType && post.nick === targetUser.name)) {
      return { ...post, nick: trimmed, ownerType: 'user', ownerId: userId };
    }
    return post;
  });
  saveJSON(STORAGE_KEYS.posts, posts);

  if (currentUser && currentUser.id === userId) {
    currentUser = { ...currentUser, name: trimmed };
    localStorage.setItem(STORAGE_KEYS.nickname, trimmed);
  }

  if (remoteReady && remoteDb) {
    remoteDb.collection('duduta_users').doc(userId).set({
      name: trimmed,
      pw: targetUser.pw || '',
      updatedAt: Date.now()
    }, { merge: true }).catch((error) => {
      console.error('[DUDUTA] 관리자 회원 닉네임 변경 실패:', error);
      alert('서버 저장에 실패했습니다. 잠시 후 다시 시도하세요.');
    });

    posts
      .filter((post) => post.ownerType === 'user' && post.ownerId === userId)
      .forEach((post) => {
        remoteDb.collection('duduta_posts').doc(post.id).set({
          nick: post.nick,
          ownerType: post.ownerType,
          ownerId: post.ownerId,
          type: post.type,
          text: post.text,
          createdAt: post.createdAt
        }, { merge: true }).catch((error) => {
          console.error('[DUDUTA] 관리자 게시글 작성자 반영 실패:', error);
        });
      });
  }

  renderUserSection();
  syncInputsForCurrentUser();
  renderPosts();
  renderAdminPanel();
}

function adminDeleteUser(userId) {
  if (!isAdmin) return;
  const targetUser = users.find((user) => user.id === userId);
  if (!targetUser) return;
  if (!confirm(`회원 "${targetUser.name}" 을(를) 삭제할까요?`)) return;

  users = users.filter((user) => user.id !== userId);
  saveJSON(STORAGE_KEYS.users, users);

  if (currentUser && currentUser.id === userId) {
    currentUser = null;
    localStorage.removeItem(STORAGE_KEYS.authUserId);
    localStorage.removeItem(STORAGE_KEYS.nickname);
  }

  if (remoteReady && remoteDb) {
    remoteDb.collection('duduta_users').doc(userId).delete().catch((error) => {
      console.error('[DUDUTA] 관리자 회원 삭제 실패:', error);
      alert('서버 삭제에 실패했습니다. 잠시 후 다시 시도하세요.');
    });
  }

  renderUserSection();
  syncInputsForCurrentUser();
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
  localStorage.setItem(STORAGE_KEYS.adminAuth, '1');
  adminPwInput.value = '';
  closeModal('adminModal');
  renderAdminPanel();
  renderPosts();
}

function logoutAdmin() {
  isAdmin = false;
  localStorage.removeItem(STORAGE_KEYS.adminAuth);
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

  const newUser = { id: crypto.randomUUID(), name, pw };
  users.push(newUser);
  saveJSON(STORAGE_KEYS.users, users);

  if (remoteReady && remoteDb) {
    remoteDb.collection('duduta_users').doc(newUser.id).set({
      name: newUser.name,
      pw: newUser.pw,
      createdAt: Date.now()
    }, { merge: true }).catch((error) => {
      console.error('[DUDUTA] 회원가입 서버 저장 실패:', error);
      alert('서버 저장에 실패했습니다. 잠시 후 다시 시도하세요.');
    });
  }

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
  location.reload();
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

  if (remoteReady && remoteDb) {
    remoteDb.collection('duduta_users').doc(currentUser.id).set({
      name: nextName,
      pw: currentUser.pw || '',
      updatedAt: Date.now()
    }, { merge: true }).catch((error) => {
      console.error('[DUDUTA] 닉네임 서버 저장 실패:', error);
      alert('서버 저장에 실패했습니다. 잠시 후 다시 시도하세요.');
    });
  }

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

function syncCurrentUserFromStoredAuth() {
  const authUserId = localStorage.getItem(STORAGE_KEYS.authUserId);
  if (!authUserId) {
    currentUser = null;
    return;
  }
  currentUser = users.find((user) => user.id === authUserId) || null;
}

function hydrateAdminAuth() {
  isAdmin = localStorage.getItem(STORAGE_KEYS.adminAuth) === '1';
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
  themeToggleBtn.innerHTML = isDark
    ? '<svg class="theme-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor"></circle><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="2.2" x2="12" y2="5.2"></line><line x1="12" y1="18.8" x2="12" y2="21.8"></line><line x1="2.2" y1="12" x2="5.2" y2="12"></line><line x1="18.8" y1="12" x2="21.8" y2="12"></line><line x1="4.6" y1="4.6" x2="6.8" y2="6.8"></line><line x1="17.2" y1="17.2" x2="19.4" y2="19.4"></line><line x1="17.2" y1="6.8" x2="19.4" y2="4.6"></line><line x1="4.6" y1="19.4" x2="6.8" y2="17.2"></line></g></svg>'
    : '<svg class="theme-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.9 2.5a1 1 0 0 1 .76 1.63A8.4 8.4 0 1 0 19.87 15a1 1 0 0 1 1.61.79A10.4 10.4 0 1 1 13.95 2.53c.31-.07.63.01.95-.03z" fill="currentColor"></path></svg>';
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
  if (id === 'albumLightbox') {
    closeAlbumLightbox();
    return;
  }
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
  const rawType = String((post && post.type) || '');
  return {
    id: post.id || crypto.randomUUID(),
    nick: post.nick || 'Guest',
    ownerType: post.ownerType || (post.nick === 'Guest' ? 'guest' : 'user'),
    ownerId: post.ownerId || '',
    type: CATEGORIES.includes(rawType) || isDeprecatedPostType(rawType) ? rawType : '소통',
    text: String(post.text || ''),
    createdAt: Number(post.createdAt) || Date.now()
  };
}

function normalizeAlbumItem(item) {
  return {
    id: item.id || crypto.randomUUID(),
    imageUrl: String(item.imageUrl || ''),
    storagePath: String(item.storagePath || ''),
    caption: String(item.caption || ''),
    uploaderId: String(item.uploaderId || ''),
    uploaderName: String(item.uploaderName || 'Guest'),
    ownerType: item.ownerType === 'user' ? 'user' : 'guest',
    createdAtMs: Number(item.createdAtMs) || Date.now()
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
  if (type === '게임정보') return 'type-game';
  if (type === ALBUM_CHANNEL) return 'type-album';
  if (type === '소통') return 'type-chat';
  return '';
}

function updateActiveTagStyle(type) {
  if (!activeChannelTag) return;
  activeChannelTag.classList.remove('type-coupon', 'type-build', 'type-game', 'type-item', 'type-album', 'type-chat');
  const cls = getTypeClass(type);
  if (cls) activeChannelTag.classList.add(cls);
}

function isDeprecatedPostType(type) {
  return REMOVED_POST_TYPES.includes(String(type || ''));
}

function purgeDeprecatedLocalData() {
  const filteredPosts = (posts || []).filter((post) => !isDeprecatedPostType(post.type));
  if (filteredPosts.length !== posts.length) {
    posts = filteredPosts;
    saveJSON(STORAGE_KEYS.posts, posts);
  }

  if (albumItems.length) {
    albumItems = [];
    saveJSON(STORAGE_KEYS.albumItems, albumItems);
  } else {
    localStorage.removeItem(STORAGE_KEYS.albumItems);
  }

  if (activeChannel === ALBUM_CHANNEL || isDeprecatedPostType(activeChannel)) {
    activeChannel = 'all';
  }
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
  currentMainFeedPage = next;
  renderPosts();
}

function goChatFeedPage(page) {
  const next = Number(page);
  if (!Number.isFinite(next) || next < 1) return;
  currentChatFeedPage = next;
  renderPosts();
}

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  ['signupModal', 'loginModal', 'renameModal', 'adminModal', 'postEditModal', 'adminUsersModal', 'albumLightbox'].forEach(closeModal);
  closeAlbumLightbox();
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
window.goChatFeedPage = goChatFeedPage;
window.uploadAlbumImages = uploadAlbumImages;
window.deleteAlbumById = deleteAlbumById;
window.openAlbumLightbox = openAlbumLightbox;
window.closeAlbumLightbox = closeAlbumLightbox;
window.adminRenameUser = adminRenameUser;
window.adminDeleteUser = adminDeleteUser;
window.openAdminUsersModal = openAdminUsersModal;






