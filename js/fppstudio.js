// ===== FPPStudio Main JavaScript =====

// Firebase services are initialized in js/firebase.js.
const { db, auth, googleProvider, FieldValue, Persistence } = window.FPPFirebase;
const { ADMIN_EMAILS, SUPER_ADMIN_EMAIL, CLOUDINARY_CONFIG } = window.FPPAdminConfig;
const ADMIN_MODULES = window.FPPAdminModules;

// ===== App State =====
const AppState = {
  currentUser: null,
  isAdmin: false,
  isSuperAdmin: false,
  currentPage: 'home',
  sidebarCollapsed: false,
  adminPermissions: null,
  // Page states
  pageStates: {},
  // Unsaved changes tracking
  hasUnsavedChanges: false,
  lastSavedData: null,
  // Listeners
  listeners: []
};

// ===== Page Configuration =====
const PAGE_CONFIG = {
  members: { title: '멤버 관리', breadcrumb: ['홈', '운영', '멤버 관리'], hasAdd: false, hasSaveBar: false },
  permissions: { title: '권한 관리', breadcrumb: ['홈', '운영', '권한 관리'], hasAdd: false, hasSaveBar: false },
  banners: { title: '메인 배너 관리', breadcrumb: ['홈', '페이지', '메인 배너 관리'], hasAdd: true, hasSaveBar: true, collection: 'banners' },
  characters: { title: '캐릭터 관리', breadcrumb: ['홈', '페이지', '캐릭터 관리'], hasAdd: true, hasSaveBar: true, collection: 'characters' },
  supportCharacters: { title: '현질 서폿 캐릭터 관리', breadcrumb: ['홈', '페이지', '현질 서폿 캐릭터 관리'], hasAdd: true, hasSaveBar: true, collection: 'supportCharacters' },
  pvpPatch: { title: 'PvP 패치 관리', breadcrumb: ['홈', '페이지', 'PvP 패치 관리'], hasAdd: true, hasSaveBar: true, collection: 'pvpPatch' },
  patchNotes: { title: '패치노트 관리', breadcrumb: ['홈', '페이지', '패치노트 관리'], hasAdd: true, hasSaveBar: true, collection: 'patchNotes' },
  boards: { title: '게시판 관리', breadcrumb: ['홈', '페이지', '게시판 관리'], hasAdd: true, hasSaveBar: true, collection: 'boards' },
  events: { title: '이벤트 관리', breadcrumb: ['홈', '페이지', '이벤트 관리'], hasAdd: true, hasSaveBar: true, collection: 'events' },
  notices: { title: '공지사항 관리', breadcrumb: ['홈', '서비스', '공지사항 관리'], hasAdd: true, hasSaveBar: true, collection: 'notices' },
  support: { title: '고객센터 관리', breadcrumb: ['홈', '서비스', '고객센터 관리'], hasAdd: false, hasSaveBar: false },
  backup: { title: '백업 및 복원', breadcrumb: ['홈', '백업 및 복원'], hasAdd: false, hasSaveBar: false }
};

// ===== Utility Functions =====
function $(selector) { return document.querySelector(selector); }
function $$(selector) { return document.querySelectorAll(selector); }

function showToast(message, type = 'info') {
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  const icon = document.createElement('i');
  icon.className = `fas ${icons[type] || icons.info}`;
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(icon, text);
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function showModal(title, content, footer = '') {
  const overlay = $('#modalOverlay');
  const container = $('#modalContainer');
  container.innerHTML = `
    <div class="modal-header">
      <h3>${title}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body">${content}</div>
    ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
  `;
  overlay.style.display = 'flex';
}

function closeModal() {
  $('#modalOverlay').style.display = 'none';
}

function showConfirm(title, message, onConfirm) {
  const content = `
    <div class="confirm-dialog">
      <i class="fas fa-exclamation-triangle"></i>
      <h4>${title}</h4>
      <p>${message}</p>
    </div>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="closeModal()">취소</button>
    <button class="btn btn-danger" id="confirmActionBtn">확인</button>
  `;
  showModal(title, content, footer);
  $('#confirmActionBtn').addEventListener('click', () => {
    closeModal();
    onConfirm();
  });
}

function formatDate(timestamp) {
  if (!timestamp) return '-';
  if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
    return timestamp;
  }
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateTime(timestamp) {
  if (!timestamp) return '-';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('ko-KR');
}

function truncateText(text, maxLen = 5) {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

// Firestore document IDs are internal CRUD keys. Content records use their
// numeric IDs in the public site, so keep the two identifiers separate.
const ACTUAL_NUMERIC_ID_FIELDS = Object.freeze({
  banners: ['id', 'bannerId'],
  characters: ['id', 'num', 'no', 'characterId'],
  supportCharacters: ['id', 'num', 'no', 'characterId', 'supportCharacterId'],
  patchNotes: ['id', 'patchNoteId', 'patchnoteId'],
  boards: ['id', 'boardId', 'postId'],
  events: ['id', 'eventId'],
  notices: ['id', 'noticeId']
});

function normalizeActualNumericId(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    return /^\d+$/.test(normalized) ? normalized : '';
  }
  return '';
}

function getActualNumericId(data, collection, fallback = '') {
  const fields = ACTUAL_NUMERIC_ID_FIELDS[collection] || ['id'];
  for (const field of fields) {
    const id = normalizeActualNumericId(data?.[field]);
    if (id) return id;
  }
  return normalizeActualNumericId(fallback);
}

function getDisplayId(item) {
  return item?.actualId || '';
}

// ===== Authentication =====
function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(email);
}

function isSuperAdminEmail(email) {
  return email === SUPER_ADMIN_EMAIL;
}

async function checkAdminPermissions(user) {
  if (!user || !user.email) return false;

  const email = user.email.trim().toLowerCase();
  AppState.isAdmin = isAdminEmail(email);
  AppState.isSuperAdmin = isSuperAdminEmail(email);

  // Allow only the configured admins or an explicitly provisioned admin record.
  try {
    const permDoc = await db.collection('adminPermissions').doc(email).get();
    if (permDoc.exists) {
      AppState.adminPermissions = permDoc.data();
      AppState.isAdmin = AppState.isAdmin || permDoc.data().isAdmin !== false;
    }
  } catch (e) {
    console.warn('관리자 권한 문서를 확인하지 못했습니다.', e);
  }

  return AppState.isAdmin;
}

async function handleLogin() {
  console.log('🔐 handleLogin 호출됨');
  
  const emailInput = $('#loginEmail');
  const passwordInput = $('#loginPassword');
  const rememberMe = $('#rememberMe');
  
  if (!emailInput) {
    console.error('❌ 이메일 입력 필드를 찾을 수 없습니다');
    return;
  }
  
  const email = emailInput.value.trim();
  const password = passwordInput ? passwordInput.value : '';
  const errorEl = $('#loginError');
  const loadingEl = $('#loginLoading');
  
  console.log('입력된 이메일:', email);
  
  if (!email || !password) {
    errorEl.textContent = '이메일과 비밀번호를 입력하세요.';
    errorEl.classList.add('show');
    return;
  }
  
  errorEl.classList.remove('show');
  loadingEl.style.display = 'block';
  
  try {
    // 로그인 상태 유지 설정
    const persistence = rememberMe && rememberMe.checked 
      ? Persistence.LOCAL
      : Persistence.SESSION;
    await auth.setPersistence(persistence);
    
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const isAdmin = await checkAdminPermissions(cred.user);
    
    if (!isAdmin) {
      await auth.signOut();
      errorEl.textContent = '관리자 권한이 없습니다.';
      errorEl.classList.add('show');
      loadingEl.style.display = 'none';
      return;
    }
    
    showToast('로그인 성공', 'success');
  } catch (err) {
    errorEl.textContent = getAuthErrorMessage(err.code);
    errorEl.classList.add('show');
  }
  
  loadingEl.style.display = 'none';
}

// 구글 로그인 핸들러
async function handleGoogleLogin() {
  console.log('🔐 구글 로그인 시도');
  
  const rememberMe = $('#rememberMe');
  const errorEl = $('#loginError');
  const loadingEl = $('#loginLoading');
  
  errorEl.classList.remove('show');
  loadingEl.style.display = 'block';
  
  try {
    // 로그인 상태 유지 설정
    const persistence = rememberMe && rememberMe.checked 
      ? Persistence.LOCAL
      : Persistence.SESSION;
    await auth.setPersistence(persistence);
    
    const result = await auth.signInWithPopup(googleProvider);
    const isAdmin = await checkAdminPermissions(result.user);
    
    if (!isAdmin) {
      await auth.signOut();
      errorEl.textContent = '관리자 권한이 없습니다.';
      errorEl.classList.add('show');
      loadingEl.style.display = 'none';
      return;
    }
    
    showToast('구글 로그인 성공', 'success');
  } catch (err) {
    console.error('구글 로그인 오류:', err);
    errorEl.textContent = err.message || '구글 로그인에 실패했습니다.';
    errorEl.classList.add('show');
  }
  
  loadingEl.style.display = 'none';
}

function getAuthErrorMessage(code) {
  const messages = {
    'auth/user-not-found': '등록되지 않은 이메일입니다.',
    'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
    'auth/invalid-email': '올바르지 않은 이메일 형식입니다.',
    'auth/too-many-requests': '너무 많은 요청이 있었습니다. 잠시 후 다시 시도하세요.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.'
  };
  return messages[code] || '로그인에 실패했습니다.';
}

async function handleLogout() {
  cleanupListeners();
  await auth.signOut();
  AppState.currentUser = null;
  AppState.isAdmin = false;
  showToast('로그아웃 되었습니다.', 'info');
}

// ===== Auth State Observer =====
auth.onAuthStateChanged(async (user) => {
  if (user) {
    const isAdmin = await checkAdminPermissions(user);
    if (isAdmin) {
      AppState.currentUser = user;
      $('#loginScreen').style.display = 'none';
      $('#appContainer').style.display = 'flex';
      
      const displayName = user.displayName || user.email.split('@')[0];
      $('#sidebarAdminName').textContent = displayName;
      $('#mobileAdminName').textContent = displayName;
      
      navigateTo('home');
    } else {
      $('#loginScreen').style.display = 'flex';
      $('#appContainer').style.display = 'none';
      await auth.signOut();
    }
  } else {
    $('#loginScreen').style.display = 'flex';
    $('#appContainer').style.display = 'none';
  }
});

