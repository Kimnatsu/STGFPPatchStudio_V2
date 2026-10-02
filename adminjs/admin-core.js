// ===== Cloudinary 이미지 업로드 설정 =====
const CLOUDINARY_CONFIG = {
  cloudName:    'ds8fi00id',
  uploadPreset: 'zgzhnk6x',
  baseFolder:   'fighting-path',

  // 허용 파일 형식
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],

  // 파일 크기 제한 (10MB)
  maxSizeBytes: 10 * 1024 * 1024,
};

// ===== Cloudinary 이미지 업로드 =====
// - Unsigned preset 사용 (API Secret 불필요)
// - 파일 형식 및 크기 사전 검증
// - 업로드 성공 시 secure_url 반환
async function uploadImageToStorage(file, folder) {
  // 파일 형식 검증
  if (!CLOUDINARY_CONFIG.allowedTypes.includes(file.type)) {
    throw new Error(`지원하지 않는 파일 형식입니다. (허용: JPG, PNG, WEBP, GIF)`);
  }

  // 파일 크기 검증
  if (file.size > CLOUDINARY_CONFIG.maxSizeBytes) {
    const limitMB = CLOUDINARY_CONFIG.maxSizeBytes / (1024 * 1024);
    throw new Error(`파일 크기가 너무 큽니다. (최대 ${limitMB}MB)`);
  }

  const formData = new FormData();
  formData.append('file',           file);
  formData.append('upload_preset',  CLOUDINARY_CONFIG.uploadPreset);
  formData.append('folder',         `${CLOUDINARY_CONFIG.baseFolder}/${folder}`);

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`;

  let res;
  try {
    res = await fetch(endpoint, { method: 'POST', body: formData });
  } catch (networkErr) {
    throw new Error(`네트워크 오류로 업로드에 실패했습니다. 인터넷 연결을 확인해주세요.`);
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const msg = errData?.error?.message || '알 수 없는 오류';
    throw new Error(`업로드 실패 (${res.status}): ${msg}`);
  }

  const result = await res.json();

  if (!result.secure_url) {
    throw new Error('업로드는 완료됐지만 URL을 받지 못했습니다. 다시 시도해주세요.');
  }

  return result.secure_url;
}

// ===== ADMIN CONFIGURATION =====

// ★ 관리자 이메일 추가/제거 시 firestore.rules 의 isAdmin() 과 반드시 동기화하세요.
const ADMIN_EMAILS = [
  'gichan1005kim@gmail.com',
  'gimbaein7@gmail.com',
  'kyg12555@gmail.com',
  'skadlstj9081@gmail.com',
  'brawnstars201596@gmail.com',
];

// 총괄 관리자 (권한관리 섹션 접근 가능)
const SUPER_ADMIN_EMAIL = 'gichan1005kim@gmail.com';

function isSuperAdmin() {
  return currentUser?.email === SUPER_ADMIN_EMAIL;
}
// 총괄 관리자 or canPermission 부여받은 관리자
let _myCanPermission  = false;
let _myCanManageUsers = false;
function hasPermAccess() {
  return isSuperAdmin() || _myCanPermission;
}
function hasMemberAccess() {
  return isSuperAdmin() || _myCanManageUsers || _myCanPermission;
}

// ===== GRANULAR SECTION PERMISSIONS =====
const SECTION_CONFIG = [
  { sidebarKey: 'characters',   permKey: 'characters',   label: '캐릭터' },
  { sidebarKey: 'supportchars', permKey: 'supportChars', label: '서포트 캐릭터' },
  { sidebarKey: 'pvppatch',     permKey: 'pvpPatch',     label: 'PvP 패치' },
  { sidebarKey: 'patchnote',    permKey: 'patchNotes',   label: '패치노트' },
  { sidebarKey: 'banners',      permKey: 'banners',      label: '배너' },
  { sidebarKey: 'events',       permKey: 'events',       label: '이벤트' },
  { sidebarKey: 'boards',       permKey: 'boards',       label: '게시판' },
  { sidebarKey: 'notices',      permKey: 'notices',      label: '공지사항' },
];
const PERM_ACTIONS = [
  { key: 'view',    label: '보기' },
  { key: 'add',     label: '추가' },
  { key: 'edit',    label: '수정' },
  { key: 'delete',  label: '삭제' },
  { key: 'publish', label: '저장' },
];

let _myPerms = null; // { canManageContent?, sectionPerms?: { [permKey]: { view,add,edit,delete,publish } } }

function _checkSectionPerm(permKey, action) {
  if (isSuperAdmin()) return true;
  if (!_myPerms) return false;
  if (_myPerms.sectionPerms) return _myPerms.sectionPerms[permKey]?.[action] === true;
  return _myPerms.canManageContent !== false;
}
function canViewSection(sidebarKey) {
  const cfg = SECTION_CONFIG.find(s => s.sidebarKey === sidebarKey);
  if (!cfg) return true;
  return _checkSectionPerm(cfg.permKey, 'view');
}
function canAddIn(permKey)     { return _checkSectionPerm(permKey, 'add'); }
function canEditIn(permKey)    { return _checkSectionPerm(permKey, 'edit'); }
function canDeleteIn(permKey)  { return _checkSectionPerm(permKey, 'delete'); }
function canPublishIn(permKey) { return _checkSectionPerm(permKey, 'publish'); }

function _enforcePermUI() {
  if (isSuperAdmin()) return; // 총괄 관리자는 모두 허용
  // 사이드바 섹션 버튼 보기/숨기기
  document.querySelectorAll('.sidebar-item[data-section]').forEach(btn => {
    const sk = btn.dataset.section;
    if (['profile', 'permissions', 'members', 'backup', 'dashboard', 'userpage'].includes(sk)) return;
    btn.style.display = canViewSection(sk) ? '' : 'none';
  });
  // 추가 버튼
  const addBtns = [
    { id: 'btnAddChar',        key: 'characters' },
    { id: 'btnAddSupportChar', key: 'supportChars' },
    { id: 'btnAddPvp',         key: 'pvpPatch' },
    { id: 'btnAddPatchNote',   key: 'patchNotes' },
    { id: 'btnAddBanner',      key: 'banners' },
    { id: 'btnAddEvtPage',     key: 'events' },
    { id: 'btnAddBoard',       key: 'boards' },
  ];
  addBtns.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (el) el.style.display = canAddIn(key) ? '' : 'none';
  });
  // 저장 / 되돌리기 버튼
  const pubBtns = [
    { pub: 'btnPublishChars',        rev: 'btnRevertChars',        key: 'characters' },
    { pub: 'btnPublishSupportChars', rev: 'btnRevertSupportChars', key: 'supportChars' },
    { pub: 'btnPublishPvp',          rev: 'btnRevertPvp',          key: 'pvpPatch' },
    { pub: 'btnPublishPatchNotes',   rev: 'btnRevertPatchNotes',   key: 'patchNotes' },
    { pub: 'btnPublishBanners',      rev: 'btnRevertBanners',      key: 'banners' },
    { pub: 'btnPublishEvtPages',     rev: 'btnRevertEvtPages',     key: 'events' },
  ];
  pubBtns.forEach(({ pub, rev, key }) => {
    const can = canPublishIn(key);
    [pub, rev].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = can ? '' : 'none';
    });
  });
}

// ===== AUTH STATE =====
let currentUser = null;

// ===== GNB 프로필 동기화 =====
function updateGNBProfile(nickname, imageUrl) {
  const nameEl   = document.getElementById('adminUserName');
  const avatarEl = document.getElementById('adminUserAvatar');
  if (!nameEl || !avatarEl) return;
  const fallbackEl = document.getElementById('sidebarProfileAvatarFallback');
  nameEl.textContent = nickname || currentUser?.displayName || currentUser?.email || '';
  if (imageUrl) {
    avatarEl.src          = imageUrl;
    avatarEl.style.display = 'block';
    if (fallbackEl) fallbackEl.style.display = 'none';
  } else {
    avatarEl.style.display = 'none';
    if (fallbackEl) fallbackEl.style.display = 'inline-flex';
  }
}

// 현재 사용자 표시 레이블: "닉네임 (이메일)" 또는 이메일만
function getCurrentUserLabel() {
  const email    = currentUser?.email || '';
  const nickname = profileData?.nickname || currentUser?.displayName || '';
  return nickname ? `${nickname} (${email})` : email;
}

// ── 어드민 닉네임 조회 캐시 (이메일 → 닉네임) ──
let _adminNicknameMap = {};

// updatedBy 값이 이메일만인 경우 닉네임을 붙여 "닉네임 (이메일)" 형식으로 변환
function resolveAdminLabel(updatedBy) {
  if (!updatedBy) return '—';
  // 이미 "닉네임 (이메일)" 형식이면 그대로 반환
  if (updatedBy.includes(' (') && updatedBy.endsWith(')')) return updatedBy;
  const nickname = _adminNicknameMap[updatedBy];
  return nickname ? `${nickname} (${updatedBy})` : updatedBy;
}

// Firestore adminMeta/nicknames 에서 전체 어드민 닉네임 로드
async function loadAdminNicknameMap() {
  try {
    const snap = await db.collection('adminMeta').doc('nicknames').get();
    if (snap.exists) _adminNicknameMap = { ..._adminNicknameMap, ...snap.data() };
  } catch(e) {}
}

// 현재 로그인된 어드민 닉네임을 공유 맵에 저장 (다른 관리자도 볼 수 있도록)
async function saveAdminNicknameToMap() {
  if (!currentUser?.email) return;
  const nickname = profileData?.nickname || currentUser?.displayName || '';
  if (!nickname) return;
  try {
    await db.collection('adminMeta').doc('nicknames').set(
      { [currentUser.email]: nickname }, { merge: true }
    );
    _adminNicknameMap[currentUser.email] = nickname;
  } catch(e) {}
}

// 컬렉션 도큐먼트 목록에서 가장 최근 변경 정보를 추출해 하단 퍼블리시 바에 표시
function updateBarFromDocs(docs, infoElId) {
  if (!docs || !docs.length) return;
  let best = null, bestMs = 0;
  docs.forEach(d => {
    const ms = d.updatedAt?.toMillis ? d.updatedAt.toMillis() : 0;
    if (ms > bestMs) { bestMs = ms; best = d; }
  });
  if (!best || !best.updatedAt) return;
  const label = resolveAdminLabel(best.updatedBy || '');
  const pi = label.lastIndexOf(' (');
  const name  = pi !== -1 ? label.slice(0, pi) : label;
  const email = pi !== -1 ? label.slice(pi + 2, -1) : label;
  renderPublishInfo(infoElId, { publishedName: name, publishedEmail: email, publishedAt: best.updatedAt });
}

// =====================================================================
//  AUTH INIT
// =====================================================================

const ADMIN_SESSION_EXPIRY_KEY = 'adminSessionExpiry';
const ADMIN_SESSION_EXPIRY_MS  = 6 * 60 * 60 * 1000; // 6시간

function _isSessionExpired() {
  const v = sessionStorage.getItem(ADMIN_SESSION_EXPIRY_KEY);
  return v ? Date.now() > parseInt(v, 10) : false;
}

let _sessionCheckTimer = null;

function startSessionExpiryCheck() {
  clearInterval(_sessionCheckTimer);
  _sessionCheckTimer = setInterval(async () => {
    if (_isSessionExpired()) {
      clearInterval(_sessionCheckTimer);
      _sessionCheckTimer = null;
      sessionStorage.removeItem(ADMIN_SESSION_EXPIRY_KEY);
      await auth.signOut();
      showToast('세션이 만료되었습니다. 다시 로그인해주세요.', 'info');
    }
  }, 60 * 1000);
}

function stopSessionExpiryCheck() {
  clearInterval(_sessionCheckTimer);
  _sessionCheckTimer = null;
}

auth.onAuthStateChanged(async user => {
  if (!user) {
    stopSessionExpiryCheck();
    _showLoginOverlay();
    return;
  }
  if (_isSessionExpired()) {
    sessionStorage.removeItem(ADMIN_SESSION_EXPIRY_KEY);
    await auth.signOut();
    return;
  }
  if (!ADMIN_EMAILS.includes(user.email)) {
    _showLoginError(`접근 권한이 없습니다. (${user.email})`);
    await auth.signOut();
    return;
  }
  currentUser = user;
  startSessionExpiryCheck();
  _hideLoginOverlay(user);
  try {
    await loadAllData();
  } catch (err) {
    console.error('관리자 데이터 로드 실패:', err);
    showToast('데이터를 불러오지 못했습니다. 페이지를 새로고침해 주세요.', 'error');
  }
});

function _showLoginOverlay() {
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.getElementById('adminAuthArea').style.display = 'none';
}

function _hideLoginOverlay(user) {
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('adminAuthArea').style.display = 'flex';

  // 총괄 관리자 or 관련 권한이 있는 관리자에게 운영 메뉴 노출
  const memberBtn = document.getElementById('sidebarMembersBtn');
  const permBtn = document.getElementById('sidebarPermissionsBtn');
  if (memberBtn && user.email === SUPER_ADMIN_EMAIL) memberBtn.style.display = '';
  if (permBtn) {
    if (user.email === SUPER_ADMIN_EMAIL) {
      permBtn.style.display = '';
      if (memberBtn) memberBtn.style.display = '';
    } else {
      permBtn.style.display = 'none';
      if (memberBtn) memberBtn.style.display = 'none';
      db.collection('adminPermissions').doc(user.email).get().then(snap => {
        if (snap.exists) {
          const d = snap.data();
          _myCanPermission  = d.canPermission  === true;
          _myCanManageUsers = d.canManageUsers === true;
          _myPerms = { canManageContent: d.canManageContent, sectionPerms: d.sectionPerms || null };
        }
        if (permBtn) permBtn.style.display = _myCanPermission ? '' : 'none';
        if (memberBtn) memberBtn.style.display = hasMemberAccess() ? '' : 'none';
        _enforcePermUI();
      }).catch(() => {});
    }
  }

  // Auth 정보로 즉시 표시 후 Firestore 커스텀 프로필로 덮어씌우기
  updateGNBProfile(user.displayName, user.photoURL);
  db.collection('users').doc(user.uid).get().then(snap => {
    if (snap.exists) {
      const d = snap.data();
      profileData = d;
      updateGNBProfile(
        d.nickname || user.displayName,
        d.avatar || d.profileImage || user.photoURL
      );
      saveAdminNicknameToMap();
    }
  }).catch(() => {});
}

function _showLoginError(msg) {
  const el = document.getElementById('loginError');
  if (!el) return;
  el.textContent   = msg;
  el.style.display = 'block';
}

// =====================================================================
//  로그인 버튼 이벤트
// =====================================================================
const _GOOGLE_ICON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
</svg>`;

function _resetSigninBtn(btn) {
  btn.disabled = false;
  btn.innerHTML = `${_GOOGLE_ICON_SVG} Google로 로그인`;
}

function initAuthButtons() {
  const btnSignin = document.getElementById('btnGoogleSignin');
  if (!btnSignin) return;

  btnSignin.addEventListener('click', async () => {
    btnSignin.disabled   = true;
    btnSignin.textContent = '로그인 중...';
    document.getElementById('loginError').style.display = 'none';

    try {
      const rememberMe  = document.getElementById('loginRememberMe')?.checked ?? false;
      const persistence = rememberMe
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
      await auth.setPersistence(persistence);

      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);

      if (!rememberMe) {
        sessionStorage.setItem(ADMIN_SESSION_EXPIRY_KEY, String(Date.now() + ADMIN_SESSION_EXPIRY_MS));
      } else {
        sessionStorage.removeItem(ADMIN_SESSION_EXPIRY_KEY);
      }
    } catch (err) {
      _resetSigninBtn(btnSignin);
      if (err.code === 'auth/popup-blocked') {
        _showLoginError('팝업이 차단됐습니다. 브라우저 팝업 허용 후 다시 시도하세요.');
      } else if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // 사용자가 직접 닫은 경우 — 에러 메시지 불필요
      } else if (err.code === 'auth/unauthorized-domain') {
        _showLoginError('이 도메인은 Firebase에 등록되지 않았습니다. Firebase Console > Authentication > 승인된 도메인을 확인하세요.');
      } else {
        _showLoginError('로그인에 실패했습니다: ' + (err.message || err.code));
      }
    }
  });

  const btnSignout = document.getElementById('btnSignout');
  if (btnSignout) {
    btnSignout.addEventListener('click', async () => {
      closeProfileDropdown();
      sessionStorage.removeItem(ADMIN_SESSION_EXPIRY_KEY);
      stopSessionExpiryCheck();
      await auth.signOut();
      currentUser = null;
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthButtons);
} else {
  initAuthButtons();
}

// ===== GNB 프로필 드롭다운 =====
(function initProfileDropdown() {
  const authArea   = document.getElementById('adminAuthArea');
  const profileBtn = document.getElementById('adminProfileBtn');
  const btnMyProfile = document.getElementById('btnMyProfile');

  function openProfileDropdown() {
    authArea?.classList.add('open');
    profileBtn?.setAttribute('aria-expanded', 'true');
  }
  function closeProfileDropdown() {
    authArea?.classList.remove('open');
    profileBtn?.setAttribute('aria-expanded', 'false');
  }
  window.closeProfileDropdown = closeProfileDropdown;

  profileBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (authArea.classList.contains('open')) {
      closeProfileDropdown();
    } else {
      openProfileDropdown();
    }
  });
  profileBtn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      profileBtn.click();
    }
  });

  document.getElementById('sidebarProfileSettings')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeProfileDropdown();
    switchSection('profile');
    loadProfileSection();
  });

  btnMyProfile?.addEventListener('click', () => {
    closeProfileDropdown();
    switchSection('profile');
    loadProfileSection();
  });

  document.addEventListener('click', (e) => {
    if (!authArea?.contains(e.target)) closeProfileDropdown();
  });
})();

