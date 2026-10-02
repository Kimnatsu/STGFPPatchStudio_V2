// ============================================================
// COMMUNITY BOARD POSTS
// ============================================================

let allBoardPosts = [];
let filteredBoardPosts = [];
let boardCurrentPage = 1;
let boardPageSize = 10;
let boardEditDocId = null;
let boardAdminUidSet = new Set();
let boardAdminUidPromise = null;

const BOARD_CATEGORY_DEFAULTS = ['자유', '정보', '질문', '자랑'];

function getBoardCategory(post) {
  return String(post?.prefix || post?.category || '').trim();
}

function isBoardVisible(post) {
  return post?.visible !== false && post?.published !== false;
}

function boardSortTime(post) {
  const value = post?.createdAt || post?.date || post?.updatedAt;
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getBoardCategories() {
  const categories = new Set(BOARD_CATEGORY_DEFAULTS);
  allBoardPosts.forEach(post => {
    const category = getBoardCategory(post);
    if (category) categories.add(category);
  });
  return [...categories].sort((a, b) => {
    const aIndex = BOARD_CATEGORY_DEFAULTS.indexOf(a);
    const bIndex = BOARD_CATEGORY_DEFAULTS.indexOf(b);
    if (aIndex !== -1 || bIndex !== -1) {
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    }
    return a.localeCompare(b, 'ko');
  });
}

function populateBoardCategoryControls() {
  const categories = getBoardCategories();
  const filter = document.getElementById('boardCategoryFilter');
  const form = document.getElementById('boardFieldCategory');

  if (filter) {
    const selected = filter.value || 'all';
    filter.innerHTML = '<option value="all">전체 카테고리</option>' +
      categories.map(category => `<option value="${escHtml(category)}">${escHtml(category)}</option>`).join('');
    filter.value = categories.includes(selected) ? selected : 'all';
  }

  if (form) {
    const selected = form.value;
    form.innerHTML = categories.map(category =>
      `<option value="${escHtml(category)}">${escHtml(category)}</option>`
    ).join('');
    form.value = categories.includes(selected) ? selected : (categories[0] || '');
  }
}

async function loadBoardAdminUids() {
  if (boardAdminUidPromise) return boardAdminUidPromise;

  boardAdminUidPromise = (async () => {
    const emails = [...new Set([
      ...(Array.isArray(ADMIN_EMAILS) ? ADMIN_EMAILS : []),
      ...Object.keys(_adminNicknameMap || {}),
      currentUser?.email || '',
    ].map(email => String(email || '').trim().toLowerCase()).filter(Boolean))];
    const uidSet = new Set();

    if (currentUser?.uid) uidSet.add(currentUser.uid);

    await Promise.all(emails.map(async email => {
      try {
        const snap = await db.collection('users').where('email', '==', email).get();
        snap.forEach(doc => uidSet.add(doc.id));
      } catch (_) {
        // Optional lookup: the known admin emails and current session still work.
      }
    }));

    boardAdminUidSet = uidSet;
    return uidSet;
  })();

  return boardAdminUidPromise;
}

function isBoardAdminAuthor(post) {
  const adminEmails = new Set((Array.isArray(ADMIN_EMAILS) ? ADMIN_EMAILS : [])
    .map(email => String(email || '').trim().toLowerCase()));
  const identityValues = [
    post?.authorId, post?.authorUid, post?.uid, post?.writerId, post?.authorEmail,
    post?.adminEmail, post?.email, post?.author, post?.writer,
  ].map(value => String(value || '').trim()).filter(Boolean);

  if (identityValues.some(value =>
    boardAdminUidSet.has(value) || adminEmails.has(value.toLowerCase())
  )) return true;

  return identityValues.some(value => value.toLowerCase() === '관리자');
}

function boardAuthorLabel(post) {
  if (isBoardAdminAuthor(post)) return '관리자';
  return post?.author || post?.writer || post?.nickname || post?.authorName ||
    post?.uid || post?.authorId || '—';
}

function boardAdminLabel(post) {
  const label = [
    post?.updatedBy, post?.adminEmail, post?.createdByEmail, post?.createdBy,
  ].find(value => typeof value === 'string' && value.trim());
  return resolveAdminLabel(label || '');
}

async function loadBoards() {
  const tbody = document.getElementById('boardTableBody');
  showTableLoading(tbody, 7);

  try {
    const [snap] = await Promise.all([
      db.collection('boards').get(),
      loadBoardAdminUids(),
    ]);
    allBoardPosts = snap.docs.map(doc => ({ _docId: doc.id, ...doc.data() }));
    boardCurrentPage = 1;
    populateBoardCategoryControls();
    filterBoardTable();
  } catch (err) {
    showTableError(tbody, `<tr><td colspan="7" class="table-empty">로드 실패: ${escHtml(err.message)}</td></tr>`);
    showToast('게시판 글 로드 실패', 'error');
  }
}

function filterBoardTable() {
  const query = (document.getElementById('boardSearch')?.value || '').trim().toLowerCase();
  const category = document.getElementById('boardCategoryFilter')?.value || 'all';

  const list = allBoardPosts.filter(post => {
    if (category !== 'all' && getBoardCategory(post) !== category) return false;
    if (!query) return true;

    const searchable = [
      post?.title, post?.text, post?.content, boardAuthorLabel(post),
      post?.authorId, post?.uid, post?._docId,
    ].map(value => String(value || '')).join(' ').toLowerCase();
    return searchable.includes(query);
  }).sort((a, b) => boardSortTime(b) - boardSortTime(a));

  boardCurrentPage = 1;
  renderBoardTable(list);
}

function renderBoardTable(list) {
  filteredBoardPosts = list;
  const tbody = document.getElementById('boardTableBody');
  const count = document.getElementById('boardCountLabel');
  if (count) {
    count.textContent = list.length === allBoardPosts.length
      ? `총 ${list.length}건`
      : `총 ${allBoardPosts.length}건 중 ${list.length}건`;
  }

  const totalPages = Math.max(1, Math.ceil(list.length / boardPageSize));
  if (boardCurrentPage > totalPages) boardCurrentPage = totalPages;
  const start = (boardCurrentPage - 1) * boardPageSize;
  const shown = list.slice(start, start + boardPageSize);

  if (!list.length) {
    setTableBodyHtml(tbody, '<tr><td colspan="7" class="table-empty">게시글이 없습니다</td></tr>');
    renderPaginator('boardPaginator', 0, boardPageSize, boardCurrentPage, () => {});
    return;
  }

  const rowsHtml = shown.map(post => {
    const docId = String(post._docId || '');
    const postId = post.id ?? post.postId ?? docId;
    const category = getBoardCategory(post);
    const title = post.title || '(제목 없음)';
    const visible = isBoardVisible(post);
    const author = boardAuthorLabel(post);

    return `
      <tr>
        <td class="cell-id">${escHtml(String(postId))}</td>
        <td><span class="board-category-badge">${escHtml(category || '—')}</span></td>
        <td class="cell-name board-title-cell">${escHtml(title)}</td>
        <td>${escHtml(String(author))}</td>
        <td><span class="${visible ? 'badge-visible-on' : 'badge-visible-off'}">${visible ? 'ON' : 'OFF'}</span></td>
        <td><span class="admin-email-cell">${escHtml(boardAdminLabel(post))}</span></td>
        <td>
          <div class="cell-actions">
            ${canEditIn('boards') ? `<button class="btn-edit" data-docid="${escHtml(docId)}" onclick="openBoardForm(this.dataset.docid)">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              수정
            </button>` : ''}
            ${canDeleteIn('boards') ? `<button class="btn-delete" data-docid="${escHtml(docId)}" data-title="${escHtml(title)}" onclick="deleteBoard(this.dataset.docid, this.dataset.title)">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              삭제
            </button>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  setTableBodyHtml(tbody, rowsHtml);
  renderPaginator('boardPaginator', list.length, boardPageSize, boardCurrentPage, page => {
    boardCurrentPage = page;
    renderBoardTable(filteredBoardPosts);
  });
}

function openBoardForm(docId = '') {
  const isEditing = !!docId;
  if (isEditing && !canEditIn('boards')) {
    showToast('게시글 수정 권한이 없습니다.', 'error');
    return;
  }
  if (!isEditing && !canAddIn('boards')) {
    showToast('게시글 작성 권한이 없습니다.', 'error');
    return;
  }

  boardEditDocId = docId || null;
  const post = isEditing ? allBoardPosts.find(item => item._docId === docId) : null;
  if (isEditing && !post) {
    showToast('게시글 정보를 찾을 수 없습니다. 목록을 새로고침해 주세요.', 'error');
    return;
  }

  document.getElementById('boardFormTitle').textContent = isEditing ? '게시글 수정' : '게시글 작성';
  document.getElementById('boardSubmitBtnText').textContent = isEditing ? '저장' : '등록';
  document.getElementById('boardFieldCategory').value = getBoardCategory(post || {}) || BOARD_CATEGORY_DEFAULTS[0];
  document.getElementById('boardFieldTitle').value = post?.title || '';
  document.getElementById('boardFieldContent').value = post?.text || post?.content || '';
  document.getElementById('boardFormError').style.display = 'none';
  document.getElementById('boardFormSubmit').disabled = false;
  document.getElementById('boardSubmitSpinner').style.display = 'none';
  document.getElementById('boardFormOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('boardFieldTitle').focus();
}

function closeBoardForm() {
  document.getElementById('boardFormOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
  boardEditDocId = null;
}

function setBoardFormError(message) {
  const error = document.getElementById('boardFormError');
  error.textContent = message;
  error.style.display = '';
}

async function saveBoardPost() {
  const title = document.getElementById('boardFieldTitle').value.trim();
  const content = document.getElementById('boardFieldContent').value.trim();
  const category = document.getElementById('boardFieldCategory').value.trim() || BOARD_CATEGORY_DEFAULTS[0];
  const isEditing = !!boardEditDocId;

  if (!title) {
    setBoardFormError('제목을 입력해 주세요.');
    document.getElementById('boardFieldTitle').focus();
    return;
  }
  if (isEditing ? !canEditIn('boards') : !canAddIn('boards')) {
    setBoardFormError(isEditing ? '게시글 수정 권한이 없습니다.' : '게시글 작성 권한이 없습니다.');
    return;
  }
  if (!currentUser) {
    setBoardFormError('로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.');
    return;
  }

  const existing = isEditing ? allBoardPosts.find(item => item._docId === boardEditDocId) : null;
  if (isEditing && !existing) {
    setBoardFormError('게시글을 찾을 수 없습니다. 목록을 새로고침해 주세요.');
    return;
  }

  const visible = existing ? isBoardVisible(existing) : true;
  const timestamp = nowTS();
  const data = {
    title,
    text: content,
    content,
    prefix: category,
    category,
    visible,
    published: visible,
    updatedAt: timestamp,
    updatedBy: currentUser.email || getCurrentUserLabel() || '관리자',
  };

  if (!existing) {
    data.author = '관리자';
    data.writer = '관리자';
    data.nickname = '관리자';
    data.authorId = currentUser.uid;
    data.uid = currentUser.uid;
    data.createdAt = timestamp;
    data.date = new Date().toISOString().slice(0, 10);
  }

  const submit = document.getElementById('boardFormSubmit');
  submit.disabled = true;
  document.getElementById('boardSubmitSpinner').style.display = 'inline-block';
  document.getElementById('boardFormError').style.display = 'none';

  try {
    const write = existing
      ? db.collection('boards').doc(boardEditDocId).set(data, { merge: true })
      : db.collection('boards').add(data);
    await firestoreWrite(write);
    closeBoardForm();
    showToast(isEditing ? '게시글을 수정했습니다.' : '게시글을 등록했습니다.');
    await loadBoards();
  } catch (err) {
    setBoardFormError(`저장 실패: ${err.message}`);
    submit.disabled = false;
    document.getElementById('boardSubmitSpinner').style.display = 'none';
  }
}

function deleteBoard(docId, title) {
  if (!canDeleteIn('boards')) {
    showToast('게시글 삭제 권한이 없습니다.', 'error');
    return;
  }
  openDeleteModal('게시글 삭제', `"${title}" 게시글을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`, async () => {
    await firestoreWrite(db.collection('boards').doc(docId).delete());
    showToast('게시글을 삭제했습니다.');
    await loadBoards();
  });
}

document.getElementById('boardSearch')?.addEventListener('input', filterBoardTable);
document.getElementById('boardCategoryFilter')?.addEventListener('change', filterBoardTable);
document.getElementById('boardPerPage')?.addEventListener('change', event => {
  boardPageSize = Number(event.target.value) || 10;
  boardCurrentPage = 1;
  renderBoardTable(filteredBoardPosts);
});
document.getElementById('btnAddBoard')?.addEventListener('click', () => openBoardForm());
document.getElementById('boardFormSubmit')?.addEventListener('click', saveBoardPost);
document.getElementById('boardFormClose')?.addEventListener('click', closeBoardForm);
document.getElementById('boardFormCancel')?.addEventListener('click', closeBoardForm);
document.getElementById('boardFormOverlay')?.addEventListener('click', event => {
  if (event.target.id === 'boardFormOverlay') closeBoardForm();
});
document.getElementById('boardFieldTitle')?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    document.getElementById('boardFieldContent').focus();
  }
});