// ===== Navigation =====
function navigateTo(page) {
  if (AppState.hasUnsavedChanges) {
    if (!confirm('저장되지 않은 변경사항이 있습니다. 페이지를 이동하시겠습니까?')) {
      return;
    }
    AppState.hasUnsavedChanges = false;
  }
  
  cleanupListeners();
  AppState.currentPage = page;
  
  // Update active nav item
  $$('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
  
  // Update breadcrumb
  updateBreadcrumb(page);
  
  // Close mobile menu
  closeMobileMenu();
  
  // Render page
  renderPage(page);
}

function updateBreadcrumb(page) {
  const config = PAGE_CONFIG[page];
  const breadcrumb = $('#breadcrumb');
  
  if (!config || page === 'home') {
    breadcrumb.innerHTML = '<span class="breadcrumb-home" onclick="navigateTo(\'home\')">홈</span>';
    return;
  }
  
  const parts = config.breadcrumb;
  let html = '<span class="breadcrumb-home" onclick="navigateTo(\'home\')">홈</span>';
  
  for (let i = 1; i < parts.length; i++) {
    html += '<span class="separator">&gt;</span>';
    if (i === parts.length - 1) {
      html += `<span class="current">${parts[i]}</span>`;
    } else {
      html += `<span>${parts[i]}</span>`;
    }
  }
  
  breadcrumb.innerHTML = html;
}

function renderPage(page) {
  const content = $('#mainContent');
  
  if (page === 'home') {
    renderHomePage(content);
    return;
  }
  
  const config = PAGE_CONFIG[page];
  if (!config) {
    content.innerHTML = '<div class="state-container"><i class="fas fa-exclamation-circle"></i><h3>페이지를 찾을 수 없습니다</h3></div>';
    return;
  }

  const module = ADMIN_MODULES[page];
  if (module?.render) {
    module.render(content);
    return;
  }
  
  // Render based on page type
  switch(page) {
    case 'members': renderMembersPage(content); break;
    case 'permissions': renderPermissionsPage(content); break;
    case 'banners': renderBannersPage(content); break;
    case 'characters': renderCharactersPage(content); break;
    case 'supportCharacters': renderSupportCharactersPage(content); break;
    case 'pvpPatch': renderPvPPatchPage(content); break;
    case 'patchNotes': renderPatchNotesPage(content); break;
    case 'boards': renderBoardsPage(content); break;
    case 'events': renderEventsPage(content); break;
    case 'notices': renderNoticesPage(content); break;
    case 'support': renderSupportPage(content); break;
    case 'backup': renderBackupPage(content); break;
    default: content.innerHTML = '<div class="state-container"><i class="fas fa-exclamation-circle"></i><h3>준비 중입니다</h3></div>';
  }
}

// ===== Home Page =====
function renderHomePage(container) {
  container.innerHTML = `
    <div class="content-header">
      <h2 class="content-title">대시보드</h2>
    </div>
    <div class="home-cards">
      <div class="home-card" onclick="navigateTo('members')">
        <i class="fas fa-users"></i>
        <h4>멤버 관리</h4>
        <p>사용자 멤버 관리</p>
      </div>
      <div class="home-card" onclick="navigateTo('permissions')">
        <i class="fas fa-shield-alt"></i>
        <h4>권한 관리</h4>
        <p>관리자 권한 설정</p>
      </div>
      <div class="home-card" onclick="navigateTo('banners')">
        <i class="fas fa-image"></i>
        <h4>메인 배너 관리</h4>
        <p>배너 이미지 관리</p>
      </div>
      <div class="home-card" onclick="navigateTo('characters')">
        <i class="fas fa-user-circle"></i>
        <h4>캐릭터 관리</h4>
        <p>캐릭터 데이터 관리</p>
      </div>
      <div class="home-card" onclick="navigateTo('supportCharacters')">
        <i class="fas fa-hands-helping"></i>
        <h4>현질 서폿 캐릭터 관리</h4>
        <p>서폿 캐릭터 관리</p>
      </div>
      <div class="home-card" onclick="navigateTo('pvpPatch')">
        <i class="fas fa-fist-raised"></i>
        <h4>PvP 패치 관리</h4>
        <p>PvP 패치 데이터</p>
      </div>
      <div class="home-card" onclick="navigateTo('patchNotes')">
        <i class="fas fa-file-alt"></i>
        <h4>패치노트 관리</h4>
        <p>패치노트 작성</p>
      </div>
      <div class="home-card" onclick="navigateTo('boards')">
        <i class="fas fa-comments"></i>
        <h4>게시판 관리</h4>
        <p>게시글 관리</p>
      </div>
      <div class="home-card" onclick="navigateTo('events')">
        <i class="fas fa-calendar-alt"></i>
        <h4>이벤트 관리</h4>
        <p>이벤트 관리</p>
      </div>
      <div class="home-card" onclick="navigateTo('notices')">
        <i class="fas fa-bullhorn"></i>
        <h4>공지사항 관리</h4>
        <p>공지사항 작성</p>
      </div>
      <div class="home-card" onclick="navigateTo('support')">
        <i class="fas fa-headset"></i>
        <h4>고객센터 관리</h4>
        <p>문의 답변 관리</p>
      </div>
    </div>
  `;
}

// ===== Generic List Page Renderer =====
function createListPage(container, config) {
  const { title, collection, columns, filters, filterButtons, filterLeftHtml = '', hasAdd, hasSaveBar } = config;
  
  // Initialize page state
  if (!AppState.pageStates[collection]) {
    AppState.pageStates[collection] = {
      data: [],
      filteredData: [],
      loading: true,
      error: null,
      page: 1,
      itemsPerPage: 10,
      search: '',
      filters: {},
      selectedIds: new Set()
    };
  }
  
  const state = AppState.pageStates[collection];
  
  let html = `
    <div class="content-header">
      <h2 class="content-title">${title}</h2>
      ${hasAdd ? `<button class="btn btn-primary" onclick="handleAddItem('${collection}')"><i class="fas fa-plus"></i> Add</button>` : ''}
    </div>
    <div class="content-total" id="${collection}Total">전체 0건</div>
  `;
  
  // Filters
  if (filters && filters.length > 0) {
    html += `<div class="filter-area">
      <div class="filter-left">${filterLeftHtml}`;
    filters.forEach(f => {
      html += `<select class="filter-select" id="filter_${collection}_${f.key}" onchange="applyFilters('${collection}')">
        <option value="">${f.allLabel || f.label}</option>
        ${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>`;
    });
    html += renderFilterButtons(collection, filterButtons);
    html += `</div>
      <div class="filter-right">
        <button class="btn btn-secondary btn-sm" onclick="resetFilters('${collection}')"><i class="fas fa-undo"></i> 초기화</button>
        <input type="text" class="search-input" id="search_${collection}" placeholder="검색..." onkeyup="if(event.key==='Enter')applyFilters('${collection}')">
        <button class="btn btn-primary btn-sm" onclick="applyFilters('${collection}')"><i class="fas fa-search"></i></button>
        <select class="items-per-page" id="perPage_${collection}" onchange="changePerPage('${collection}')">
          <option value="10">10개</option>
          <option value="20">20개</option>
          <option value="50">50개</option>
          <option value="100">100개</option>
        </select>
      </div>
    </div>`;
  } else {
    html += `<div class="filter-area">
      <div class="filter-left">${filterLeftHtml}${renderFilterButtons(collection, filterButtons)}</div>
      <div class="filter-right">
        <button class="btn btn-secondary btn-sm" onclick="resetFilters('${collection}')"><i class="fas fa-undo"></i> 초기화</button>
        <input type="text" class="search-input" id="search_${collection}" placeholder="검색..." onkeyup="if(event.key==='Enter')applyFilters('${collection}')">
        <button class="btn btn-primary btn-sm" onclick="applyFilters('${collection}')"><i class="fas fa-search"></i></button>
        <select class="items-per-page" id="perPage_${collection}" onchange="changePerPage('${collection}')">
          <option value="10">10개</option>
          <option value="20">20개</option>
          <option value="50">50개</option>
          <option value="100">100개</option>
        </select>
      </div>
    </div>`;
  }
  
  // Table
  html += `<div class="table-wrapper" id="${collection}TableWrapper">
    <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>
  </div>`;
  
  // Pagination
  html += `<div class="pagination" id="${collection}Pagination"></div>`;
  
  container.innerHTML = html;
  
  // Save bar
  if (hasSaveBar) {
    renderSaveBar(collection);
  } else {
    removeSaveBar();
  }
  
  // Load data
  loadCollectionData(collection, columns);
}

function renderFilterButtons(collection, filterButtons = []) {
  if (!filterButtons.length) return '';
  const state = AppState.pageStates[collection];
  return filterButtons.map(filter => {
    const selectedValue = state?.filters?.[filter.key] || '';
    const buttons = [
      { value: '', label: '전체' },
      ...filter.options.map(option => ({ value: option, label: option }))
    ];
    return buttons.map(button => `
      <button type="button"
        class="filter-btn ${selectedValue === button.value ? 'active' : ''}"
        data-filter-collection="${collection}"
        data-filter-key="${filter.key}"
        data-filter-value="${button.value}"
        onclick="applyButtonFilter('${collection}','${filter.key}',${JSON.stringify(button.value)})">
        ${button.label}
      </button>
    `).join('');
  }).join('');
}

function updateFilterButtonStates(collection) {
  $$(`[data-filter-collection="${collection}"]`).forEach(button => {
    const state = AppState.pageStates[collection];
    const selectedValue = state?.filters?.[button.dataset.filterKey] || '';
    button.classList.toggle('active', selectedValue === button.dataset.filterValue);
  });
}

function applyButtonFilter(collection, key, value) {
  const state = AppState.pageStates[collection];
  if (!state) return;
  if (value) state.filters[key] = value;
  else delete state.filters[key];
  updateFilterButtonStates(collection);
  applyFilters(collection);
}

function renderSaveBar(collection) {
  removeSaveBar();
  const saveBar = document.createElement('div');
  saveBar.className = 'save-bar';
  saveBar.id = 'saveBar';
  saveBar.innerHTML = `
    <div class="unsaved-indicator" id="unsavedIndicator" style="display:none;">
      <i class="fas fa-exclamation-circle"></i>
      <span>저장되지 않은 변경사항이 있습니다</span>
    </div>
    <div class="save-bar-actions">
      <button class="btn btn-secondary" onclick="revertChanges('${collection}')"><i class="fas fa-undo"></i> 마지막 저장버전 되돌리기</button>
      <button class="btn btn-primary" onclick="saveChanges('${collection}')"><i class="fas fa-save"></i> 저장</button>
    </div>
  `;
  document.body.appendChild(saveBar);
  document.body.classList.add('has-save-bar');
}

function removeSaveBar() {
  const existing = $('#saveBar');
  if (existing) existing.remove();
  document.body.classList.remove('has-save-bar');
}

// ===== Data Loading =====
async function loadCollectionData(collection, columns) {
  const state = AppState.pageStates[collection];
  if (!state) return;
  
  state.loading = true;
  renderTable(collection, columns);
  
  try {
    const snapshot = await db.collection(collection).orderBy('createdAt', 'desc').get();
    state.data = await hydrateCollectionData(collection, snapshot);
    state.lastSavedData = JSON.parse(JSON.stringify(state.data));
    state.loading = false;
    applyFilters(collection);
  } catch (err) {
    // Try without orderBy
    try {
      const snapshot = await db.collection(collection).get();
      state.data = await hydrateCollectionData(collection, snapshot);
      state.lastSavedData = JSON.parse(JSON.stringify(state.data));
      state.loading = false;
      applyFilters(collection);
    } catch (err2) {
      state.loading = false;
      state.error = err2.message;
      renderTable(collection, columns);
    }
  }
}

async function hydrateCollectionData(collection, snapshot) {
  const rows = [];
  snapshot.forEach(doc => {
    const sourceData = doc.data();
    const actualId = getActualNumericId(sourceData, collection, doc.id);
    // Firestore document ID must remain the CRUD key. Some records also have
    // an `id` field, which must not overwrite the actual document ID. The
    // numeric content ID is kept separately for display.
    rows.push({
      ...sourceData,
      id: doc.id,
      actualId,
      ...(collection === 'characters' || collection === 'supportCharacters'
        ? {
            characterId: actualId
          }
        : {})
    });
  });

  if (collection === 'banners'
    || collection === 'patchNotes'
    || collection === 'notices') {
    return rows.map(item => ({
      ...item,
      visible: item.visible ?? item.published ?? true,
      updatedBy: item.updatedBy || item.adminEmail || '-',
      ...(collection === 'patchNotes' || collection === 'notices'
        ? { author: item.author || (item.updatedBy || item.adminEmail ? '관리자' : '-') }
        : {})
    }));
  }

  if (collection === 'characters' || collection === 'supportCharacters') {
    return rows.map(item => ({
      ...item,
      grade: item.grade ?? item.tier ?? item.rank ?? '',
      attribute: item.attribute ?? item.attr ?? item.element ?? '',
      type: item.type ?? item.battleType ?? item.battle_type ?? item.battle ?? '',
      visible: item.visible ?? item.published ?? true,
      updatedBy: item.updatedBy || item.adminEmail || '-'
    }));
  }

  if (collection !== 'pvpPatch') return rows;

  // PvP 패치 문서는 캐릭터 이름을 저장하지 않고 charId/supportCharId만
  // 저장하므로, 실제 캐릭터 컬렉션과 연결해 관리자 테이블용 값을 만듭니다.
  const [charactersSnapshot, supportCharactersSnapshot] = await Promise.all([
    db.collection('characters').get(),
    db.collection('supportCharacters').get()
  ]);
  const characterMap = buildCharacterMap(charactersSnapshot);
  const supportCharacterMap = buildCharacterMap(supportCharactersSnapshot);

  return rows.map(item => {
    const supportId = item.supportCharId;
    const characterId = item.charId ?? supportId ?? '';
    const isSupportCharacter = supportId !== null
      && supportId !== undefined
      && String(supportId) !== '';
    const character = (isSupportCharacter
      ? supportCharacterMap.get(String(supportId))
      : characterMap.get(String(characterId)))
      || characterMap.get(String(characterId))
      || supportCharacterMap.get(String(characterId));
    const patchTypes = Array.isArray(item.patches)
      ? [...new Set(item.patches.map(patch => normalizePvpType(patch?.type)).filter(Boolean))]
      : [];

    return {
      ...item,
      charId: characterId,
      displayCharId: isSupportCharacter ? `[서폿] ${supportId ?? characterId}` : characterId,
      name: item.name || character?.name || '-',
      type: patchTypes.length ? patchTypes : item.type || [],
      visible: item.visible ?? item.published ?? true,
      updatedBy: item.updatedBy || item.adminEmail || '-'
    };
  }).sort((a, b) => {
    const dateDifference = getSortableDateValue(b.patchDate || b.date || b.createdAt)
      - getSortableDateValue(a.patchDate || a.date || a.createdAt);
    if (dateDifference !== 0) return dateDifference;
    return getSortableDateValue(b.createdAt) - getSortableDateValue(a.createdAt);
  });
}

function getSortableDateValue(value) {
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildCharacterMap(snapshot) {
  const map = new Map();
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.id !== undefined && data.id !== null) {
      map.set(String(data.id), data);
    }
    map.set(doc.id, data);
  });
  return map;
}

function applyFilters(collection) {
  const state = AppState.pageStates[collection];
  if (!state) return;
  
  let filtered = [...state.data];
  
  // Search
  const searchEl = $(`#search_${collection}`);
  if (searchEl) {
    state.search = searchEl.value.trim().toLowerCase();
    if (state.search) {
      filtered = filtered.filter(item => {
        return Object.values(item).some(val => 
          String(val).toLowerCase().includes(state.search)
        );
      });
    }
  }
  
  // Filters
  const config = getPageFilterConfig(collection);
  if (config && config.filters) {
    config.filters.forEach(f => {
      const filterEl = $(`#filter_${collection}_${f.key}`);
      const selectedValue = filterEl ? filterEl.value : (state.filters[f.key] || '');
      if (selectedValue) {
        state.filters[f.key] = selectedValue;
        filtered = filtered.filter(item => {
          const itemValue = getFilterItemValue(item, collection, f.key);
          return filterValueMatches(itemValue, selectedValue, collection, f.key);
        });
      } else {
        delete state.filters[f.key];
      }
    });
  }
  
  state.filteredData = filtered;
  state.page = 1;
  
  const columns = getPageColumns(collection);
  renderTable(collection, columns);
  renderPagination(collection);
}

function getFilterItemValue(item, collection, key) {
  if (collection === 'characters' || collection === 'supportCharacters') {
    const aliases = {
      grade: ['grade', 'tier', 'rank'],
      attribute: ['attribute', 'attr', 'element'],
      type: ['type', 'battleType', 'battle_type', 'battle']
    };
    const value = (aliases[key] || [key])
      .map(alias => item[alias])
      .find(value => value !== undefined && value !== null && value !== '');
    return value ?? '';
  }

  if (collection === 'pvpPatch' && key === 'type') {
    return item.type ?? item.patchType ?? item.kind ?? '';
  }

  return item[key];
}

function filterValueMatches(itemValue, selectedValue, collection, key) {
  const values = Array.isArray(itemValue) ? itemValue : [itemValue];
  return values.some(value => normalizeFilterValue(value, collection, key)
    === normalizeFilterValue(selectedValue, collection, key));
}

function normalizeFilterValue(value, collection, key) {
  const text = String(value ?? '').trim().toLowerCase();
  if (collection === 'pvpPatch' && key === 'type') {
    return normalizePvpType(text).trim().toLowerCase();
  }

  if ((collection === 'characters' || collection === 'supportCharacters')
    && key === 'attribute') {
    const attributes = {
      force: '力',
      힘: '力',
      '力': '力',
      ki: '技',
      기: '技',
      '技': '技',
      sim: '心',
      심: '心',
      '心': '心'
    };
    return attributes[text] || text;
  }

  if ((collection === 'characters' || collection === 'supportCharacters')
    && key === 'type') {
    const types = {
      fighter: '격투',
      격투: '격투',
      sword: '검술',
      검사: '검술',
      검술: '검술',
      element: '원소',
      원소: '원소',
      special: '특수',
      특수: '특수'
    };
    return types[text] || text;
  }

  return text;
}

function normalizePvpType(value) {
  const labels = {
    buff: '버프',
    nerf: '너프',
    fix: '기능 수정',
    조정: '기능 수정',
    기능수정: '기능 수정',
    '기능 수정': '기능 수정',
    new: '신규',
    신규: '신규',
    upcoming: 'Up Comming',
    'up coming': 'Up Comming',
    'up comming': 'Up Comming'
  };
  const normalizedValue = String(value ?? '').trim().toLowerCase();
  return labels[normalizedValue] || labels[value] || value;
}

function resetFilters(collection) {
  const state = AppState.pageStates[collection];
  if (!state) return;
  
  state.search = '';
  state.filters = {};
  state.page = 1;
  
  const searchEl = $(`#search_${collection}`);
  if (searchEl) searchEl.value = '';
  
  const config = getPageFilterConfig(collection);
  if (config && config.filters) {
    config.filters.forEach(f => {
      const filterEl = $(`#filter_${collection}_${f.key}`);
      if (filterEl) filterEl.value = '';
    });
  }
  updateFilterButtonStates(collection);
  
  state.filteredData = [...state.data];
  const columns = getPageColumns(collection);
  renderTable(collection, columns);
  renderPagination(collection);
}

function changePerPage(collection) {
  const state = AppState.pageStates[collection];
  if (!state) return;
  const select = $(`#perPage_${collection}`);
  state.itemsPerPage = parseInt(select.value);
  state.page = 1;
  const columns = getPageColumns(collection);
  renderTable(collection, columns);
  renderPagination(collection);
}

// ===== Table Rendering =====
function renderTable(collection, columns) {
  const state = AppState.pageStates[collection];
  const wrapper = $(`#${collection}TableWrapper`);
  const totalEl = $(`#${collection}Total`);
  
  if (!wrapper) return;
  
  if (state.loading) {
    wrapper.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>';
    return;
  }
  
  if (state.error) {
    wrapper.innerHTML = `<div class="state-container"><i class="fas fa-exclamation-circle" style="color:var(--danger)"></i><h3>오류 발생</h3><p>${state.error}</p></div>`;
    return;
  }
  
  if (totalEl) totalEl.textContent = `전체 ${state.filteredData.length}건`;
  
  if (state.filteredData.length === 0) {
    wrapper.innerHTML = '<div class="state-container"><i class="fas fa-inbox"></i><h3>데이터가 없습니다</h3><p>등록된 항목이 없습니다.</p></div>';
    return;
  }
  
  const start = (state.page - 1) * state.itemsPerPage;
  const end = start + state.itemsPerPage;
  const pageData = state.filteredData.slice(start, end);
  
  let html = '<table><thead><tr>';
  const allPageItemsSelected = areAllPageItemsSelected(collection, pageData);
  html += '<th class="checkbox-cell"><input type="checkbox" id="selectAll_' + collection + '" aria-label="현재 페이지 전체 선택" ' + (allPageItemsSelected ? 'checked' : '') + ' onchange="toggleSelectAll(\'' + collection + '\')"></th>';
  columns.forEach(col => { html += `<th>${col.label}</th>`; });
  html += '<th>작업</th></tr></thead><tbody>';
  
  pageData.forEach(item => {
    const selectionKey = getSelectionKey(item.id);
    const selected = state.selectedIds.has(selectionKey);
    const checked = selected ? 'checked' : '';
    const encodedId = encodeURIComponent(String(item.id));
    html += `<tr data-id="${item.id}" data-select-row-id="${encodedId}" class="${selected ? 'is-selected' : ''}" aria-selected="${selected}">`;
    html += `<td class="checkbox-cell"><input type="checkbox" aria-label="항목 개별 선택" data-select-collection="${collection}" data-select-id="${encodedId}" ${checked}></td>`;
    columns.forEach(col => {
      const cellClass = col.type === 'image' || col.type === 'preview' ? ' class="image-cell"' : '';
      html += `<td${cellClass}>${renderCellContent(col, item, collection)}</td>`;
    });
    html += `<td class="actions">${renderActions(item, collection)}</td>`;
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  wrapper.innerHTML = html;
  bindTableSelection(wrapper, collection, pageData);
}

function bindTableSelection(wrapper, collection, pageData) {
  if (!wrapper) return;

  const state = AppState.pageStates[collection];
  const selectedPageItems = pageData.filter(item => (
    state?.selectedIds.has(getSelectionKey(item.id))
  )).length;
  const selectAllCheckbox = wrapper.querySelector(`#selectAll_${collection}`);
  if (selectAllCheckbox) {
    selectAllCheckbox.indeterminate = selectedPageItems > 0 && selectedPageItems < pageData.length;
  }

  wrapper.querySelectorAll('input[data-select-id]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      toggleSelect(
        checkbox.dataset.selectCollection,
        decodeURIComponent(checkbox.dataset.selectId)
      );
    });
  });

  // Every management table supports the same row selection interaction as the
  // PvP patch table: checkboxes remain available, and clicking a non-control
  // part of a row selects or deselects that item.
  wrapper.querySelectorAll('tbody tr[data-select-row-id]').forEach(row => {
    row.tabIndex = 0;
    const selectRow = () => {
      toggleSelect(collection, decodeURIComponent(row.dataset.selectRowId));
    };

    row.addEventListener('click', event => {
      if (event.target.closest('input, button, select, option, textarea, a, label, .actions')) {
        return;
      }
      selectRow();
    });

    row.addEventListener('keydown', event => {
      if (event.target !== row || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      selectRow();
    });
  });
}