// ===== SECTION SWITCH =====
function initSidebarSections() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || nav.dataset.grouped === 'true') return;

  const sectionButtons = [...nav.querySelectorAll(':scope > .sidebar-section-item')];
  sectionButtons.forEach((sectionButton) => {
    const group = document.createElement('div');
    group.className = 'sidebar-group';
    if (sectionButton.classList.contains('sidebar-shortcut-item')) {
      group.classList.add('sidebar-shortcut-group');
    }
    group.dataset.sidebarGroup = sectionButton.textContent.trim();
    if (sectionButton.getAttribute('aria-expanded') === 'true') group.classList.add('open');

    nav.insertBefore(group, sectionButton);
    group.appendChild(sectionButton);

    const list = document.createElement('div');
    list.className = 'sidebar-section-list';
    group.appendChild(list);

    let node = group.nextSibling;
    while (node && !(node.nodeType === 1 && node.classList.contains('sidebar-section-item'))) {
      const nextNode = node.nextSibling;
      if (node.nodeType === 1 && node.classList.contains('sidebar-item')) {
        list.appendChild(node);
      } else if (node.nodeType === 3 && !node.textContent.trim()) {
        node.remove();
      }
      node = nextNode;
    }

    sectionButton.addEventListener('click', () => {
      const shouldOpen = !group.classList.contains('open');
      document.querySelectorAll('.sidebar-group').forEach(otherGroup => {
        if (otherGroup !== group) {
          otherGroup.classList.remove('open');
          otherGroup.querySelector('.sidebar-section-item')?.setAttribute('aria-expanded', 'false');
        }
      });
      group.classList.toggle('open', shouldOpen);
      sectionButton.setAttribute('aria-expanded', String(shouldOpen));
    });
  });

  nav.dataset.grouped = 'true';
}

