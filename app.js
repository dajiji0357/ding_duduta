const STORAGE_KEYS = {
  posts: "duduta_posts_v1",
  parties: "duduta_parties_v1",
  memo: "duduta_strategy_memo_v1",
  nickname: "duduta_nickname_v1"
};

const defaultPosts = [
  { id: crypto.randomUUID(), nick: "GM_Duduta", type: "공지", text: "이번 주 길드전은 토요일 21:00 시작입니다.", createdAt: Date.now() - 1000 * 60 * 90 },
  { id: crypto.randomUUID(), nick: "BladeFox", type: "전략", text: "3넴 광폭화 전에 딜몰이 타이밍 맞추면 안정적입니다.", createdAt: Date.now() - 1000 * 60 * 40 },
  { id: crypto.randomUUID(), nick: "HealerJ", type: "파티", text: "하드 던전 힐러 1명 구해요. 디코 가능하신 분!", createdAt: Date.now() - 1000 * 60 * 10 }
];

const defaultParties = [
  { id: crypto.randomUUID(), title: "길드 레이드 1파티", time: "20:30", slots: 8 }
];

let posts = loadJSON(STORAGE_KEYS.posts, defaultPosts);
let parties = loadJSON(STORAGE_KEYS.parties, defaultParties);
let activeChannel = "all";

const channelList = document.getElementById("channelList");
const feedList = document.getElementById("feedList");
const activeChannelTag = document.getElementById("activeChannelTag");
const nicknameInput = document.getElementById("nicknameInput");
const messageInput = document.getElementById("messageInput");
const typeSelect = document.getElementById("typeSelect");
const partyList = document.getElementById("partyList");
const strategyMemo = document.getElementById("strategyMemo");

nicknameInput.value = localStorage.getItem(STORAGE_KEYS.nickname) || "";
strategyMemo.value = localStorage.getItem(STORAGE_KEYS.memo) || "";

channelList.addEventListener("click", (event) => {
  const button = event.target.closest(".channel-btn");
  if (!button) return;
  activeChannel = button.dataset.channel;
  channelList.querySelectorAll(".channel-btn").forEach((btn) => btn.classList.remove("active"));
  button.classList.add("active");
  activeChannelTag.textContent = activeChannel === "all" ? "#전체" : `#${activeChannel}`;
  renderPosts();
});

function addPost() {
  const nick = nicknameInput.value.trim();
  const text = messageInput.value.trim();
  const type = typeSelect.value;

  if (!nick || !text) {
    alert("닉네임과 메시지를 입력하세요.");
    return;
  }

  const post = {
    id: crypto.randomUUID(),
    nick,
    type,
    text,
    createdAt: Date.now()
  };

  posts.unshift(post);
  posts = posts.slice(0, 120);
  localStorage.setItem(STORAGE_KEYS.nickname, nick);
  saveJSON(STORAGE_KEYS.posts, posts);
  messageInput.value = "";
  renderPosts();
}

function addParty() {
  const title = document.getElementById("partyTitle").value.trim();
  const time = document.getElementById("partyTime").value.trim();
  const slots = Number(document.getElementById("partySlots").value);

  if (!title || !time || !slots) {
    alert("모집 제목, 시간, 인원을 입력하세요.");
    return;
  }

  parties.unshift({
    id: crypto.randomUUID(),
    title,
    time,
    slots
  });

  parties = parties.slice(0, 30);
  saveJSON(STORAGE_KEYS.parties, parties);
  document.getElementById("partyTitle").value = "";
  document.getElementById("partyTime").value = "";
  document.getElementById("partySlots").value = "";
  renderParties();
}

function removeParty(id) {
  parties = parties.filter((party) => party.id !== id);
  saveJSON(STORAGE_KEYS.parties, parties);
  renderParties();
}

function clearPosts() {
  if (!confirm("피드를 초기화할까요?")) return;
  posts = [];
  saveJSON(STORAGE_KEYS.posts, posts);
  renderPosts();
}

function saveMemo() {
  localStorage.setItem(STORAGE_KEYS.memo, strategyMemo.value || "");
  alert("전략 메모를 저장했습니다.");
}

function insertTemplate(text) {
  messageInput.value = text;
  messageInput.focus();
}

function renderPosts() {
  const filtered = activeChannel === "all" ? posts : posts.filter((post) => post.type === activeChannel);
  if (!filtered.length) {
    feedList.innerHTML = `<div class="post"><div class="post-content">해당 채널 메시지가 아직 없습니다.</div></div>`;
    return;
  }

  feedList.innerHTML = filtered.map((post) => `
    <article class="post">
      <div class="post-meta">
        <span><strong>${escapeHtml(post.nick)}</strong></span>
        <span class="post-type">#${escapeHtml(post.type)}</span>
        <span>${formatTime(post.createdAt)}</span>
      </div>
      <div class="post-content">${escapeHtml(post.text)}</div>
    </article>
  `).join("");
}

function renderParties() {
  if (!parties.length) {
    partyList.innerHTML = `<div class="party-card"><div class="party-meta">현재 모집글이 없습니다.</div></div>`;
    return;
  }

  partyList.innerHTML = parties.map((party) => `
    <article class="party-card">
      <div class="party-title">${escapeHtml(party.title)}</div>
      <div class="party-meta">시간: ${escapeHtml(party.time)} | 모집: ${party.slots}명</div>
      <button class="btn-ghost" onclick="removeParty('${party.id}')">모집 종료</button>
    </article>
  `).join("");
}

function formatTime(ms) {
  const date = new Date(ms);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
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

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

renderPosts();
renderParties();

window.addPost = addPost;
window.addParty = addParty;
window.removeParty = removeParty;
window.clearPosts = clearPosts;
window.saveMemo = saveMemo;
window.insertTemplate = insertTemplate;