function renderCellContent(col, item, collection) {
  // 공개 서비스의 캐릭터 컬렉션은 img 필드를 사용합니다.
  // imageUrl은 기존 관리자 데이터와의 호환을 위해 fallback으로 유지합니다.
  const value = col.key === 'id'
    ? getDisplayId(item)
    : col.key === 'img'
      ? (item.img || item.imageUrl)
      : item[col.key];
  
  switch(col.type) {
    case 'image':
      return value ? `<img src="${value}" class="${getTableImageClass(collection)}" alt="">` : '<span style="color:var(--text-secondary)">-</span>';
    case 'status':
      if (value === true || value === 'active' || value === 'published') {
        return '<span class="badge badge-success">활성</span>';
      }
      return '<span class="badge badge-gray">비활성</span>';
    case 'toggle':
      const checked = value ? 'checked' : '';
      return `<label class="toggle-switch"><input type="checkbox" ${checked} onchange="toggleField('${collection}','${item.id}','${col.key}',this.checked)"><span class="toggle-slider"></span></label>`;
    case 'date':
      if (col.key === 'patchDate' && !value) {
        return formatDate(item.date || item.createdAt);
      }
      return formatDate(value);
    case 'datetime':
      return formatDateTime(value);
    case 'truncate':
      return `<span class="text-ellipsis" style="max-width:200px;display:inline-block" title="${value || ''}">${value || '-'}</span>`;
    case 'pvpType': {
      const types = Array.isArray(value) ? value : (value ? [value] : []);
      if (!types.length) return '-';
      return types.map(type => {
        const label = normalizePvpType(type);
        const badgeClass = label === '버프'
          ? 'badge-success'
          : label === '너프'
            ? 'badge-danger'
            : label === '기능 수정'
              ? 'badge-warning'
              : label === '신규'
                ? 'badge-info'
                : 'badge-gray';
        return `<span class="badge ${badgeClass}" style="margin-right:4px">${label}</span>`;
      }).join('');
    }
    case 'preview':
      return value ? `<img src="${value}" class="${getTableImageClass(collection)}" style="cursor:pointer" onclick="previewImage('${value}')">` : '-';
    default:
      return value || '-';
  }
}

function getTableImageClass(collection) {
  if (collection === 'banners') return 'table-img table-img-banner';
  if (collection === 'characters' || collection === 'supportCharacters') {
    return 'table-img table-img-character';
  }
  return 'table-img';
}

function renderActions(item, collection) {
  let html = '';
  
  switch(collection) {
    case 'banners':
    case 'characters':
    case 'supportCharacters':
    case 'pvpPatch':
    case 'patchNotes':
    case 'events':
    case 'notices':
      html += `<button class="btn-icon" onclick="editItem('${collection}','${item.id}')" title="수정"><i class="fas fa-edit"></i></button>`;
      html += `<button class="btn-icon danger" onclick="deleteItem('${collection}','${item.id}')" title="삭제"><i class="fas fa-trash"></i></button>`;
      break;
    case 'boards':
      html += `<button class="btn-icon" onclick="editItem('${collection}','${item.id}')" title="수정"><i class="fas fa-edit"></i></button>`;
      html += `<button class="btn-icon" onclick="toggleBoardVisibility('${item.id}')" title="노출상태"><i class="fas fa-eye"></i></button>`;
      html += `<button class="btn-icon danger" onclick="deleteItem('${collection}','${item.id}')" title="삭제"><i class="fas fa-trash"></i></button>`;
      break;
    case 'members':
      html += `<button class="btn-icon" onclick="viewMemberMemo('${item.id}')" title="메모"><i class="fas fa-sticky-note"></i></button>`;
      html += `<button class="btn-icon" onclick="viewNicknameHistory('${item.id}')" title="닉네임 이력"><i class="fas fa-history"></i></button>`;
      break;
    case 'permissions':
      html += `<button class="btn-icon" onclick="editPermissions('${item.id}')" title="권한 변경"><i class="fas fa-edit"></i></button>`;
      break;
    case 'support':
      html += `<button class="btn-icon" onclick="viewSupportDetail('${item.id}')" title="상세"><i class="fas fa-eye"></i></button>`;
      html += `<button class="btn-icon" onclick="answerSupport('${item.id}')" title="답변"><i class="fas fa-reply"></i></button>`;
      break;
  }
  
  return html;
}

// ===== Pagination =====
function renderPagination(collection) {
  const state = AppState.pageStates[collection];
  const container = $(`#${collection}Pagination`);
  if (!container) return;
  
  const totalPages = Math.ceil(state.filteredData.length / state.itemsPerPage);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  
  let html = '';
  html += `<button ${state.page <= 1 ? 'disabled' : ''} onclick="goToPage('${collection}',1)"><i class="fas fa-angle-double-left"></i></button>`;
  html += `<button ${state.page <= 1 ? 'disabled' : ''} onclick="goToPage('${collection}',${state.page - 1})"><i class="fas fa-angle-left"></i></button>`;
  
  const startPage = Math.max(1, state.page - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  
  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="${i === state.page ? 'active' : ''}" onclick="goToPage('${collection}',${i})">${i}</button>`;
  }
  
  html += `<button ${state.page >= totalPages ? 'disabled' : ''} onclick="goToPage('${collection}',${state.page + 1})"><i class="fas fa-angle-right"></i></button>`;
  html += `<button ${state.page >= totalPages ? 'disabled' : ''} onclick="goToPage('${collection}',${totalPages})"><i class="fas fa-angle-double-right"></i></button>`;
  
  container.innerHTML = html;
}

function areAllPageItemsSelected(collection, pageData) {
  const state = AppState.pageStates[collection];
  return Boolean(pageData.length && state && pageData.every(item => (
    state.selectedIds.has(getSelectionKey(item.id))
  )));
}

function getSelectionKey(id) {
  return String(id);
}

function goToPage(collection, page) {
  const state = AppState.pageStates[collection];
  if (!state) return;
  state.page = page;
  const columns = getPageColumns(collection);
  renderTable(collection, columns);
  renderPagination(collection);
}

// ===== Selection =====
function toggleSelectAll(collection) {
  const state = AppState.pageStates[collection];
  if (!state) return;
  
  const checkbox = $(`#selectAll_${collection}`);
  if (!checkbox) return;
  const start = (state.page - 1) * state.itemsPerPage;
  const end = start + state.itemsPerPage;
  const pageData = state.filteredData.slice(start, end);
  
  if (checkbox.checked) {
    pageData.forEach(item => state.selectedIds.add(getSelectionKey(item.id)));
  } else {
    pageData.forEach(item => state.selectedIds.delete(getSelectionKey(item.id)));
  }
  
  const specializedRenderers = {
    members: renderMembersTable,
    permissions: renderPermissionsTable,
    support: renderSupportTable
  };
  if (specializedRenderers[collection]) {
    specializedRenderers[collection]();
  } else {
    renderTable(collection, getPageColumns(collection));
  }
}

function toggleSelect(collection, id) {
  const state = AppState.pageStates[collection];
  if (!state) return;

  const selectionKey = getSelectionKey(id);
  if (state.selectedIds.has(selectionKey)) {
    state.selectedIds.delete(selectionKey);
  } else {
    state.selectedIds.add(selectionKey);
  }

  const specializedRenderers = {
    members: renderMembersTable,
    permissions: renderPermissionsTable,
    support: renderSupportTable
  };
  if (specializedRenderers[collection]) {
    specializedRenderers[collection]();
  } else {
    renderTable(collection, getPageColumns(collection));
  }
}

// ===== CRUD Operations =====
async function handleAddItem(collection) {
  currentImageFile = null;
  currentImagePreviewUrl = null;
  currentImageUrl = null;
  currentImageUploadPromise = null;
  currentImageUploadError = null;
  const config = getAddFormConfig(collection);
  if (!config) return;
  
  showModal(config.title, config.formHtml, `
    <button class="btn btn-secondary" onclick="closeModal()">취소</button>
    <button class="btn btn-primary" onclick="submitAddItem('${collection}')">추가</button>
  `);
  
  if (collection === 'banners') {
    initializeBannerClickActionFields('add');
  }
  if (collection === 'characters') {
    initializeCharacterDetailFields('add');
  }

  // Setup image upload if needed
  if (config.hasImage) {
    setupImageUpload(collection);
  }
}

async function submitAddItem(collection) {
  const config = getAddFormConfig(collection);
  if (!config) return;
  
  const formData = config.getData();
  if (!formData) return;
  const { imageFile, adminTipItems, ...data } = formData;
  
  try {
    await currentImageUploadPromise;
    if (currentImageUploadError) throw currentImageUploadError;
    if (collection === 'characters') {
      data.id = await getNextCharacterId(collection);
    }
    data.createdAt = FieldValue.serverTimestamp();
    data.adminEmail = AppState.currentUser.email;
    data.updatedBy = data.updatedBy || AppState.currentUser.email;
    if (currentImageUrl) data[getImageField(collection)] = currentImageUrl;
    
    const docRef = await db.collection(collection).add(data);
    if (collection === 'characters') {
      try {
        await persistAdminCharacterTips(data.id, adminTipItems || []);
      } catch (tipError) {
        console.warn('관리자 꿀팁을 저장하지 못했습니다.', tipError);
        showToast('캐릭터는 저장되었지만 관리자 꿀팁 저장에 실패했습니다.', 'warning');
      }
    }
    
    closeModal();
    showToast('추가되었습니다.', 'success');
    
    // Reload data
    const columns = getPageColumns(collection);
    await loadCollectionData(collection, columns);
  } catch (err) {
    showToast('추가 실패: ' + err.message, 'error');
  } finally {
    currentImageFile = null;
    currentImageUploadPromise = null;
    currentImageUploadError = null;
  }
}

async function editItem(collection, id) {
  const state = AppState.pageStates[collection];
  if (!state) return;
  
  const item = state.data.find(d => d.id === id);
  if (!item) return;
  
  if (collection === 'characters') {
    try {
      item.adminTips = await loadAdminCharacterTips(item.characterId ?? item.id);
    } catch (error) {
      console.warn('관리자 꿀팁을 불러오지 못했습니다.', error);
      item.adminTips = [];
    }
  }

  currentImageFile = null;
  currentImagePreviewUrl = null;
  currentImageUrl = null;
  currentImageUploadPromise = null;
  currentImageUploadError = null;
  const config = getEditFormConfig(collection, item);
  if (!config) return;
  
  showModal(config.title, config.formHtml, `
    <button class="btn btn-secondary" onclick="closeModal()">취소</button>
    <button class="btn btn-primary" onclick="submitEditItem('${collection}','${id}')">수정</button>
  `);
  
  if (collection === 'banners') {
    initializeBannerClickActionFields('edit', item);
  }
  if (collection === 'characters') {
    initializeCharacterDetailFields('edit', item);
  }

  if (config.hasImage) {
    setupImageUpload(collection, getStoredImageUrl(collection, item));
  }
}

async function submitEditItem(collection, id) {
  const state = AppState.pageStates[collection];
  if (!state) return;
  
  const item = state.data.find(d => d.id === id);
  if (!item) return;
  
  const config = getEditFormConfig(collection, item);
  if (!config) return;
  
  const formData = config.getData();
  if (!formData) return;
  const { imageFile, adminTipItems, ...data } = formData;
  
  try {
    await currentImageUploadPromise;
    if (currentImageUploadError) throw currentImageUploadError;
    const storedImageUrl = getStoredImageUrl(collection, item);
    if (currentImageUrl && currentImageUrl !== storedImageUrl) {
      data[getImageField(collection)] = currentImageUrl;
    }
    
    data.updatedAt = FieldValue.serverTimestamp();
    data.updatedBy = AppState.currentUser.email;
    await db.collection(collection).doc(id).update(data);
    if (collection === 'characters') {
      try {
        await persistAdminCharacterTips(item.characterId ?? item.id, adminTipItems || []);
      } catch (tipError) {
        console.warn('관리자 꿀팁을 저장하지 못했습니다.', tipError);
        showToast('캐릭터는 수정되었지만 관리자 꿀팁 저장에 실패했습니다.', 'warning');
      }
    }
    
    closeModal();
    showToast('수정되었습니다.', 'success');
    
    // Reload data
    const columns = getPageColumns(collection);
    await loadCollectionData(collection, columns);
  } catch (err) {
    showToast('수정 실패: ' + err.message, 'error');
  } finally {
    currentImageFile = null;
    currentImageUploadPromise = null;
    currentImageUploadError = null;
  }
}

async function deleteItem(collection, id) {
  showConfirm('삭제 확인', '정말로 이 항목을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.', async () => {
    try {
      await db.collection(collection).doc(id).delete();
      showToast('삭제되었습니다.', 'success');
      
      const columns = getPageColumns(collection);
      await loadCollectionData(collection, columns);
    } catch (err) {
      showToast('삭제 실패: ' + err.message, 'error');
    }
  });
}

async function toggleField(collection, id, field, value) {
  try {
    await db.collection(collection).doc(id).update({ [field]: value });
    showToast('상태가 변경되었습니다.', 'success');
    
    const state = AppState.pageStates[collection];
    if (state) {
      const item = state.data.find(d => d.id === id);
      if (item) item[field] = value;
      state.filteredData = state.filteredData.map(d => d.id === id ? {...d, [field]: value} : d);
    }
  } catch (err) {
    showToast('변경 실패: ' + err.message, 'error');
  }
}

async function toggleBoardVisibility(id) {
  try {
    const doc = await db.collection('boards').doc(id).get();
    if (doc.exists) {
      const current = doc.data().published !== false;
      await db.collection('boards').doc(id).update({ published: !current });
      showToast('노출 상태가 변경되었습니다.', 'success');
      const columns = getPageColumns('boards');
      await loadCollectionData('boards', columns);
    }
  } catch (err) {
    showToast('변경 실패: ' + err.message, 'error');
  }
}

// ===== Image Upload =====
let currentImageFile = null;
let currentImagePreviewUrl = null;
let currentImageUrl = null;
let currentImageUploadPromise = null;
let currentImageUploadError = null;
const IMAGE_EDITOR_COLLECTIONS = new Set(['banners', 'characters', 'supportCharacters']);
const SQUARE_IMAGE_EDITOR_COLLECTIONS = new Set(['characters', 'supportCharacters']);
const BANNER_IMAGE_EDITOR_OPTIONS = Object.freeze({
  aspectRatio: 1472 / 420,
  outputWidth: 1472,
  outputHeight: 420
});
const IMAGE_FIELD_BY_COLLECTION = Object.freeze({
  characters: 'img',
  supportCharacters: 'img'
});

function getImageField(collection) {
  return IMAGE_FIELD_BY_COLLECTION[collection] || 'imageUrl';
}

function getAllowedImageTypes(collection) {
  if (collection === 'banners') {
    return ['image/jpeg', 'image/png', 'image/gif'];
  }
  return CLOUDINARY_CONFIG.allowedTypes;
}

function getMaxImageSize(collection) {
  return collection === 'banners'
    ? 3 * 1024 * 1024
    : CLOUDINARY_CONFIG.maxSizeBytes;
}

function getStoredImageUrl(collection, item) {
  if (!item) return null;
  return item[getImageField(collection)] || item.imageUrl || item.img || null;
}

function getImageEditorOptions(collection) {
  if (collection === 'banners') return BANNER_IMAGE_EDITOR_OPTIONS;
  if (!SQUARE_IMAGE_EDITOR_COLLECTIONS.has(collection)) return {};
  return {
    aspectRatio: 1,
    outputWidth: 500,
    outputHeight: 500
  };
}

function setupImageUpload(collection, existingUrl = null) {
  const uploadArea = $(`#imageUpload_${collection}`);
  if (!uploadArea) return;

  currentImagePreviewUrl = existingUrl || currentImagePreviewUrl || null;
  currentImageUrl = existingUrl || currentImageUrl || null;
  if (currentImagePreviewUrl) renderImageUploadPreview(collection, currentImagePreviewUrl);

  uploadArea.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        if (!getAllowedImageTypes(collection).includes(file.type)) {
          showToast(
            collection === 'banners'
              ? '배너 이미지는 JPG, PNG, GIF만 등록할 수 있습니다.'
              : '지원하지 않는 파일 형식입니다. (허용: JPG, PNG, WEBP, GIF)',
            'warning'
          );
          return;
        }
        const maxSize = getMaxImageSize(collection);
        if (file.size > maxSize) {
          showToast(`이미지는 ${maxSize / (1024 * 1024)}MB 이하로 선택해 주세요.`, 'warning');
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          currentImageFile = file;
          currentImagePreviewUrl = ev.target.result;
          renderImageUploadPreview(collection, currentImagePreviewUrl);
          if (IMAGE_EDITOR_COLLECTIONS.has(collection)) {
            openImageEditorForUpload(collection);
          } else {
            beginImageUpload(collection, file);
          }
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  });
}