function syncSidebarSections(sectionKey) {
  const activeItem = document.querySelector(`.sidebar-item[data-section="${sectionKey}"]`);
  const activeGroup = activeItem?.closest('.sidebar-group');
  if (!activeGroup) return;
  document.querySelectorAll('.sidebar-group').forEach(group => {
    // 바로가기는 다른 메뉴로 이동해도 항상 노출한다.
    if (group.classList.contains('sidebar-shortcut-group')) {
      group.classList.add('open');
      return;
    }
    const isActive = group === activeGroup;
    group.classList.toggle('open', isActive);
    group.querySelector('.sidebar-section-item')?.setAttribute('aria-expanded', String(isActive));
  });
}

initSidebarSections();
document.querySelectorAll('.sidebar-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.external === 'true') return;
    switchSection(btn.dataset.section);
  });
});

// ===== GNB 멀티탭 시스템 =====
const SECTION_NAMES = {
  dashboard:    '홈',
  characters:   '캐릭터 관리',
  supportchars: '현질 서폿 캐릭터 관리',
  pvppatch:     'PvP 패치 관리',
  patchnote:    '패치노트 관리',
  banners:      '메인 배너 관리',
  events:       '이벤트 관리',
  notices:      '공지사항 관리',
  backup:       '백업 / 복원',
  profile:      '내 정보',
  members:      '멤버 관리',
  permissions:  '권한 관리',
  boards:       '게시판 관리',
  support:      '고객센터 관리',
  userpage:     '사용자 페이지',
};

let _openTabs   = ['dashboard'];
let _activeTab  = 'dashboard';
let _tabHistory = ['dashboard'];
let _tabCursor  = 0;

let _dragSrcSection = null;

function renderGnbTabs() {
  const container = document.getElementById('gnbTabs');
  if (!container) return;
  container.innerHTML = '';

  function _clearInsertIndicators() {
    container.querySelectorAll('.gnb-tab--insert-before, .gnb-tab--insert-after')
      .forEach(el => el.classList.remove('gnb-tab--insert-before', 'gnb-tab--insert-after'));
  }

  function _reorderTabs(srcSection, targetSection, insertBefore) {
    const fromIdx = _openTabs.indexOf(srcSection);
    let toIdx = _openTabs.indexOf(targetSection);
    if (fromIdx === -1 || toIdx === -1) return;
    if (!insertBefore) toIdx++;
    if (fromIdx < toIdx) toIdx--;
    toIdx = Math.max(1, toIdx); // 홈(index 0) 앞에는 삽입 불가
    _openTabs.splice(fromIdx, 1);
    _openTabs.splice(toIdx, 0, srcSection);
    // 홈은 항상 0번 고정
    const dIdx = _openTabs.indexOf('dashboard');
    if (dIdx > 0) { _openTabs.splice(dIdx, 1); _openTabs.unshift('dashboard'); }
    renderGnbTabs();
  }

  _openTabs.forEach(section => {
    const isDashboard = section === 'dashboard';
    const tab = document.createElement('div');
    tab.className = 'gnb-tab' + (section === _activeTab ? ' active' : '') + (isDashboard ? ' gnb-tab--home' : '');
    tab.dataset.section = section;
    tab.draggable = !isDashboard; // 홈 탭은 드래그 불가

    const label = document.createElement('span');
    label.className = 'gnb-tab-label';
    label.textContent = SECTION_NAMES[section] || section;
    tab.appendChild(label);

    if (!isDashboard) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'gnb-tab-close';
      closeBtn.textContent = '×';
      closeBtn.title = '탭 닫기';
      closeBtn.addEventListener('click', e => { e.stopPropagation(); closeGnbTab(section); });
      tab.appendChild(closeBtn);
    }

    // ── PC: HTML5 Drag-to-Reorder (Chrome 스타일) ──
    if (!isDashboard) {
      tab.addEventListener('dragstart', (e) => {
        _dragSrcSection = section;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', section);
        setTimeout(() => tab.classList.add('gnb-tab--dragging'), 0);
      });
      tab.addEventListener('dragend', () => {
        tab.classList.remove('gnb-tab--dragging');
        _clearInsertIndicators();
        _dragSrcSection = null;
      });
    }

    // dragover / dragleave / drop 은 홈 탭 제외한 모든 탭에서 수신
    if (!isDashboard) {
      tab.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!_dragSrcSection || _dragSrcSection === section) return;
        _clearInsertIndicators();
        const rect = tab.getBoundingClientRect();
        tab.classList.add(e.clientX < rect.left + rect.width / 2 ? 'gnb-tab--insert-before' : 'gnb-tab--insert-after');
      });
      tab.addEventListener('dragleave', (e) => {
        if (!tab.contains(e.relatedTarget)) tab.classList.remove('gnb-tab--insert-before', 'gnb-tab--insert-after');
      });
      tab.addEventListener('drop', (e) => {
        e.preventDefault();
        const insertBefore = tab.classList.contains('gnb-tab--insert-before');
        tab.classList.remove('gnb-tab--insert-before', 'gnb-tab--insert-after');
        if (!_dragSrcSection || _dragSrcSection === section) return;
        _reorderTabs(_dragSrcSection, section, insertBefore);
      });
    }

    // ── 모바일: Pointer-based Drag-to-Reorder ──
    if (!isDashboard) {
      let _ptTimer = null;
      let _ptActive = false;
      let _ptStartX = 0;

      tab.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        _ptStartX = e.clientX;
        _ptTimer = setTimeout(() => {
          _ptActive = true;
          _dragSrcSection = section;
          tab.setPointerCapture(e.pointerId);
          tab.classList.add('gnb-tab--dragging');
        }, 350);
      });

      tab.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse' || !_ptActive) {
          if (_ptTimer && Math.abs(e.clientX - _ptStartX) > 8) {
            clearTimeout(_ptTimer); _ptTimer = null; // 스크롤 중이면 타이머 취소
          }
          return;
        }
        _clearInsertIndicators();
        const below = document.elementFromPoint(e.clientX, e.clientY);
        const targetTab = below?.closest('.gnb-tab');
        if (targetTab && targetTab !== tab && !targetTab.classList.contains('gnb-tab--home')) {
          const rect = targetTab.getBoundingClientRect();
          targetTab.classList.add(e.clientX < rect.left + rect.width / 2 ? 'gnb-tab--insert-before' : 'gnb-tab--insert-after');
        }
      });

      tab.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'mouse') return;
        clearTimeout(_ptTimer); _ptTimer = null;
        if (!_ptActive) { _ptActive = false; return; }
        tab.classList.remove('gnb-tab--dragging');
        const below = document.elementFromPoint(e.clientX, e.clientY);
        const targetTab = below?.closest('.gnb-tab');
        if (targetTab && targetTab !== tab && !targetTab.classList.contains('gnb-tab--home')) {
          const insertBefore = targetTab.classList.contains('gnb-tab--insert-before');
          _clearInsertIndicators();
          _reorderTabs(section, targetTab.dataset.section, insertBefore);
        } else {
          _clearInsertIndicators();
        }
        _ptActive = false;
        _dragSrcSection = null;
      });

      tab.addEventListener('pointercancel', () => {
        clearTimeout(_ptTimer); _ptTimer = null;
        tab.classList.remove('gnb-tab--dragging');
        _clearInsertIndicators();
        _ptActive = false;
        _dragSrcSection = null;
      });
    }

    tab.addEventListener('click', () => activateGnbTab(section));
    container.appendChild(tab);
  });

  const backBtn = document.getElementById('gnbNavBack');
  const fwdBtn  = document.getElementById('gnbNavForward');
  if (backBtn) backBtn.disabled = _tabCursor <= 0;
  if (fwdBtn)  fwdBtn.disabled  = _tabCursor >= _tabHistory.length - 1;
}