function renderImageUploadPreview(collection, imageUrl) {
  const uploadArea = $(`#imageUpload_${collection}`);
  if (!uploadArea) return;
  uploadArea.classList.add('has-image');
  uploadArea.innerHTML = `
    <img src="${imageUrl}" class="image-preview" alt="선택한 이미지">
    <div class="image-upload-caption">클릭하여 이미지 변경</div>
    ${IMAGE_EDITOR_COLLECTIONS.has(collection) ? `
      <button type="button" class="image-upload-edit" onclick="event.stopPropagation(); openImageEditorForUpload('${collection}')">
        <i class="fas fa-sliders-h"></i> 이미지 편집
      </button>
    ` : ''}
  `;
}

function openImageEditorForUpload(collection) {
  if (!IMAGE_EDITOR_COLLECTIONS.has(collection) || !window.FPPImageEditor) return;
  const uploadArea = $(`#imageUpload_${collection}`);
  const image = uploadArea?.querySelector('img');
  const source = currentImageFile || image?.src;
  if (!source) {
    showToast('먼저 이미지를 선택해 주세요.', 'info');
    return;
  }

  window.FPPImageEditor.open(source, file => {
    currentImageFile = file;
    const reader = new FileReader();
    reader.onload = event => {
      currentImagePreviewUrl = event.target.result;
      renderImageUploadPreview(collection, currentImagePreviewUrl);
    };
    reader.readAsDataURL(file);
    beginImageUpload(collection, file);
  }, getImageEditorOptions(collection));
}

function beginImageUpload(collection, file) {
  currentImageUploadError = null;
  currentImageUploadPromise = uploadImage(file, collection)
    .then(url => {
      currentImageUrl = url;
      currentImageFile = null;
      currentImagePreviewUrl = url;
      renderImageUploadPreview(collection, url);
      showToast('이미지가 업로드되었습니다.', 'success');
      return url;
    })
    .catch(error => {
      currentImageUploadError = error;
      showToast('이미지 업로드 실패: ' + error.message, 'error');
      return null;
    });
}