function activateGnbTab(section, pushHistory = true) {
  _activeTab = section;
  syncSidebarSections(section);
  document.querySelectorAll('.sidebar-item').forEach(b => {
    b.classList.toggle('active', b.dataset.section === section);
  });
  document.querySelectorAll('.admin-section').forEach(s => {
    s.classList.toggle('active', s.id === 'section-' + section);
  });
  if (pushHistory) {
    _tabHistory = _tabHistory.slice(0, _tabCursor + 1);
    if (_tabHistory[_tabCursor] !== section) { _tabHistory.push(section); _tabCursor++; }
  }
  renderGnbTabs();
  const mobileTitle = document.getElementById('gnbMobileTitle');
  if (mobileTitle) mobileTitle.textContent = SECTION_NAMES[section] || section;
}

function closeGnbTab(section) {
  const idx = _openTabs.indexOf(section);
  if (idx === -1) return;
  _openTabs.splice(idx, 1);
  if (_activeTab === section) {
    const next = _openTabs[Math.min(idx, _openTabs.length - 1)];
    activateGnbTab(next);
  } else {
    renderGnbTabs();
  }
}

function switchSection(sectionKey) {
  // 권한관리 섹션은 총괄 관리자 or canPermission 부여받은 관리자만 접근 가능
  if (sectionKey === 'permissions' && !hasPermAccess()) {
    showToast('권한 관리 섹션 접근 권한이 없습니다.', 'error');
    return;
  }
  if (sectionKey === 'members' && !hasMemberAccess()) {
    showToast('멤버 관리 섹션 접근 권한이 없습니다.', 'error');
    return;
  }
  // 콘텐츠 섹션별 보기 권한 체크
  if (!isSuperAdmin() && !canViewSection(sectionKey)) {
    showToast('해당 섹션에 대한 접근 권한이 없습니다.', 'error');
    return;
  }
  if (!_openTabs.includes(sectionKey)) _openTabs.push(sectionKey);
  activateGnbTab(sectionKey);
  if (sectionKey === 'profile') loadProfileSection();
  if (sectionKey === 'members') loadPermUsers();
  if (sectionKey === 'permissions') loadPermissionsSection();
  if (sectionKey === 'events') loadEvtPages();
  if (sectionKey === 'boards') loadBoards();
  if (sectionKey === 'notices') loadNotices();
}

document.getElementById('gnbNavBack')?.addEventListener('click', () => {
  if (_tabCursor > 0) { _tabCursor--; activateGnbTab(_tabHistory[_tabCursor], false); }
});
document.getElementById('gnbNavForward')?.addEventListener('click', () => {
  if (_tabCursor < _tabHistory.length - 1) { _tabCursor++; activateGnbTab(_tabHistory[_tabCursor], false); }
});
document.getElementById('gnbNavClose')?.addEventListener('click', () => {
  _openTabs = ['dashboard'];
  activateGnbTab('dashboard');
});

renderGnbTabs();

// HTML 특수문자 이스케이프 (에러 메시지 XSS 방지)
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== TOAST =====
function showToast(msg, type = 'success') {
  const wrap = document.getElementById('toastWrap');
  const icons = {
    success: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
    error:   '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
    info:    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  if (icons[type]) toast.innerHTML = icons[type];
  const _toastSpan = document.createElement('span');
  _toastSpan.textContent = msg;
  toast.appendChild(_toastSpan);
  wrap.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2000);
}

// ===== DELETE CONFIRM MODAL =====
let deleteCallback = null;

function openDeleteModal(title, desc, callback) {
  deleteCallback = callback;
  document.getElementById('deleteModalTitle').textContent = title;
  document.getElementById('deleteModalDesc').textContent = desc;
  document.getElementById('deleteConfirmBtn').disabled = false;
  document.getElementById('deleteBtnText').textContent = '삭제';
  document.getElementById('deleteSpinner').style.display = 'none';
  document.getElementById('deleteOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

document.getElementById('deleteCancelBtn')?.addEventListener('click', () => {
  document.getElementById('deleteOverlay').classList.remove('open');
  document.body.style.overflow = '';
  deleteCallback = null;
});

document.getElementById('deleteConfirmBtn')?.addEventListener('click', async () => {
  if (!deleteCallback) return;
  document.getElementById('deleteConfirmBtn').disabled = true;
  document.getElementById('deleteBtnText').textContent = '삭제 중...';
  document.getElementById('deleteSpinner').style.display = 'inline-block';
  try {
    await deleteCallback();
    document.getElementById('deleteOverlay').classList.remove('open');
    document.body.style.overflow = '';
  } catch (err) {
    showToast('삭제 실패: ' + err.message, 'error');
    document.getElementById('deleteConfirmBtn').disabled = false;
    document.getElementById('deleteBtnText').textContent = '삭제';
    document.getElementById('deleteSpinner').style.display = 'none';
  }
  deleteCallback = null;
});

// ===== TIMESTAMP HELPER =====
function nowTS() { return firebase.firestore.FieldValue.serverTimestamp(); }
function tsToStr(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

// ===== FIRESTORE WRITE WITH TIMEOUT =====
function firestoreWrite(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('저장 시간이 초과되었습니다 (10초). Firestore 연결 또는 보안 규칙을 확인하세요.')), ms)
    )
  ]);
}