async function uploadImage(file, collection) {
  if (!getAllowedImageTypes(collection).includes(file.type)) {
    throw new Error('지원하지 않는 파일 형식입니다. (배너: JPG, PNG, GIF)');
  }

  const maxSize = getMaxImageSize(collection);
  if (file.size > maxSize) {
    throw new Error(`파일 크기가 너무 큽니다. (최대 ${maxSize / (1024 * 1024)}MB)`);
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
  formData.append('folder', `${CLOUDINARY_CONFIG.baseFolder}/${collection}`);

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`;
  let response;
  try {
    response = await fetch(endpoint, { method: 'POST', body: formData });
  } catch (networkError) {
    throw new Error('네트워크 오류로 업로드에 실패했습니다. 인터넷 연결을 확인해주세요.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || '알 수 없는 오류';
    throw new Error(`업로드 실패 (${response.status}): ${message}`);
  }

  const result = await response.json();
  if (!result.secure_url) {
    throw new Error('업로드는 완료됐지만 URL을 받지 못했습니다. 다시 시도해주세요.');
  }
  return result.secure_url;
}

function previewImage(url) {
  showModal('미리보기', `<img src="${url}" style="max-width:100%;max-height:70vh;border-radius:8px;">`, '');
}

// ===== Save / Revert =====
async function saveChanges(collection) {
  const state = AppState.pageStates[collection];
  if (!state) return;
  
  showToast('저장 중...', 'info');
  
  try {
    // Data is already saved via individual operations
    state.lastSavedData = JSON.parse(JSON.stringify(state.data));
    AppState.hasUnsavedChanges = false;
    const indicator = $('#unsavedIndicator');
    if (indicator) indicator.style.display = 'none';
    showToast('저장되었습니다.', 'success');
  } catch (err) {
    showToast('저장 실패: ' + err.message, 'error');
  }
}

async function revertChanges(collection) {
  const state = AppState.pageStates[collection];
  if (!state || !state.lastSavedData) return;
  
  showConfirm('되돌리기 확인', '마지막 저장 버전으로 되돌리시겠습니까?', async () => {
    try {
      // Restore from last saved data
      const lastSaved = state.lastSavedData;
      const currentIds = new Set(state.data.map(d => d.id));
      const savedIds = new Set(lastSaved.map(d => d.id));
      
      // Delete items that were added
      for (const item of state.data) {
        if (!savedIds.has(item.id)) {
          await db.collection(collection).doc(item.id).delete();
        }
      }
      
      // Restore modified items
      for (const savedItem of lastSaved) {
        const currentItem = state.data.find(d => d.id === savedItem.id);
        if (currentItem) {
          const { id, actualId, ...data } = savedItem;
          await db.collection(collection).doc(id).set(data, { merge: true });
        }
      }
      
      state.data = JSON.parse(JSON.stringify(lastSaved));
      state.filteredData = [...state.data];
      
      const columns = getPageColumns(collection);
      renderTable(collection, columns);
      renderPagination(collection);
      
      AppState.hasUnsavedChanges = false;
      const indicator = $('#unsavedIndicator');
      if (indicator) indicator.style.display = 'none';
      
      showToast('되돌리기 완료', 'success');
    } catch (err) {
      showToast('되돌리기 실패: ' + err.message, 'error');
    }
  });
}

// ===== Page-Specific Renderers =====

// Members Page
async function renderMembersPage(container) {
  container.innerHTML = `
    <div class="content-header">
      <h2 class="content-title">멤버 관리</h2>
    </div>
    <div class="content-total" id="membersTotal">전체 0건</div>
    <div class="filter-area">
      <div class="filter-left"></div>
      <div class="filter-right">
        <button class="btn btn-secondary btn-sm" onclick="resetMembersFilter()"><i class="fas fa-undo"></i> 초기화</button>
        <input type="text" class="search-input" id="search_members" placeholder="이메일/닉네임 검색..." onkeyup="if(event.key==='Enter')searchMembers()">
        <button class="btn btn-primary btn-sm" onclick="searchMembers()"><i class="fas fa-search"></i></button>
        <select class="items-per-page" id="perPage_members" onchange="membersPerPage()">
          <option value="10">10개</option><option value="20">20개</option><option value="50">50개</option><option value="100">100개</option>
        </select>
      </div>
    </div>
    <div class="table-wrapper" id="membersTableWrapper">
      <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>
    </div>
    <div class="pagination" id="membersPagination"></div>
  `;
  removeSaveBar();
  loadMembers();
}

async function loadMembers() {
  if (!AppState.pageStates.members) {
    AppState.pageStates.members = { data: [], filteredData: [], page: 1, itemsPerPage: 10, search: '', selectedIds: new Set() };
  }
  const state = AppState.pageStates.members;
  
  try {
    const snapshot = await db.collection('users').get();
    state.data = [];
    snapshot.forEach(doc => state.data.push({ ...doc.data(), id: doc.id }));
    state.filteredData = [...state.data];
    renderMembersTable();
  } catch (err) {
    $('#membersTableWrapper').innerHTML = `<div class="state-container"><i class="fas fa-exclamation-circle" style="color:var(--danger)"></i><h3>오류</h3><p>${err.message}</p></div>`;
  }
}

function renderMembersTable() {
  const state = AppState.pageStates.members;
  const wrapper = $('#membersTableWrapper');
  const totalEl = $('#membersTotal');
  
  if (totalEl) totalEl.textContent = `전체 ${state.filteredData.length}건`;
  
  if (state.filteredData.length === 0) {
    wrapper.innerHTML = '<div class="state-container"><i class="fas fa-inbox"></i><h3>멤버가 없습니다</h3></div>';
    return;
  }
  
  const start = (state.page - 1) * state.itemsPerPage;
  const end = start + state.itemsPerPage;
  const pageData = state.filteredData.slice(start, end);
  
  let html = '<table><thead><tr>';
  const allPageItemsSelected = areAllPageItemsSelected('members', pageData);
  html += '<th class="checkbox-cell"><input type="checkbox" id="selectAll_members" aria-label="현재 페이지 전체 선택" ' + (allPageItemsSelected ? 'checked' : '') + ' onchange="toggleSelectAll(\'members\')"></th>';
  html += '<th>멤버</th><th>UID</th><th>닉네임 변경 이력</th><th>메모</th><th>작업</th>';
  html += '</tr></thead><tbody>';
  
  pageData.forEach(item => {
    const selected = state.selectedIds.has(getSelectionKey(item.id));
    const checked = selected ? 'checked' : '';
    const nickname = item.nickname || item.displayName || '-';
    const email = item.email || '-';
    html += `<tr data-select-row-id="${encodeURIComponent(String(item.id))}" class="${selected ? 'is-selected' : ''}" aria-selected="${selected}">
       <td class="checkbox-cell"><input type="checkbox" aria-label="항목 개별 선택" data-select-collection="members" data-select-id="${encodeURIComponent(String(item.id))}" ${checked}></td>
      <td><div style="font-weight:500">${nickname}</div><div style="font-size:11px;color:var(--text-secondary)">${email}</div></td>
      <td style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis">${item.id}</td>
      <td>${item.nicknameHistory ? item.nicknameHistory.length + '회' : '0회'}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis">${item.memo || '-'}</td>
      <td class="actions">${renderActions(item, 'members')}</td>
    </tr>`;
  });
  
  html += '</tbody></table>';
  wrapper.innerHTML = html;
  bindTableSelection(wrapper, 'members', pageData);
  renderMembersPagination();
}

function renderMembersPagination() {
  const state = AppState.pageStates.members;
  const container = $('#membersPagination');
  if (!container) return;
  const totalPages = Math.ceil(state.filteredData.length / state.itemsPerPage);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  
  let html = `<button ${state.page<=1?'disabled':''} onclick="membersGoPage(1)"><i class="fas fa-angle-double-left"></i></button>`;
  html += `<button ${state.page<=1?'disabled':''} onclick="membersGoPage(${state.page-1})"><i class="fas fa-angle-left"></i></button>`;
  const s = Math.max(1, state.page - 2), e = Math.min(totalPages, s + 4);
  for (let i = s; i <= e; i++) html += `<button class="${i===state.page?'active':''}" onclick="membersGoPage(${i})">${i}</button>`;
  html += `<button ${state.page>=totalPages?'disabled':''} onclick="membersGoPage(${state.page+1})"><i class="fas fa-angle-right"></i></button>`;
  html += `<button ${state.page>=totalPages?'disabled':''} onclick="membersGoPage(${totalPages})"><i class="fas fa-angle-double-right"></i></button>`;
  container.innerHTML = html;
}

function membersGoPage(p) { AppState.pageStates.members.page = p; renderMembersTable(); }
function searchMembers() {
  const state = AppState.pageStates.members;
  state.search = $('#search_members').value.trim().toLowerCase();
  if (state.search) {
    state.filteredData = state.data.filter(d => 
      (d.nickname || '').toLowerCase().includes(state.search) ||
      (d.email || '').toLowerCase().includes(state.search) ||
      d.id.toLowerCase().includes(state.search)
    );
  } else {
    state.filteredData = [...state.data];
  }
  state.page = 1;
  renderMembersTable();
}
function resetMembersFilter() {
  const state = AppState.pageStates.members;
  state.search = '';
  state.page = 1;
  $('#search_members').value = '';
  state.filteredData = [...state.data];
  renderMembersTable();
}
function membersPerPage() {
  AppState.pageStates.members.itemsPerPage = parseInt($('#perPage_members').value);
  AppState.pageStates.members.page = 1;
  renderMembersTable();
}

function viewMemberMemo(uid) {
  const state = AppState.pageStates.members;
  const member = state.data.find(d => d.id === uid);
  if (!member) return;
  
  showModal('메모 수정', `
    <div class="form-group">
      <label>멤버: ${member.nickname || member.email || uid}</label>
      <textarea class="form-control" id="memoInput" rows="4" placeholder="메모를 입력하세요">${member.memo || ''}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">취소</button>
    <button class="btn btn-primary" onclick="saveMemberMemo('${uid}')">저장</button>
  `);
}

async function saveMemberMemo(uid) {
  const memo = $('#memoInput').value;
  try {
    await db.collection('users').doc(uid).update({ memo });
    const state = AppState.pageStates.members;
    const member = state.data.find(d => d.id === uid);
    if (member) member.memo = memo;
    closeModal();
    showToast('메모가 저장되었습니다.', 'success');
    renderMembersTable();
  } catch (err) {
    showToast('저장 실패: ' + err.message, 'error');
  }
}

function viewNicknameHistory(uid) {
  const state = AppState.pageStates.members;
  const member = state.data.find(d => d.id === uid);
  if (!member || !member.nicknameHistory || member.nicknameHistory.length === 0) {
    showModal('닉네임 변경 이력', '<p style="text-align:center;color:var(--text-secondary)">변경 이력이 없습니다.</p>', '');
    return;
  }
  
  let html = '<div class="nickname-history">';
  member.nicknameHistory.forEach(h => {
    html += `<div class="nickname-history-item"><span>${h.nickname || h}</span><span style="color:var(--text-secondary)">${h.changedAt ? formatDateTime(h.changedAt) : ''}</span></div>`;
  });
  html += '</div>';
  
  showModal('닉네임 변경 이력', html, '');
}

// Permissions Page
async function renderPermissionsPage(container) {
  container.innerHTML = `
    <div class="content-header">
      <h2 class="content-title">권한 관리</h2>
    </div>
    <div class="content-total" id="permissionsTotal">전체 0건</div>
    <div class="filter-area">
      <div class="filter-left"></div>
      <div class="filter-right">
        <button class="btn btn-secondary btn-sm" onclick="resetPermissionsFilter()"><i class="fas fa-undo"></i> 초기화</button>
        <input type="text" class="search-input" id="search_permissions" placeholder="이메일 검색..." onkeyup="if(event.key==='Enter')searchPermissions()">
        <button class="btn btn-primary btn-sm" onclick="searchPermissions()"><i class="fas fa-search"></i></button>
        <select class="items-per-page" id="perPage_permissions" onchange="permissionsPerPage()">
          <option value="10">10개</option><option value="20">20개</option><option value="50">50개</option><option value="100">100개</option>
        </select>
      </div>
    </div>
    <div class="table-wrapper" id="permissionsTableWrapper">
      <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>
    </div>
    <div class="pagination" id="permissionsPagination"></div>
  `;
  removeSaveBar();
  loadPermissions();
}

async function loadPermissions() {
  if (!AppState.pageStates.permissions) {
    AppState.pageStates.permissions = { data: [], filteredData: [], page: 1, itemsPerPage: 10, search: '', selectedIds: new Set() };
  }
  const state = AppState.pageStates.permissions;
  
  // Load admin users
  const adminData = ADMIN_EMAILS.map(email => ({
    id: email,
    email: email,
    isSuperAdmin: email === SUPER_ADMIN_EMAIL,
    canManageContent: true,
    sectionPerms: {}
  }));
  
  try {
    const snapshot = await db.collection('adminPermissions').get();
    snapshot.forEach(doc => {
      const existing = adminData.find(a => a.id === doc.id);
      if (existing) {
        Object.assign(existing, doc.data());
      } else {
        adminData.push({ ...doc.data(), id: doc.id, email: doc.id });
      }
    });
    state.data = adminData;
    state.filteredData = [...state.data];
    renderPermissionsTable();
  } catch (err) {
    state.data = adminData;
    state.filteredData = [...state.data];
    renderPermissionsTable();
  }
}

function renderPermissionsTable() {
  const state = AppState.pageStates.permissions;
  const wrapper = $('#permissionsTableWrapper');
  const totalEl = $('#permissionsTotal');
  
  if (totalEl) totalEl.textContent = `전체 ${state.filteredData.length}건`;
  
  if (state.filteredData.length === 0) {
    wrapper.innerHTML = '<div class="state-container"><i class="fas fa-inbox"></i><h3>관리자가 없습니다</h3></div>';
    return;
  }
  
  const start = (state.page - 1) * state.itemsPerPage;
  const end = start + state.itemsPerPage;
  const pageData = state.filteredData.slice(start, end);
  
  let html = '<table><thead><tr>';
  const allPageItemsSelected = areAllPageItemsSelected('permissions', pageData);
  html += '<th class="checkbox-cell"><input type="checkbox" id="selectAll_permissions" aria-label="현재 페이지 전체 선택" ' + (allPageItemsSelected ? 'checked' : '') + ' onchange="toggleSelectAll(\'permissions\')"></th>';
  html += '<th>멤버</th><th>이메일</th><th>멤버 관리 권한</th><th>스튜디오 권한</th><th>작업</th>';
  html += '</tr></thead><tbody>';
  
  pageData.forEach(item => {
    const selected = state.selectedIds.has(getSelectionKey(item.id));
    const checked = selected ? 'checked' : '';
    const isSuper = item.isSuperAdmin || item.email === SUPER_ADMIN_EMAIL;
    html += `<tr data-select-row-id="${encodeURIComponent(String(item.id))}" class="${selected ? 'is-selected' : ''}" aria-selected="${selected}">
      <td class="checkbox-cell"><input type="checkbox" aria-label="항목 개별 선택" data-select-collection="permissions" data-select-id="${encodeURIComponent(String(item.id))}" ${checked}></td>
      <td>${isSuper ? '<span class="badge badge-warning">총괄관리자</span>' : '<span class="badge badge-info">관리자</span>'}</td>
      <td style="font-size:12px">${item.email}</td>
      <td>${isSuper ? '<span class="badge badge-success">전체</span>' : `<select class="perm-select" onchange="updateMemberPerm('${item.id}',this.value)"><option value="true" ${item.canManageContent !== false ? 'selected' : ''}>허용</option><option value="false" ${item.canManageContent === false ? 'selected' : ''}>거부</option></select>`}</td>
      <td>${isSuper ? '<span class="badge badge-success">전체</span>' : '<span class="badge badge-info">제한</span>'}</td>
      <td class="actions">${renderActions(item, 'permissions')}</td>
    </tr>`;
  });
  
  html += '</tbody></table>';
  wrapper.innerHTML = html;
  bindTableSelection(wrapper, 'permissions', pageData);
  renderPermissionsPagination();
}

function renderPermissionsPagination() {
  const state = AppState.pageStates.permissions;
  const container = $('#permissionsPagination');
  if (!container) return;
  const totalPages = Math.ceil(state.filteredData.length / state.itemsPerPage);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  let html = `<button ${state.page<=1?'disabled':''} onclick="permsGoPage(${state.page-1})"><i class="fas fa-angle-left"></i></button>`;
  const s = Math.max(1, state.page - 2), e = Math.min(totalPages, s + 4);
  for (let i = s; i <= e; i++) html += `<button class="${i===state.page?'active':''}" onclick="permsGoPage(${i})">${i}</button>`;
  html += `<button ${state.page>=totalPages?'disabled':''} onclick="permsGoPage(${state.page+1})"><i class="fas fa-angle-right"></i></button>`;
  container.innerHTML = html;
}

function permsGoPage(p) { AppState.pageStates.permissions.page = p; renderPermissionsTable(); }
function searchPermissions() {
  const state = AppState.pageStates.permissions;
  state.search = $('#search_permissions').value.trim().toLowerCase();
  state.filteredData = state.search ? state.data.filter(d => d.email.toLowerCase().includes(state.search)) : [...state.data];
  state.page = 1;
  renderPermissionsTable();
}
function resetPermissionsFilter() { AppState.pageStates.permissions.search = ''; AppState.pageStates.permissions.page = 1; $('#search_permissions').value = ''; AppState.pageStates.permissions.filteredData = [...AppState.pageStates.permissions.data]; renderPermissionsTable(); }
function permissionsPerPage() { AppState.pageStates.permissions.itemsPerPage = parseInt($('#perPage_permissions').value); AppState.pageStates.permissions.page = 1; renderPermissionsTable(); }

async function updateMemberPerm(email, value) {
  try {
    await db.collection('adminPermissions').doc(email).set({ canManageContent: value === 'true' }, { merge: true });
    showToast('권한이 업데이트되었습니다.', 'success');
  } catch (err) {
    showToast('업데이트 실패: ' + err.message, 'error');
  }
}

function editPermissions(id) {
  const state = AppState.pageStates.permissions;
  const item = state.data.find(d => d.id === id);
  if (!item) return;
  
  const isSuper = item.isSuperAdmin || item.email === SUPER_ADMIN_EMAIL;
  if (isSuper) {
    showToast('총괄 관리자의 권한은 변경할 수 없습니다.', 'warning');
    return;
  }
  
  showModal('권한 변경', `
    <div class="form-group">
      <label>이메일: ${item.email}</label>
    </div>
    <div class="form-group">
      <label>멤버 관리 권한</label>
      <select class="form-control" id="permCanManage">
        <option value="true" ${item.canManageContent !== false ? 'selected' : ''}>허용</option>
        <option value="false" ${item.canManageContent === false ? 'selected' : ''}>거부</option>
      </select>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">취소</button>
    <button class="btn btn-primary" onclick="savePermissionEdit('${id}')">저장</button>
  `);
}

async function savePermissionEdit(id) {
  const canManage = $('#permCanManage').value === 'true';
  try {
    await db.collection('adminPermissions').doc(id).set({ canManageContent: canManage, email: id }, { merge: true });
    closeModal();
    showToast('권한이 저장되었습니다.', 'success');
    loadPermissions();
  } catch (err) {
    showToast('저장 실패: ' + err.message, 'error');
  }
}

// Support Page
async function renderSupportPage(container) {
  container.innerHTML = `
    <div class="content-header">
      <h2 class="content-title">고객센터 관리</h2>
    </div>
    <div class="content-total" id="supportTotal">전체 0건</div>
    <div class="filter-area">
      <div class="filter-left"></div>
      <div class="filter-right">
        <button class="btn btn-secondary btn-sm" onclick="resetSupportFilter()"><i class="fas fa-undo"></i> 초기화</button>
        <input type="text" class="search-input" id="search_support" placeholder="검색..." onkeyup="if(event.key==='Enter')searchSupport()">
        <button class="btn btn-primary btn-sm" onclick="searchSupport()"><i class="fas fa-search"></i></button>
        <select class="items-per-page" id="perPage_support" onchange="supportPerPage()">
          <option value="10">10개</option><option value="20">20개</option><option value="50">50개</option><option value="100">100개</option>
        </select>
      </div>
    </div>
    <div class="table-wrapper" id="supportTableWrapper">
      <div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>
    </div>
    <div class="pagination" id="supportPagination"></div>
  `;
  removeSaveBar();
  loadSupport();
}

async function loadSupport() {
  if (!AppState.pageStates.support) {
    AppState.pageStates.support = { data: [], filteredData: [], page: 1, itemsPerPage: 10, search: '', selectedIds: new Set() };
  }
  const state = AppState.pageStates.support;
  
  try {
    // Support tickets might be in a 'supportTickets' or similar collection
    const snapshot = await db.collection('supportTickets').get();
    state.data = [];
    snapshot.forEach(doc => state.data.push({ ...doc.data(), id: doc.id }));
    state.filteredData = [...state.data];
    renderSupportTable();
  } catch (err) {
    // If collection doesn't exist, show empty
    state.data = [];
    state.filteredData = [];
    renderSupportTable();
  }
}

function renderSupportTable() {
  const state = AppState.pageStates.support;
  const wrapper = $('#supportTableWrapper');
  const totalEl = $('#supportTotal');
  
  if (totalEl) totalEl.textContent = `전체 ${state.filteredData.length}건`;
  
  if (state.filteredData.length === 0) {
    wrapper.innerHTML = '<div class="state-container"><i class="fas fa-inbox"></i><h3>문의가 없습니다</h3><p>고객 문의가 여기에 표시됩니다.</p></div>';
    return;
  }
  
  const start = (state.page - 1) * state.itemsPerPage;
  const end = start + state.itemsPerPage;
  const pageData = state.filteredData.slice(start, end);
  
  let html = '<table><thead><tr>';
  const allPageItemsSelected = areAllPageItemsSelected('support', pageData);
  html += '<th class="checkbox-cell"><input type="checkbox" id="selectAll_support" aria-label="현재 페이지 전체 선택" ' + (allPageItemsSelected ? 'checked' : '') + ' onchange="toggleSelectAll(\'support\')"></th>';
  html += '<th>ID</th><th>날짜</th><th>제목</th><th>글쓴이</th><th>문의내용 확인</th><th>문의내용 답변</th><th>관리자</th><th>작업</th>';
  html += '</tr></thead><tbody>';
  
  pageData.forEach(item => {
    const status = item.answered ? '<span class="badge badge-success">답변완료</span>' : '<span class="badge badge-warning">대기중</span>';
    const selected = state.selectedIds.has(getSelectionKey(item.id));
    html += `<tr data-select-row-id="${encodeURIComponent(String(item.id))}" class="${selected ? 'is-selected' : ''}" aria-selected="${selected}">
       <td class="checkbox-cell"><input type="checkbox" aria-label="항목 개별 선택" data-select-collection="support" data-select-id="${encodeURIComponent(String(item.id))}" ${selected ? 'checked' : ''}></td>
      <td style="font-size:11px">${item.id.substring(0,8)}...</td>
      <td>${formatDate(item.createdAt)}</td>
      <td>${item.title || '-'}</td>
      <td>${item.userEmail || item.userName || '-'}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${item.message || item.content || '-'}</td>
      <td>${item.answer ? item.answer.substring(0,30) + '...' : '-'}</td>
      <td>${item.adminEmail || '-'}</td>
      <td class="actions">${renderActions(item, 'support')}</td>
    </tr>`;
  });
  
  html += '</tbody></table>';
  wrapper.innerHTML = html;
  bindTableSelection(wrapper, 'support', pageData);
  renderSupportPagination();
}

function renderSupportPagination() {
  const state = AppState.pageStates.support;
  const container = $('#supportPagination');
  if (!container) return;

  const totalPages = Math.ceil(state.filteredData.length / state.itemsPerPage);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `<button ${state.page <= 1 ? 'disabled' : ''} onclick="supportGoPage(${state.page - 1})"><i class="fas fa-angle-left"></i></button>`;
  const startPage = Math.max(1, state.page - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="${i === state.page ? 'active' : ''}" onclick="supportGoPage(${i})">${i}</button>`;
  }
  html += `<button ${state.page >= totalPages ? 'disabled' : ''} onclick="supportGoPage(${state.page + 1})"><i class="fas fa-angle-right"></i></button>`;
  container.innerHTML = html;
}

function supportGoPage(page) {
  const state = AppState.pageStates.support;
  if (!state) return;
  state.page = page;
  renderSupportTable();
}

function viewSupportDetail(id) {
  const state = AppState.pageStates.support;
  const item = state.data.find(d => d.id === id);
  if (!item) return;
  
  showModal('문의 상세', `
    <div class="form-group"><label>제목</label><p>${item.title || '-'}</p></div>
    <div class="form-group"><label>작성일</label><p>${formatDateTime(item.createdAt)}</p></div>
    <div class="form-group"><label>글쓴이</label><p>${item.userEmail || item.userName || '-'}</p></div>
    <div class="form-group"><label>문의 내용</label><p style="white-space:pre-wrap">${item.message || item.content || '-'}</p></div>
    ${item.answer ? `<div class="answer-area"><label style="font-weight:500;font-size:13px">답변</label><p style="margin-top:8px;white-space:pre-wrap">${item.answer}</p></div>` : ''}
  `, '');
}

function answerSupport(id) {
  const state = AppState.pageStates.support;
  const item = state.data.find(d => d.id === id);
  if (!item) return;
  
  showModal('답변 작성', `
    <div class="form-group">
      <label>제목: ${item.title || '-'}</label>
    </div>
    <div class="form-group">
      <label>답변</label>
      <textarea class="form-control" id="answerInput" rows="5" placeholder="답변을 입력하세요">${item.answer || ''}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">취소</button>
    <button class="btn btn-primary" onclick="saveAnswer('${id}')">저장</button>
  `);
}

async function saveAnswer(id) {
  const answer = $('#answerInput').value;
  if (!answer.trim()) { showToast('답변을 입력하세요.', 'warning'); return; }
  
  try {
    await db.collection('supportTickets').doc(id).update({
      answer,
      answered: true,
      adminEmail: AppState.currentUser.email,
      answeredAt: FieldValue.serverTimestamp()
    });
    closeModal();
    showToast('답변이 저장되었습니다.', 'success');
    loadSupport();
  } catch (err) {
    showToast('저장 실패: ' + err.message, 'error');
  }
}

function searchSupport() {
  const state = AppState.pageStates.support;
  state.search = $('#search_support').value.trim().toLowerCase();
  state.filteredData = state.search ? state.data.filter(d => 
    (d.title || '').toLowerCase().includes(state.search) ||
    (d.userEmail || '').toLowerCase().includes(state.search) ||
    (d.message || d.content || '').toLowerCase().includes(state.search)
  ) : [...state.data];
  state.page = 1;
  renderSupportTable();
}
function resetSupportFilter() { AppState.pageStates.support.search = ''; AppState.pageStates.support.page = 1; $('#search_support').value = ''; AppState.pageStates.support.filteredData = [...AppState.pageStates.support.data]; renderSupportTable(); }
function supportPerPage() { AppState.pageStates.support.itemsPerPage = parseInt($('#perPage_support').value); AppState.pageStates.support.page = 1; renderSupportTable(); }

// Backup Page
function renderBackupPage(container) {
  container.innerHTML = `
    <div class="content-header">
      <h2 class="content-title">백업 및 복원</h2>
    </div>
    <div class="backup-section">
      <h3><i class="fas fa-download"></i> 데이터 백업</h3>
      <p>모든 Firestore 컬렉션의 데이터를 JSON 파일로 다운로드합니다.</p>
      <button class="btn btn-primary" onclick="exportData()"><i class="fas fa-download"></i> 백업 다운로드</button>
    </div>
    <div class="backup-section">
      <h3><i class="fas fa-upload"></i> 데이터 복원</h3>
      <p>JSON 백업 파일로부터 데이터를 복원합니다. 기존 데이터는 유지됩니다.</p>
      <div class="image-upload" id="restoreUpload" onclick="importData()">
        <i class="fas fa-cloud-upload-alt"></i>
        <p>JSON 파일을 클릭하여 선택</p>
      </div>
    </div>
  `;
  removeSaveBar();
}

async function exportData() {
  showToast('백업 데이터 생성 중...', 'info');
  const collections = ['characters', 'banners', 'supportCharacters', 'pvpPatch', 'patchNotes', 'boards', 'events', 'notices'];
  const backup = {};
  
  for (const col of collections) {
    try {
      const snapshot = await db.collection(col).get();
      backup[col] = [];
      snapshot.forEach(doc => backup[col].push({ ...doc.data(), id: doc.id }));
    } catch (e) { backup[col] = []; }
  }
  
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fppstudio_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('백업이 다운로드되었습니다.', 'success');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    showConfirm('복원 확인', '백업 파일을 복원하시겠습니까? 기존 데이터와 병합됩니다.', async () => {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        for (const [col, items] of Object.entries(data)) {
          for (const item of items) {
            const { id, actualId, ...docData } = item;
            await db.collection(col).doc(id).set(docData, { merge: true });
          }
        }
        
        showToast('복원이 완료되었습니다.', 'success');
      } catch (err) {
        showToast('복원 실패: ' + err.message, 'error');
      }
    });
  };
  input.click();
}

// ===== Page Configurations =====
function getPageColumns(collection) {
  if (ADMIN_MODULES[collection]?.columns) {
    return ADMIN_MODULES[collection].columns;
  }
  const configs = {
    banners: [
      { key: 'id', label: 'ID', type: 'default' },
      { key: 'imageUrl', label: '미리보기', type: 'preview' },
      { key: 'title', label: '제목', type: 'truncate' },
      { key: 'isActive', label: '활성화 상태', type: 'toggle' },
      { key: 'visible', label: '노출 상태', type: 'toggle' },
      { key: 'updatedBy', label: '관리자', type: 'default' }
    ],
    characters: [
      { key: 'id', label: 'ID', type: 'default' },
      { key: 'img', label: '이미지', type: 'image' },
      { key: 'name', label: '이름', type: 'default' },
      { key: 'grade', label: '등급', type: 'default' },
      { key: 'attribute', label: '속성', type: 'default' },
      { key: 'type', label: '타입', type: 'default' },
      { key: 'visible', label: '노출 상태', type: 'toggle' },
      { key: 'updatedBy', label: '관리자', type: 'default' }
    ],
    supportCharacters: [
      { key: 'id', label: 'ID', type: 'default' },
      { key: 'img', label: '이미지', type: 'image' },
      { key: 'name', label: '이름', type: 'default' },
      { key: 'grade', label: '등급', type: 'default' },
      { key: 'visible', label: '노출 상태', type: 'toggle' },
      { key: 'updatedBy', label: '관리자', type: 'default' }
    ],
    pvpPatch: [
      { key: 'patchDate', label: '패치 날짜', type: 'date' },
      { key: 'displayCharId', label: '캐릭터 ID', type: 'default' },
      { key: 'name', label: '캐릭터 이름', type: 'default' },
      { key: 'type', label: '타입', type: 'pvpType' },
      { key: 'visible', label: '노출 상태', type: 'toggle' },
      { key: 'updatedBy', label: '관리자', type: 'default' }
    ],
    patchNotes: [
      { key: 'id', label: 'ID', type: 'default' },
      { key: 'createdAt', label: '날짜', type: 'date' },
      { key: 'title', label: '제목', type: 'truncate' },
      { key: 'author', label: '글쓴이', type: 'default' },
      { key: 'visible', label: '노출 상태', type: 'toggle' },
      { key: 'updatedBy', label: '관리자', type: 'default' }
    ],
    boards: [
      { key: 'id', label: 'ID', type: 'default' },
      { key: 'createdAt', label: '날짜', type: 'date' },
      { key: 'title', label: '제목', type: 'truncate' },
      { key: 'uid', label: '글쓴이', type: 'default' },
      { key: 'published', label: '노출 상태', type: 'status' },
      { key: 'adminEmail', label: '관리자', type: 'default' }
    ],
    events: [
      { key: 'id', label: 'ID', type: 'default' },
      { key: 'createdAt', label: '날짜', type: 'date' },
      { key: 'title', label: '제목', type: 'truncate' },
      { key: 'author', label: '글쓴이', type: 'default' },
      { key: 'published', label: '노출 상태', type: 'toggle' },
      { key: 'adminEmail', label: '관리자', type: 'default' }
    ],
    notices: [
      { key: 'id', label: 'ID', type: 'default' },
      { key: 'createdAt', label: '날짜', type: 'date' },
      { key: 'title', label: '제목', type: 'truncate' },
      { key: 'author', label: '글쓴이', type: 'default' },
      { key: 'visible', label: '노출 상태', type: 'toggle' },
      { key: 'updatedBy', label: '관리자', type: 'default' }
    ]
  };
  return configs[collection] || [];
}

function getPageFilterConfig(collection) {
  if (ADMIN_MODULES[collection]?.filters) {
    return { filters: ADMIN_MODULES[collection].filters };
  }
  const configs = {
    characters: {
      filters: [
        { key: 'grade', label: '등급', options: ['전설', '영웅', '희귀', '일반'] },
        { key: 'attribute', label: '속성', options: ['화염', '냉기', '전기', '암흑', '광명'] },
        { key: 'type', label: '타입', options: ['전사', '마법사', '궁수', '탱커', '서포터'] }
      ]
    },
    supportCharacters: {
      filters: [
        { key: 'grade', label: '등급', options: ['전설', '영웅', '희귀', '일반'] },
        { key: 'attribute', label: '속성', options: ['화염', '냉기', '전기', '암흑', '광명'] }
      ]
    },
    pvpPatch: {
      filters: [
        { key: 'type', label: '타입', options: ['버프', '너프', '기능 수정', '신규', 'Up Comming'] }
      ]
    },
    boards: {
      filters: [
        { key: 'category', label: '카테고리', allLabel: '전체', options: ['자유', '정보', '질문', '자랑'] }
      ]
    }
  };
  return configs[collection] || null;
}

const BANNER_INTERNAL_TARGETS = Object.freeze([
  { value: 'home', label: '메인 홈', href: 'https://kimnatsu.github.io/STGFPPatch_V2/ko/Main.html#home' },
  { value: 'characters', label: '캐릭터', href: 'https://kimnatsu.github.io/STGFPPatch_V2/ko/Main.html#characters' },
  { value: 'pvp', label: 'PvP 패치', href: 'https://kimnatsu.github.io/STGFPPatch_V2/ko/Main.html#pvp' },
  { value: 'community', label: '커뮤니티 홈', href: 'https://kimnatsu.github.io/STGFPPatch_V2/ko/Community.html#home' },
  { value: 'patch', label: '패치노트', href: 'https://kimnatsu.github.io/STGFPPatch_V2/ko/Community.html#patch' },
  { value: 'board', label: '게시판', href: 'https://kimnatsu.github.io/STGFPPatch_V2/ko/Community.html#board' },
  { value: 'event', label: '이벤트', href: 'https://kimnatsu.github.io/STGFPPatch_V2/ko/Community.html#event' },
  { value: 'customerService', label: '고객센터', href: 'https://kimnatsu.github.io/STGFPPatch_V2/ko/CustomerService.html#home' }
]);