// ===== LOAD ALL DATA =====
let allCharacters = [];
let allPvpPatches = [];
let allPatchNotes = [];
let allBanners    = [];
let allSupportChars = [];

// ===== LOCAL STAGING =====
let _pendingChars   = [];
let _pendingSC      = [];
let _pendingPvp     = [];
let _pendingPatch   = [];
let _pendingBanners = [];

function _applyPendingOps(baseList, ops) {
  let result = baseList.map(x => ({ ...x, hasDraft: false, pendingDelete: false }));
  for (const op of ops) {
    if (op.action === 'add') {
      result.push({ ...op.data, _docId: op.tempId, _tempId: op.tempId, _isPendingAdd: true });
    } else if (op.action === 'edit') {
      const idx = result.findIndex(x => x._docId === op.docId);
      if (idx !== -1) result[idx] = { ...result[idx], draftData: op.data, hasDraft: true };
    } else if (op.action === 'delete') {
      const idx = result.findIndex(x => x._docId === op.docId);
      if (idx !== -1) {
        if (result[idx]._isPendingAdd) { result.splice(idx, 1); }
        else { result[idx] = { ...result[idx], pendingDelete: true, visible: false }; }
      }
    }
  }
  return result;
}

var oEditors = [];

let charPageSize   = 10;
let pvpPageSize    = 10;
let patchPageSize  = 10;
let bannerPageSize = 10;
let scPageSize     = 10;

let charCurrentPage   = 1;
let pvpCurrentPage    = 1;
let patchCurrentPage  = 1;
let bannerCurrentPage = 1;
let scCurrentPage     = 1;

// 현재 필터된 리스트 (페이지네이션 대상)
let filteredCharList        = [];
let filteredPvpList         = [];
let filteredPatchList       = [];
let filteredBannerList      = [];
let filteredSupportCharList = [];

async function loadAllData() {
  await loadAdminNicknameMap();
  await Promise.all([loadCharacters(), loadPvpPatches(), loadPatchNotes(), loadBanners(), loadSupportChars(), loadEvtPages(), loadBoards(), loadNotices()]);
  loadDashboardStats();
}

function setTableBodyHtml(tbody, html) {
  if (!tbody || tbody.innerHTML === html) return;
  tbody.innerHTML = html;
}

function showTableLoading(tbody, colSpan) {
  if (!tbody || (tbody.children.length && !tbody.querySelector('.table-loading'))) return;
  setTableBodyHtml(
    tbody,
    `<tr><td colspan="${colSpan}" class="table-loading"><div class="spinner"></div><span>로딩 중...</span></td></tr>`
  );
}

function showTableError(tbody, html) {
  if (!tbody || (tbody.children.length && !tbody.querySelector('.table-loading'))) return;
  setTableBodyHtml(tbody, html);
}

const _allTableFilterControlIds = [
  'adminGradeFilter', 'adminAttributeFilter', 'adminBattleTypeFilter', 'adminCharSearch',
  'scGradeFilter', 'scAttributeFilter', 'scBattleTypeFilter', 'scCharSearch',
  'pvpTypeFilter', 'pvpSearch', 'patchNoteSearch',
  'bannerStatusFilter', 'bannerSearch', 'evtBannerStatusFilter', 'evtBannerSearch',
  'evtPageSearch', 'noticeSearch', 'permUserSearch',
  'boardCategoryFilter', 'boardSearch',
];

function resetTableFilterControls(controlIds = _allTableFilterControlIds) {
  controlIds.forEach(id => {
    const control = document.getElementById(id);
    if (!control) return;

    if (control.tagName === 'SELECT') {
      const defaultOption = [...control.options].find(option => option.value === 'all') || control.options[0];
      if (defaultOption) control.value = defaultOption.value;
    } else if ('value' in control) {
      control.value = '';
    }
  });
}

async function refreshTableWithReset(controlIds, refreshFn, tbodyId) {
  resetTableFilterControls(controlIds);
  if (tbodyId) resetTableSelection(tbodyId);
  if (typeof refreshFn === 'function') await refreshFn();
}

const _selectedRowsByTable = new Map();

function resetTableSelection(tbodyId) {
  _selectedRowsByTable.get(tbodyId)?.clear();
  const tbody = document.getElementById(tbodyId);
  tbody?.querySelectorAll('.table-row-select').forEach(checkbox => {
    checkbox.checked = false;
  });
  syncTableSelectionHeader(tbodyId);
}

function resetAllTableSelections() {
  [..._selectedRowsByTable.keys()].forEach(resetTableSelection);
}

function applyTableSelection(tbodyId, rowKeys = []) {
  const tbody = document.getElementById(tbodyId);
  const table = tbody?.closest('table');
  const headerRow = table?.querySelector('thead tr');
  if (!tbody || !headerRow) return;

  let selectedKeys = _selectedRowsByTable.get(tbodyId);
  if (!selectedKeys) {
    selectedKeys = new Set();
    _selectedRowsByTable.set(tbodyId, selectedKeys);
  }

  let headerCell = headerRow.querySelector(':scope > th.table-select-cell');
  if (!headerCell) {
    headerCell = document.createElement('th');
    headerCell.className = 'table-select-cell';
    const selectAll = document.createElement('input');
    selectAll.type = 'checkbox';
    selectAll.className = 'table-select-all';
    selectAll.setAttribute('aria-label', '현재 페이지 전체 선택');
    selectAll.title = '현재 페이지 전체 선택';
    headerCell.appendChild(selectAll);
    headerRow.insertBefore(headerCell, headerRow.firstChild);
  }

  const rows = [...tbody.rows];
  rowKeys.forEach((value, index) => {
    const row = rows[index];
    if (!row || value == null) return;

    const key = String(value);
    row.dataset.selectionKey = key;
    let cell = row.querySelector(':scope > td.table-select-cell');
    if (!cell) {
      cell = document.createElement('td');
      cell.className = 'table-select-cell';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'table-row-select';
      checkbox.setAttribute('aria-label', '행 선택');
      cell.appendChild(checkbox);
      row.insertBefore(cell, row.firstChild);
    }
    cell.querySelector('.table-row-select').checked = selectedKeys.has(key);
  });

  rows.slice(rowKeys.length).forEach(row => {
    const spanningCell = row.querySelector(':scope > td[colspan]');
    if (!spanningCell || spanningCell.dataset.selectionColumnAdded) return;
    spanningCell.colSpan += 1;
    spanningCell.dataset.selectionColumnAdded = 'true';
  });

  syncTableSelectionHeader(tbodyId);
}

function syncTableSelectionHeader(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  const header = tbody?.closest('table')?.querySelector('.table-select-all');
  if (!tbody || !header) return;

  const rowChecks = [...tbody.querySelectorAll('.table-row-select')];
  const checkedCount = rowChecks.filter(checkbox => checkbox.checked).length;
  header.disabled = rowChecks.length === 0;
  header.checked = rowChecks.length > 0 && checkedCount === rowChecks.length;
  header.indeterminate = checkedCount > 0 && checkedCount < rowChecks.length;
}

document.addEventListener('change', event => {
  const checkbox = event.target;
  if (!checkbox.matches?.('.table-select-all, .table-row-select')) return;
  const tbody = checkbox.closest('table')?.querySelector('tbody[id]');
  if (!tbody) return;

  let selectedKeys = _selectedRowsByTable.get(tbody.id);
  if (!selectedKeys) {
    selectedKeys = new Set();
    _selectedRowsByTable.set(tbody.id, selectedKeys);
  }

  if (checkbox.matches('.table-select-all')) {
    tbody.querySelectorAll('tr[data-selection-key]').forEach(row => {
      const rowCheckbox = row.querySelector('.table-row-select');
      if (!rowCheckbox) return;
      rowCheckbox.checked = checkbox.checked;
      if (checkbox.checked) selectedKeys.add(row.dataset.selectionKey);
      else selectedKeys.delete(row.dataset.selectionKey);
    });
  } else {
    const row = checkbox.closest('tr[data-selection-key]');
    if (!row) return;
    if (checkbox.checked) selectedKeys.add(row.dataset.selectionKey);
    else selectedKeys.delete(row.dataset.selectionKey);
  }

  syncTableSelectionHeader(tbody.id);
});

// ===== 페이지네이터 렌더링 유틸 =====
function renderPaginator(containerId, totalItems, pageSize, currentPage, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  const prevSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>`;
  const nextSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>`;

  function pageBtn(page, label, isActive, isDisabled) {
    const activeClass  = isActive   ? ' active'   : '';
    const disabledAttr = isDisabled ? ' disabled'  : '';
    const content      = label !== undefined ? label : page;
    return `<button class="paginator-btn${activeClass}"${disabledAttr} data-page="${page}">${content}</button>`;
  }

  function ellipsis() {
    return `<span class="paginator-ellipsis">…</span>`;
  }

  let buttons = '';
  buttons += pageBtn(currentPage - 1, prevSvg, false, currentPage === 1);

  // 페이지 번호 버튼 (최대 7개: 처음, 마지막 + 주변 2개 + ellipsis)
  const pages = [];
  pages.push(1);
  for (let i = currentPage - 2; i <= currentPage + 2; i++) {
    if (i > 1 && i < totalPages) pages.push(i);
  }
  pages.push(totalPages);
  const uniquePages = [...new Set(pages)].sort((a, b) => a - b);

  let prev = 0;
  for (const p of uniquePages) {
    if (p - prev > 1) buttons += ellipsis();
    buttons += pageBtn(p, p, p === currentPage, false);
    prev = p;
  }

  buttons += pageBtn(currentPage + 1, nextSvg, false, currentPage === totalPages);

  container.innerHTML = buttons;

  container.querySelectorAll('.paginator-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page);
      if (page >= 1 && page <= totalPages) {
        onPageChange(page);
      }
    });
  });
}