function escapeFormValue(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getBannerClickActionFormHtml(scope) {
  return `
    <div class="form-group">
      <label>배너 클릭 동작</label>
      <div class="radio-group banner-action-options">
        <label class="radio-label">
          <input type="radio" name="${scope}_clickAction" value="none" checked onchange="updateBannerClickActionFields('${scope}')">
          <span>없음</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="${scope}_clickAction" value="external" onchange="updateBannerClickActionFields('${scope}')">
          <span>외부 링크 열기</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="${scope}_clickAction" value="internal" onchange="updateBannerClickActionFields('${scope}')">
          <span>내부 탭 이동</span>
        </label>
      </div>
      <div class="banner-click-fields" id="${scope}_bannerClickFields"></div>
    </div>
  `;
}

function getBannerClickActionState(item = {}) {
  const link = item.link || '';
  const internalTarget = BANNER_INTERNAL_TARGETS.find(target => (
    target.href === link || target.value === item.internalTab || target.value === item.targetTab
  ));
  let action = item.clickAction || item.actionType || '';
  if (!action) action = internalTarget ? 'internal' : (link ? 'external' : 'none');
  if (!['none', 'external', 'internal'].includes(action)) action = 'none';

  return {
    action,
    link,
    internalTab: item.internalTab || item.targetTab || internalTarget?.value || 'home'
  };
}

function updateBannerClickActionFields(scope, initialState = {}) {
  const container = $(`#${scope}_bannerClickFields`);
  if (!container) return;

  const action = document.querySelector(`input[name="${scope}_clickAction"]:checked`)?.value || 'none';
  const existingExternalUrl = $(`#${scope}_externalUrl`)?.value || '';
  const existingInternalTab = $(`#${scope}_internalTab`)?.value || 'home';

  if (action === 'external') {
    const value = initialState.link ?? existingExternalUrl;
    container.innerHTML = `
      <input type="url" class="form-control" id="${scope}_externalUrl"
        value="${escapeFormValue(value)}" placeholder="https://example.com">
    `;
    return;
  }

  if (action === 'internal') {
    const selectedTab = initialState.internalTab || existingInternalTab;
    container.innerHTML = `
      <select class="form-control" id="${scope}_internalTab">
        ${BANNER_INTERNAL_TARGETS.map(target => `
          <option value="${target.value}" ${target.value === selectedTab ? 'selected' : ''}>${target.label}</option>
        `).join('')}
      </select>
    `;
    return;
  }

  container.innerHTML = '';
}

function initializeBannerClickActionFields(scope, item = null) {
  const state = getBannerClickActionState(item || {});
  const radio = document.querySelector(`input[name="${scope}_clickAction"][value="${state.action}"]`);
  if (radio) radio.checked = true;
  updateBannerClickActionFields(scope, state);
}

function getBannerClickActionData(scope) {
  const action = document.querySelector(`input[name="${scope}_clickAction"]:checked`)?.value || 'none';
  if (action === 'external') {
    const link = $(`#${scope}_externalUrl`)?.value.trim() || '';
    if (!/^https?:\/\//i.test(link)) {
      showToast('외부 링크는 http:// 또는 https://로 시작해야 합니다.', 'warning');
      return null;
    }
    return { clickAction: 'external', link, internalTab: null };
  }

  if (action === 'internal') {
    const internalTab = $(`#${scope}_internalTab`)?.value || 'home';
    const target = BANNER_INTERNAL_TARGETS.find(item => item.value === internalTab);
    return {
      clickAction: 'internal',
      link: target?.href || BANNER_INTERNAL_TARGETS[0].href,
      internalTab
    };
  }

  return { clickAction: 'none', link: null, internalTab: null };
}

const CHARACTER_DEFAULT_SKILLS = Object.freeze([
  { type: 'skill1', label: '스킬 1' },
  { type: 'skill2', label: '스킬 2' },
  { type: 'skill3', label: '스킬 3', suffix: '필살기' },
  { type: 'skill4', label: '스킬 4', suffix: '궁극기' },
  { type: 'cardSkill1', label: '카드 스킬 1' },
  { type: 'cardSkill2', label: '카드 스킬 2' }
]);

function getCharacterSkillLabel(type) {
  const skill = CHARACTER_DEFAULT_SKILLS.find(item => item.type === type);
  return skill ? `${skill.label}${skill.suffix ? ` (${skill.suffix})` : ''}` : '스킬';
}

function renderCharacterEntry(scope, section, item = {}, index = 0) {
  const isTip = section === 'tips';
  const type = item.type || 'custom';
  const title = isTip
    ? '꿀팁'
    : section === 'skills'
      ? getCharacterSkillLabel(type)
      : '서포트 스킬';
  const value = isTip ? (item.text || item.content || '') : (item.name || '');
  const description = item.desc || item.description || '';
  const entryId = `${scope}_${section}_${index}`;

  return `
    <div class="character-entry" data-character-entry="${section}" data-entry-type="${escapeFormValue(type)}">
      <div class="character-entry-header">
        <strong>${title}</strong>
        ${isTip ? '<span class="character-entry-author">작성자: 관리자</span>' : ''}
        <button type="button" class="character-entry-remove" onclick="removeCharacterEntry('${entryId}')">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
      ${isTip
        ? `<textarea class="form-control character-entry-text" id="${entryId}_text" maxlength="300" placeholder="캐릭터 꿀팁을 입력하세요">${escapeFormValue(value)}</textarea>`
        : `<input type="text" class="form-control character-entry-name" id="${entryId}_name" value="${escapeFormValue(value)}" placeholder="${section === 'skills' ? '스킬 이름' : '서포트 스킬 이름'}">
           <textarea class="form-control character-entry-description" id="${entryId}_desc" maxlength="1000" placeholder="스킬 설명">${escapeFormValue(description)}</textarea>`}
    </div>
  `;
}

function initializeCharacterDetailFields(scope, item = {}) {
  ['skills', 'supportSkills', 'tips'].forEach(section => {
    const list = $(`#${scope}_${section}List`);
    if (!list) return;
    const source = section === 'skills'
      ? item.skills
      : section === 'supportSkills'
        ? item.supportSkills
        : (item.tips || item.adminTips);
    const entries = Array.isArray(source) ? source : [];
    list.innerHTML = entries
      .map((entry, index) => renderCharacterEntry(scope, section, entry, index))
      .join('');
  });

  const defaultSkills = $(`#${scope}_defaultSkills`);
  const addDefaultButton = $(`#${scope}_addDefaultSkills`);
  if (defaultSkills && addDefaultButton) {
    defaultSkills.checked = false;
    addDefaultButton.disabled = true;
    addDefaultButton.dataset.defaultAdded = 'false';
  }
}

function toggleCharacterDefaultSkills(scope) {
  const checkbox = $(`#${scope}_defaultSkills`);
  const button = $(`#${scope}_addDefaultSkills`);
  if (!checkbox || !button) return;
  button.disabled = !checkbox.checked || button.dataset.defaultAdded === 'true';
}

function addCharacterDefaultSkills(scope) {
  const checkbox = $(`#${scope}_defaultSkills`);
  const button = $(`#${scope}_addDefaultSkills`);
  const list = $(`#${scope}_skillsList`);
  if (!checkbox?.checked || !button || !list || button.dataset.defaultAdded === 'true') return;

  const startIndex = list.querySelectorAll('[data-character-entry="skills"]').length;
  list.insertAdjacentHTML(
    'beforeend',
    CHARACTER_DEFAULT_SKILLS.map((skill, index) => renderCharacterEntry(
      scope,
      'skills',
      { type: skill.type },
      startIndex + index
    )).join('')
  );
  button.dataset.defaultAdded = 'true';
  button.disabled = true;
}

function addCharacterEntry(scope, section) {
  const list = $(`#${scope}_${section}List`);
  if (!list) return;
  const index = list.querySelectorAll('[data-character-entry="${section}"]').length;
  list.insertAdjacentHTML(
    'beforeend',
    renderCharacterEntry(scope, section, { type: 'custom' }, index)
  );
}

function removeCharacterEntry(entryId) {
  const entry = $(`#${entryId}_name`)?.closest('.character-entry')
    || $(`#${entryId}_text`)?.closest('.character-entry')
    || document.querySelector(`[id^="${entryId}"]`)?.closest('.character-entry');
  if (entry) entry.remove();
}

function collectCharacterEntries(scope, section) {
  return Array.from(document.querySelectorAll(
    `#${scope}_${section}List [data-character-entry="${section}"]`
  )).map(entry => {
    const isTip = section === 'tips';
    const type = entry.dataset.entryType || 'custom';
    const text = entry.querySelector('.character-entry-text')?.value.trim() || '';
    const name = entry.querySelector('.character-entry-name')?.value.trim() || '';
    const desc = entry.querySelector('.character-entry-description')?.value.trim() || '';

    if (isTip) {
      return text ? {
        text,
        author: '관리자',
        uid: AppState.currentUser?.uid || '',
        isAdminTip: true
      } : null;
    }
    return name || desc ? { type, name, desc } : null;
  }).filter(Boolean);
}

async function getNextCharacterId(collection) {
  const values = [];
  const state = AppState.pageStates[collection];
  (state?.data || []).forEach(item => {
    const value = Number(item.characterId ?? item.id);
    if (Number.isFinite(value)) values.push(value);
  });

  if (!values.length) {
    const snapshot = await db.collection(collection).get();
    snapshot.forEach(doc => {
      const data = doc.data() || {};
      const value = Number(data.id ?? data.num ?? data.no ?? data.characterId ?? doc.id);
      if (Number.isFinite(value)) values.push(value);
    });
  }

  return (values.length ? Math.max(...values) : 0) + 1;
}

async function persistAdminCharacterTips(characterId, tips) {
  const tipCollection = db.collection(
    `tips_${String(characterId).replace(/[^\w-]/g, '_')}`
  );
  const existing = await tipCollection.where('isAdminTip', '==', true).get();

  if (!existing.empty) {
    const deleteBatch = db.batch();
    existing.forEach(doc => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();
  }

  if (!tips.length) return;
  const writeBatch = db.batch();
  const date = new Date().toISOString().slice(0, 10);
  tips.forEach((tip, index) => {
    const ref = tipCollection.doc(`admin_${index + 1}`);
    writeBatch.set(ref, {
      text: tip.text,
      author: '관리자',
      uid: AppState.currentUser?.uid || '',
      avatar: AppState.currentUser?.photoURL || '',
      isAdminTip: true,
      date,
      upBy: [],
      downBy: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  });
  await writeBatch.commit();
}

async function loadAdminCharacterTips(characterId) {
  const tipCollection = db.collection(
    `tips_${String(characterId).replace(/[^\w-]/g, '_')}`
  );
  const snapshot = await tipCollection.where('isAdminTip', '==', true).get();
  return snapshot.docs.map(doc => {
    const data = doc.data() || {};
    return {
      text: data.text || data.content || '',
      author: '관리자',
      uid: data.uid || '',
      isAdminTip: true
    };
  }).filter(item => item.text);
}

function getAddFormConfig(collection) {
  const configs = {
    banners: {
      title: '배너 추가',
      hasImage: true,
      formHtml: `
        <div class="form-group">
          <label for="add_id">ID</label>
          <input type="text" class="form-control" id="add_id" value="저장 시 자동 지정" disabled>
        </div>
        <div class="form-group">
          <label for="add_title">제목 <span class="form-label-hint">(최대 50자)</span></label>
          <input type="text" class="form-control" id="add_title" maxlength="50" placeholder="배너 제목">
        </div>
        <div class="form-group">
          <label>이미지 등록 <span class="required-mark">*</span></label>
          <div class="banner-image-upload-row">
            <div class="image-upload banner-image-upload" id="imageUpload_banners" aria-label="배너 이미지 업로드">
              <i class="fas fa-plus"></i>
            </div>
            <div class="banner-image-upload-info">
              <ul>
                <li>이미지 사이즈 : 1472×420 px (자동 리사이즈)</li>
                <li>최대 용량 : 3 MB</li>
                <li>확장자 : jpg, png, gif</li>
              </ul>
              <button type="button" class="btn btn-primary banner-upload-button" onclick="document.getElementById('imageUpload_banners').click()">
                업로드 <i class="fas fa-upload"></i>
              </button>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>활성화 상태</label>
          <div class="radio-group">
            <label class="radio-label"><input type="radio" name="add_active" value="false" checked><span>OFF</span></label>
            <label class="radio-label"><input type="radio" name="add_active" value="true"><span>ON</span></label>
          </div>
        </div>
        ${getBannerClickActionFormHtml('add')}
      `,
      getData: () => {
        const title = $('#add_title').value.trim();
        if (!title) {
          showToast('제목을 입력하세요.', 'warning');
          return null;
        }
        if (title.length > 50) {
          showToast('제목은 50자 이내로 입력하세요.', 'warning');
          return null;
        }
        if (!currentImageUrl && !currentImageUploadPromise) {
          showToast('배너 이미지를 등록하고 편집 결과를 적용하세요.', 'warning');
          return null;
        }
        const clickAction = getBannerClickActionData('add');
        if (!clickAction) return null;
        return {
          title,
          ...clickAction,
          isActive: $('input[name="add_active"]:checked')?.value === 'true',
          visible: true,
          imageFile: currentImageFile
        };
      }
    },
    characters: {
      title: '캐릭터 추가',
      hasImage: true,
      formHtml: `
        <div class="form-group">
          <label for="add_characterId">ID</label>
          <input type="text" class="form-control" id="add_characterId" value="저장 시 자동 지정" disabled>
        </div>
        <div class="form-group">
          <label for="add_name">캐릭터 이름 <span class="form-label-hint">(최대 20자)</span></label>
          <input type="text" class="form-control" id="add_name" maxlength="20" placeholder="캐릭터 이름">
        </div>
        <div class="form-group">
          <label for="add_grade">등급 선택</label>
          <select class="form-control" id="add_grade">
            <option value="특전">특전</option><option value="SS">SS</option><option value="S">S</option>
            <option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </select>
        </div>
        <div class="form-group">
          <label for="add_attribute">속성 선택</label>
          <select class="form-control" id="add_attribute">
            <option value="힘">힘</option><option value="기">기</option><option value="심">심</option>
          </select>
        </div>
        <div class="form-group">
          <label for="add_type">타입 선택</label>
          <select class="form-control" id="add_type">
            <option value="격투">격투</option><option value="검사">검사</option>
            <option value="원소">원소</option><option value="특수">특수</option>
          </select>
        </div>
        <div class="form-group">
          <label>이미지 등록 <span class="required-mark">*</span></label>
          <div class="character-image-upload-row">
            <div class="image-upload character-image-upload" id="imageUpload_characters" aria-label="캐릭터 이미지 업로드">
              <i class="fas fa-plus"></i>
            </div>
            <div class="character-image-upload-info">
              <ul>
                <li>이미지 사이즈 : 500×500 px (자동 리사이즈)</li>
                <li>정사각형 비율로 자른 뒤 저장됩니다.</li>
              </ul>
              <button type="button" class="btn btn-primary character-upload-button" onclick="document.getElementById('imageUpload_characters').click()">
                업로드 <i class="fas fa-upload"></i>
              </button>
            </div>
          </div>
        </div>
        <div class="form-group character-detail-group">
          <div class="character-section-heading">
            <label>스킬 목록</label>
            <div class="character-section-actions">
              <label class="checkbox-label"><input type="checkbox" id="add_defaultSkills" onchange="toggleCharacterDefaultSkills('add')"><span>기본 세트 생성</span></label>
              <button type="button" class="btn btn-secondary btn-sm" id="add_addDefaultSkills" onclick="addCharacterDefaultSkills('add')" disabled>스킬 추가</button>
            </div>
          </div>
          <div class="character-entry-list" id="add_skillsList"></div>
        </div>
        <div class="form-group character-detail-group">
          <div class="character-section-heading">
            <label>서포트 스킬</label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addCharacterEntry('add','supportSkills')">스킬 추가</button>
          </div>
          <div class="character-entry-list" id="add_supportSkillsList"></div>
        </div>
        <div class="form-group character-detail-group">
          <div class="character-section-heading">
            <label>꿀팁</label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addCharacterEntry('add','tips')">꿀팁 추가</button>
          </div>
          <div class="character-entry-list" id="add_tipsList"></div>
        </div>
        <div class="form-check"><input type="checkbox" id="add_published" checked><label>노출</label></div>
      `,
      getData: () => {
        const name = $('#add_name').value.trim();
        if (!name) { showToast('이름을 입력하세요.', 'warning'); return null; }
        if (name.length > 20) { showToast('캐릭터 이름은 20자 이내로 입력하세요.', 'warning'); return null; }
        if (!currentImageUrl && !currentImageUploadPromise) {
          showToast('캐릭터 이미지를 등록하고 편집 결과를 적용하세요.', 'warning');
          return null;
        }
        return {
          name,
          grade: $('#add_grade').value,
          attr: $('#add_attribute').value,
          attribute: $('#add_attribute').value,
          type: $('#add_type').value,
          published: $('#add_published').checked,
          skills: collectCharacterEntries('add', 'skills'),
          supportSkills: collectCharacterEntries('add', 'supportSkills'),
          adminTipItems: collectCharacterEntries('add', 'tips'),
          imageFile: currentImageFile
        };
      }
    },
    supportCharacters: {
      title: '현질 서폿 캐릭터 추가',
      hasImage: true,
      formHtml: `
        <div class="form-group"><label>이름</label><input type="text" class="form-control" id="add_name" placeholder="캐릭터 이름"></div>
        <div class="form-group"><label>이미지</label><div class="image-upload" id="imageUpload_supportCharacters"><i class="fas fa-cloud-upload-alt"></i><p>클릭하여 이미지 업로드</p></div></div>
        <div class="form-group"><label>등급</label><select class="form-control" id="add_grade"><option value="전설">전설</option><option value="영웅">영웅</option><option value="희귀">희귀</option><option value="일반">일반</option></select></div>
        <div class="form-group"><label>속성</label><select class="form-control" id="add_attribute"><option value="화염">화염</option><option value="냉기">냉기</option><option value="전기">전기</option><option value="암흑">암흑</option><option value="광명">광명</option></select></div>
        <div class="form-check"><input type="checkbox" id="add_published" checked><label>노출</label></div>
      `,
      getData: () => {
        const name = $('#add_name').value;
        if (!name) { showToast('이름을 입력하세요.', 'warning'); return null; }
        return { name, grade: $('#add_grade').value, attribute: $('#add_attribute').value, published: $('#add_published').checked, imageFile: currentImageFile };
      }
    },
    pvpPatch: {
      title: 'PvP 패치 추가',
      hasImage: false,
      formHtml: `
        <div class="form-group"><label>캐릭터 이름</label><input type="text" class="form-control" id="add_name" placeholder="캐릭터 이름"></div>
        <div class="form-group"><label>패치 날짜</label><input type="date" class="form-control" id="add_patchDate"></div>
        <div class="form-group"><label>타입</label><select class="form-control" id="add_type"><option value="버프">버프</option><option value="너프">너프</option><option value="기능수정">기능수정</option><option value="신규">신규</option><option value="Up Comming">Up Comming</option></select></div>
        <div class="form-check"><input type="checkbox" id="add_published" checked><label>노출</label></div>
      `,
      getData: () => {
        const name = $('#add_name').value;
        if (!name) { showToast('이름을 입력하세요.', 'warning'); return null; }
        const patchDate = $('#add_patchDate').value;
        if (!patchDate) { showToast('패치 날짜를 선택하세요.', 'warning'); return null; }
        return { name, patchDate, type: $('#add_type').value, published: $('#add_published').checked, imageFile: currentImageFile };
      }
    },
    patchNotes: {
      title: '패치노트 작성',
      hasImage: false,
      formHtml: `
        <div class="form-group"><label>제목</label><input type="text" class="form-control" id="add_title" placeholder="패치노트 제목"></div>
        <div class="form-group"><label>글쓴이</label><input type="text" class="form-control" id="add_author" value="관리자" readonly></div>
        <div class="form-group"><label>본문</label><textarea class="form-control" id="add_content" rows="8" placeholder="패치노트 내용을 입력하세요"></textarea></div>
        <div class="form-check"><input type="checkbox" id="add_published" checked><label>노출</label></div>
      `,
      getData: () => {
        const title = $('#add_title').value;
        if (!title) { showToast('제목을 입력하세요.', 'warning'); return null; }
        return { title, author: '관리자', content: $('#add_content').value, visible: $('#add_published').checked, imageFile: null };
      }
    },
    boards: {
      title: '게시글 추가',
      hasImage: false,
      formHtml: `
        <div class="form-group"><label>제목</label><input type="text" class="form-control" id="add_title" placeholder="게시글 제목"></div>
        <div class="form-group"><label>본문</label><textarea class="form-control" id="add_content" rows="8" placeholder="게시글 내용을 입력하세요"></textarea></div>
        <div class="form-check"><input type="checkbox" id="add_published" checked><label>노출</label></div>
      `,
      getData: () => {
        const title = $('#add_title').value;
        if (!title) { showToast('제목을 입력하세요.', 'warning'); return null; }
        return { title, text: $('#add_content').value, uid: AppState.currentUser?.uid || '', published: $('#add_published').checked, imageFile: null };
      }
    },
    events: {
      title: '이벤트 추가',
      hasImage: false,
      formHtml: `
        <div class="form-group"><label>제목</label><input type="text" class="form-control" id="add_title" placeholder="이벤트 제목"></div>
        <div class="form-group"><label>글쓴이</label><input type="text" class="form-control" id="add_author" value="${AppState.currentUser?.email?.split('@')[0] || '관리자'}"></div>
        <div class="form-group"><label>본문</label><textarea class="form-control" id="add_content" rows="8" placeholder="이벤트 내용을 입력하세요"></textarea></div>
        <div class="form-check"><input type="checkbox" id="add_published" checked><label>노출</label></div>
      `,
      getData: () => {
        const title = $('#add_title').value;
        if (!title) { showToast('제목을 입력하세요.', 'warning'); return null; }
        return { title, author: $('#add_author').value, content: $('#add_content').value, published: $('#add_published').checked, imageFile: null };
      }
    },
    notices: {
      title: '공지사항 추가',
      hasImage: false,
      formHtml: `
        <div class="form-group"><label>제목</label><input type="text" class="form-control" id="add_title" placeholder="공지사항 제목"></div>
        <div class="form-group"><label>글쓴이</label><input type="text" class="form-control" id="add_author" value="관리자" readonly></div>
        <div class="form-group"><label>본문</label><textarea class="form-control" id="add_content" rows="8" placeholder="공지사항 내용을 입력하세요"></textarea></div>
        <div class="form-check"><input type="checkbox" id="add_published" checked><label>노출</label></div>
      `,
      getData: () => {
        const title = $('#add_title').value;
        if (!title) { showToast('제목을 입력하세요.', 'warning'); return null; }
        return { title, author: '관리자', content: $('#add_content').value, visible: $('#add_published').checked, imageFile: null };
      }
    }
  };
  return configs[collection] || null;
}

function getEditFormConfig(collection, item) {
  const configs = {
    banners: {
      title: '배너 수정',
      hasImage: true,
      formHtml: `
        <div class="form-group">
          <label for="edit_id">ID</label>
          <input type="text" class="form-control" id="edit_id" value="${escapeFormValue(getDisplayId(item))}" disabled>
        </div>
        <div class="form-group">
          <label for="edit_title">제목 <span class="form-label-hint">(최대 50자)</span></label>
          <input type="text" class="form-control" id="edit_title" maxlength="50" value="${escapeFormValue(item.title || '')}">
        </div>
        <div class="form-group">
          <label>이미지 등록 <span class="required-mark">*</span></label>
          <div class="banner-image-upload-row">
            <div class="image-upload banner-image-upload ${getStoredImageUrl('banners', item) ? 'has-image' : ''}" id="imageUpload_banners" aria-label="배너 이미지 업로드">
              ${getStoredImageUrl('banners', item)
                ? `<img src="${escapeFormValue(getStoredImageUrl('banners', item))}" class="image-preview" alt="">`
                : '<i class="fas fa-plus"></i>'}
            </div>
            <div class="banner-image-upload-info">
              <ul>
                <li>이미지 사이즈 : 1472×420 px (자동 리사이즈)</li>
                <li>최대 용량 : 3 MB</li>
                <li>확장자 : jpg, png, gif</li>
              </ul>
              <button type="button" class="btn btn-primary banner-upload-button" onclick="document.getElementById('imageUpload_banners').click()">
                업로드 <i class="fas fa-upload"></i>
              </button>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>활성화 상태</label>
          <div class="radio-group">
            <label class="radio-label"><input type="radio" name="edit_active" value="false" ${item.isActive ? '' : 'checked'}><span>OFF</span></label>
            <label class="radio-label"><input type="radio" name="edit_active" value="true" ${item.isActive ? 'checked' : ''}><span>ON</span></label>
          </div>
        </div>
        ${getBannerClickActionFormHtml('edit')}
      `,
      getData: () => {
        const title = $('#edit_title').value.trim();
        if (!title) {
          showToast('제목을 입력하세요.', 'warning');
          return null;
        }
        if (title.length > 50) {
          showToast('제목은 50자 이내로 입력하세요.', 'warning');
          return null;
        }
        const clickAction = getBannerClickActionData('edit');
        if (!clickAction) return null;
        return {
          title,
          ...clickAction,
          isActive: $('input[name="edit_active"]:checked')?.value === 'true',
          imageFile: currentImageFile
        };
      }
    },
    characters: {
      title: '캐릭터 수정',
      hasImage: true,
      formHtml: `
        <div class="form-group">
          <label for="edit_characterId">ID</label>
          <input type="text" class="form-control" id="edit_characterId" value="${escapeFormValue(getDisplayId(item))}" disabled>
        </div>
        <div class="form-group">
          <label for="edit_name">캐릭터 이름 <span class="form-label-hint">(최대 20자)</span></label>
          <input type="text" class="form-control" id="edit_name" maxlength="20" value="${escapeFormValue(item.name || '')}">
        </div>
        <div class="form-group">
          <label>이미지 등록 <span class="required-mark">*</span></label>
          <div class="character-image-upload-row">
            <div class="image-upload character-image-upload ${getStoredImageUrl('characters', item) ? 'has-image' : ''}" id="imageUpload_characters" aria-label="캐릭터 이미지 업로드">
              ${getStoredImageUrl('characters', item)
                ? `<img src="${escapeFormValue(getStoredImageUrl('characters', item))}" class="image-preview" alt="">`
                : '<i class="fas fa-plus"></i>'}
            </div>
            <div class="character-image-upload-info">
              <ul>
                <li>이미지 사이즈 : 500×500 px (자동 리사이즈)</li>
                <li>정사각형 비율로 자른 뒤 저장됩니다.</li>
              </ul>
              <button type="button" class="btn btn-primary character-upload-button" onclick="document.getElementById('imageUpload_characters').click()">
                업로드 <i class="fas fa-upload"></i>
              </button>
            </div>
          </div>
        </div>
        <div class="form-group character-detail-group">
          <div class="character-section-heading">
            <label>스킬 목록</label>
            <div class="character-section-actions">
              <label class="checkbox-label"><input type="checkbox" id="edit_defaultSkills" onchange="toggleCharacterDefaultSkills('edit')"><span>기본 세트 생성</span></label>
              <button type="button" class="btn btn-secondary btn-sm" id="edit_addDefaultSkills" onclick="addCharacterDefaultSkills('edit')" disabled>스킬 추가</button>
            </div>
          </div>
          <div class="character-entry-list" id="edit_skillsList"></div>
        </div>
        <div class="form-group character-detail-group">
          <div class="character-section-heading">
            <label>서포트 스킬</label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addCharacterEntry('edit','supportSkills')">스킬 추가</button>
          </div>
          <div class="character-entry-list" id="edit_supportSkillsList"></div>
        </div>
        <div class="form-group character-detail-group">
          <div class="character-section-heading">
            <label>꿀팁</label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addCharacterEntry('edit','tips')">꿀팁 추가</button>
          </div>
          <div class="character-entry-list" id="edit_tipsList"></div>
        </div>
        <div class="form-check"><input type="checkbox" id="edit_published" ${item.published !== false ? 'checked' : ''}><label>노출</label></div>
      `,
      getData: () => {
        const name = $('#edit_name').value.trim();
        if (!name) { showToast('이름을 입력하세요.', 'warning'); return null; }
        if (name.length > 20) { showToast('캐릭터 이름은 20자 이내로 입력하세요.', 'warning'); return null; }
        return {
          name,
          grade: $('#edit_grade').value,
          attr: $('#edit_attribute').value,
          attribute: $('#edit_attribute').value,
          type: $('#edit_type').value,
          published: $('#edit_published').checked,
          skills: collectCharacterEntries('edit', 'skills'),
          supportSkills: collectCharacterEntries('edit', 'supportSkills'),
          adminTipItems: collectCharacterEntries('edit', 'tips'),
          imageFile: currentImageFile
        };
      }
    },
    supportCharacters: {
      title: '현질 서폿 캐릭터 수정',
      hasImage: true,
      formHtml: `
        <div class="form-group"><label>이름</label><input type="text" class="form-control" id="edit_name" value="${item.name || ''}"></div>
        <div class="form-group"><label>이미지</label><div class="image-upload" id="imageUpload_supportCharacters">${getStoredImageUrl('supportCharacters', item) ? `<img src="${getStoredImageUrl('supportCharacters', item)}" class="image-preview">` : '<i class="fas fa-cloud-upload-alt"></i><p>클릭하여 이미지 업로드</p>'}</div></div>
        <div class="form-group"><label>등급</label><select class="form-control" id="edit_grade"><option value="전설" ${item.grade==='전설'?'selected':''}>전설</option><option value="영웅" ${item.grade==='영웅'?'selected':''}>영웅</option><option value="희귀" ${item.grade==='희귀'?'selected':''}>희귀</option><option value="일반" ${item.grade==='일반'?'selected':''}>일반</option></select></div>
        <div class="form-group"><label>속성</label><select class="form-control" id="edit_attribute"><option value="화염" ${item.attribute==='화염'?'selected':''}>화염</option><option value="냉기" ${item.attribute==='냉기'?'selected':''}>냉기</option><option value="전기" ${item.attribute==='전기'?'selected':''}>전기</option><option value="암흑" ${item.attribute==='암흑'?'selected':''}>암흑</option><option value="광명" ${item.attribute==='광명'?'selected':''}>광명</option></select></div>
        <div class="form-check"><input type="checkbox" id="edit_published" ${item.published ? 'checked' : ''}><label>노출</label></div>
      `,
      getData: () => {
        const name = $('#edit_name').value;
        if (!name) { showToast('이름을 입력하세요.', 'warning'); return null; }
        return { name, grade: $('#edit_grade').value, attribute: $('#edit_attribute').value, published: $('#edit_published').checked, imageFile: currentImageFile };
      }
    },
    pvpPatch: {
      title: 'PvP 패치 수정',
      hasImage: false,
      formHtml: `
        <div class="form-group"><label>캐릭터 이름</label><input type="text" class="form-control" id="edit_name" value="${item.name || ''}"></div>
        <div class="form-group"><label>패치 날짜</label><input type="date" class="form-control" id="edit_patchDate" value="${item.patchDate || item.date || ''}"></div>
        <div class="form-group"><label>타입</label><select class="form-control" id="edit_type"><option value="버프" ${item.type==='버프'?'selected':''}>버프</option><option value="너프" ${item.type==='너프' || item.type==='nerf'?'selected':''}>너프</option><option value="기능수정" ${item.type==='기능수정' || item.type==='조정'?'selected':''}>기능수정</option><option value="신규" ${item.type==='신규'?'selected':''}>신규</option><option value="Up Comming" ${item.type==='Up Comming' || item.type==='upcoming' || item.type==='up coming'?'selected':''}>Up Comming</option></select></div>
        <div class="form-check"><input type="checkbox" id="edit_published" ${item.published ? 'checked' : ''}><label>노출</label></div>
      `,
      getData: () => {
        const name = $('#edit_name').value;
        if (!name) { showToast('이름을 입력하세요.', 'warning'); return null; }
        const patchDate = $('#edit_patchDate').value;
        if (!patchDate) { showToast('패치 날짜를 선택하세요.', 'warning'); return null; }
        return { name, patchDate, type: $('#edit_type').value, published: $('#edit_published').checked, imageFile: currentImageFile };
      }
    },
    patchNotes: {
      title: '패치노트 수정',
      hasImage: false,
      formHtml: `
        <div class="form-group"><label>제목</label><input type="text" class="form-control" id="edit_title" value="${item.title || ''}"></div>
        <div class="form-group"><label>글쓴이</label><input type="text" class="form-control" id="edit_author" value="관리자" readonly></div>
        <div class="form-group"><label>본문</label><textarea class="form-control" id="edit_content" rows="8">${item.content || ''}</textarea></div>
        <div class="form-check"><input type="checkbox" id="edit_published" ${item.visible !== false ? 'checked' : ''}><label>노출</label></div>
      `,
      getData: () => {
        const title = $('#edit_title').value;
        if (!title) { showToast('제목을 입력하세요.', 'warning'); return null; }
        return { title, author: '관리자', content: $('#edit_content').value, visible: $('#edit_published').checked, imageFile: null };
      }
    },
    boards: {
      title: '게시글 수정',
      hasImage: false,
      formHtml: `
        <div class="form-group"><label>제목</label><input type="text" class="form-control" id="edit_title" value="${item.title || ''}"></div>
        <div class="form-group"><label>본문</label><textarea class="form-control" id="edit_content" rows="8">${item.text || ''}</textarea></div>
        <div class="form-check"><input type="checkbox" id="edit_published" ${item.published !== false ? 'checked' : ''}><label>노출</label></div>
      `,
      getData: () => {
        const title = $('#edit_title').value;
        if (!title) { showToast('제목을 입력하세요.', 'warning'); return null; }
        return { title, text: $('#edit_content').value, published: $('#edit_published').checked, imageFile: null };
      }
    },
    events: {
      title: '이벤트 수정',
      hasImage: false,
      formHtml: `
        <div class="form-group"><label>제목</label><input type="text" class="form-control" id="edit_title" value="${item.title || ''}"></div>
        <div class="form-group"><label>글쓴이</label><input type="text" class="form-control" id="edit_author" value="${item.author || ''}"></div>
        <div class="form-group"><label>본문</label><textarea class="form-control" id="edit_content" rows="8">${item.content || ''}</textarea></div>
        <div class="form-check"><input type="checkbox" id="edit_published" ${item.published ? 'checked' : ''}><label>노출</label></div>
      `,
      getData: () => {
        const title = $('#edit_title').value;
        if (!title) { showToast('제목을 입력하세요.', 'warning'); return null; }
        return { title, author: $('#edit_author').value, content: $('#edit_content').value, published: $('#edit_published').checked, imageFile: null };
      }
    },
    notices: {
      title: '공지사항 수정',
      hasImage: false,
      formHtml: `
        <div class="form-group"><label>제목</label><input type="text" class="form-control" id="edit_title" value="${item.title || ''}"></div>
        <div class="form-group"><label>글쓴이</label><input type="text" class="form-control" id="edit_author" value="관리자" readonly></div>
        <div class="form-group"><label>본문</label><textarea class="form-control" id="edit_content" rows="8">${item.content || ''}</textarea></div>
        <div class="form-check"><input type="checkbox" id="edit_published" ${item.visible !== false ? 'checked' : ''}><label>노출</label></div>
      `,
      getData: () => {
        const title = $('#edit_title').value;
        if (!title) { showToast('제목을 입력하세요.', 'warning'); return null; }
        return { title, author: '관리자', content: $('#edit_content').value, visible: $('#edit_published').checked, imageFile: null };
      }
    }
  };
  return configs[collection] || null;
}

// ===== Generic List Page Renderers =====
function renderBannersPage(container) { createListPage(container, { title: '메인 배너 관리', collection: 'banners', columns: getPageColumns('banners'), filters: null, hasAdd: true, hasSaveBar: true }); }
function renderCharactersPage(container) { createListPage(container, { title: '캐릭터 관리', collection: 'characters', columns: getPageColumns('characters'), filters: getPageFilterConfig('characters')?.filters, hasAdd: true, hasSaveBar: true }); }
function renderSupportCharactersPage(container) { createListPage(container, { title: '현질 서폿 캐릭터 관리', collection: 'supportCharacters', columns: getPageColumns('supportCharacters'), filters: getPageFilterConfig('supportCharacters')?.filters, hasAdd: true, hasSaveBar: true }); }
function renderPvPPatchPage(container) { createListPage(container, { title: 'PvP 패치 관리', collection: 'pvpPatch', columns: getPageColumns('pvpPatch'), filters: getPageFilterConfig('pvpPatch')?.filters, hasAdd: true, hasSaveBar: true }); }
function renderPatchNotesPage(container) { createListPage(container, { title: '패치노트 관리', collection: 'patchNotes', columns: getPageColumns('patchNotes'), filters: null, hasAdd: true, hasSaveBar: true }); }
function renderBoardsPage(container) {
  createListPage(container, {
    title: '게시판 관리',
    collection: 'boards',
    columns: getPageColumns('boards'),
    filters: getPageFilterConfig('boards')?.filters,
    hasAdd: true,
    hasSaveBar: true
  });
}
function renderEventsPage(container) { createListPage(container, { title: '이벤트 관리', collection: 'events', columns: getPageColumns('events'), filters: null, hasAdd: true, hasSaveBar: true }); }
function renderNoticesPage(container) { createListPage(container, { title: '공지사항 관리', collection: 'notices', columns: getPageColumns('notices'), filters: null, hasAdd: true, hasSaveBar: true }); }

// ===== Sidebar & UI Controls =====
function toggleSidebar() {
  const sidebar = $('#sidebar');
  const expandBtn = $('#sidebarExpandBtn');
  const collapseBtn = $('#sidebarCollapseBtn');
  sidebar.classList.toggle('collapsed');
  AppState.sidebarCollapsed = sidebar.classList.contains('collapsed');
  document.body.classList.toggle('sidebar-collapsed', AppState.sidebarCollapsed);

  if (expandBtn) expandBtn.style.display = 'none';
  if (collapseBtn) {
    collapseBtn.title = AppState.sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기';
  }
}

function expandSidebar() {
  const sidebar = $('#sidebar');
  sidebar.classList.remove('collapsed');
  AppState.sidebarCollapsed = false;
  document.body.classList.remove('sidebar-collapsed');
  const expandBtn = $('#sidebarExpandBtn');
  const collapseBtn = $('#sidebarCollapseBtn');
  if (expandBtn) expandBtn.style.display = 'none';
  if (collapseBtn) collapseBtn.title = '사이드바 접기';
}

function openMobileMenu() {
  $('#mobileMenuOverlay').style.display = 'block';
}

function closeMobileMenu() {
  $('#mobileMenuOverlay').style.display = 'none';
}

function cleanupListeners() {
  AppState.listeners.forEach(unsub => { try { unsub(); } catch(e) {} });
  AppState.listeners = [];
}

// ===== Event Listeners =====
document.addEventListener('DOMContentLoaded', () => {
  // Login
  $('#loginBtn').addEventListener('click', handleLogin);
  $('#loginEmail').addEventListener('keyup', (e) => { if (e.key === 'Enter') handleLogin(); });
  if ($('#loginPassword')) {
    $('#loginPassword').addEventListener('keyup', (e) => { if (e.key === 'Enter') handleLogin(); });
  }
  
  // Google Login
  const googleLoginBtn = $('#googleLoginBtn');
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', handleGoogleLogin);
  }
  
  // Sidebar
  $('#sidebarCollapseBtn').addEventListener('click', toggleSidebar);
  $('#sidebarExpandBtn').addEventListener('click', expandSidebar);
  
  // Navigation
  $$('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (page) navigateTo(page);
    });
  });
  
  // Mobile menu
  $('#hamburgerBtn').addEventListener('click', openMobileMenu);
  $('#mobileMenuCloseBtn').addEventListener('click', closeMobileMenu);
  $('#mobileMenuOverlay').addEventListener('click', (e) => {
    if (e.target === $('#mobileMenuOverlay')) closeMobileMenu();
  });
  
  // Logout
  $('#sidebarLogoutBtn').addEventListener('click', handleLogout);
  $('#mobileLogoutBtn').addEventListener('click', handleLogout);
  
  // User page links
  const userPageUrl = 'https://kimnatsu.github.io/STGFPPatch_V2/ko/Main.html#home';
  $('#viewUserPageBtn').addEventListener('click', () => window.open(userPageUrl, '_blank'));
  $('#userPageLink').addEventListener('click', () => window.open(userPageUrl, '_blank'));
  $('#mobileUserPageLink').addEventListener('click', () => window.open(userPageUrl, '_blank'));
  
  // Modal overlay click to close
  $('#modalOverlay').addEventListener('click', (e) => {
    if (e.target === $('#modalOverlay')) closeModal();
  });
  
  // Before unload warning
  window.addEventListener('beforeunload', (e) => {
    if (AppState.hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
});
