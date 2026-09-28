// ===== Detailed administration forms =====
// The list pages stay on FPPStudio's shared renderer. This module brings over
// the detailed add/edit behavior while keeping the current site's UI system.
(function registerAdminFormEnhancements() {
  'use strict';

  const richTextCollections = new Set(['patchNotes', 'events', 'notices']);
  let activeForm = null;

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function value(collection, item, ...keys) {
    for (const key of keys) {
      if (item && item[key] !== undefined && item[key] !== null && item[key] !== '') {
        return item[key];
      }
    }
    return collection === 'characters' || collection === 'supportCharacters'
      ? item?.characterId ?? item?.id ?? ''
      : '';
  }

  function checked(condition) {
    return condition ? 'checked' : '';
  }

  function selected(actual, expected) {
    return String(actual ?? '') === String(expected ?? '') ? 'selected' : '';
  }

  function dateString(input) {
    if (!input) return '';
    if (typeof input === 'string') return input.slice(0, 10);
    if (typeof input.toDate === 'function') return input.toDate().toISOString().slice(0, 10);
    if (typeof input.seconds === 'number') return new Date(input.seconds * 1000).toISOString().slice(0, 10);
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

  function getItem(collection, id) {
    return AppState.pageStates[collection]?.data?.find(item => String(item.id) === String(id));
  }

  function modalField(label, input, hint = '') {
    return `
      <div class="form-group">
        <label class="form-label">${label}</label>
        ${input}
        ${hint ? `<span class="form-hint">${hint}</span>` : ''}
      </div>
    `;
  }

  function selectField(id, options, current = '') {
    return `<select id="${id}" class="form-input">${options.map(option => `
      <option value="${esc(option.value)}" ${selected(current, option.value)}>${esc(option.label)}</option>
    `).join('')}</select>`;
  }

  function imageField(collection, item = null, { required = true, hint = '' } = {}) {
    const imageUrl = getStoredImageUrl(collection, item) || '';
    const isBanner = collection === 'banners';
    const isEvent = collection === 'events';
    const sizeHint = isBanner
      ? '권장 사이즈 : 1472×420 px · 최대 3 MB · jpg, png, gif'
      : isEvent
        ? '권장 비율 : 16:9 · 최대 10 MB · jpg, png, webp, gif'
        : '권장 사이즈 : 500×500 px · 최대 10 MB · jpg, png, webp, gif';
    return `
      <div class="form-group original-image-group">
        <label class="form-label">이미지 ${required ? '<span class="required">*</span>' : '<span class="form-label-optional">(선택)</span>'}</label>
        <div class="original-image-upload">
          <div class="image-upload ${isBanner ? 'banner-image-upload' : ''} ${imageUrl ? 'has-image' : ''}" id="imageUpload_${collection}" aria-label="이미지 업로드">
            ${imageUrl ? `<img src="${esc(imageUrl)}" class="image-preview" alt="">` : '<i class="fas fa-plus"></i>'}
          </div>
          <div class="original-image-info">
            <p>${sizeHint}</p>
            ${hint ? `<p>${esc(hint)}</p>` : ''}
            <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('imageUpload_${collection}').click()">
              <i class="fas fa-upload"></i> 업로드
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function visibilityField(scope, isVisible = true, { pinned = false } = {}) {
    return `
      <div class="original-inline-fields">
        <label class="original-check"><input type="checkbox" id="${scope}_published" ${checked(isVisible)}><span>노출 (ON)</span></label>
        ${pinned ? `<label class="original-check"><input type="checkbox" id="${scope}_pinned"><span>상단 고정</span></label>` : ''}
      </div>
    `;
  }

  function characterEntries(scope, item = {}, supportOnly = false) {
    const skills = supportOnly ? [] : (Array.isArray(item.skills) ? item.skills : []);
    const supportSkills = Array.isArray(item.supportSkills) ? item.supportSkills : [];
    const tips = Array.isArray(item.tips || item.adminTips) ? (item.tips || item.adminTips) : [];
    const skillRows = skills.map((entry, index) => characterEntry(scope, 'skills', entry, index)).join('');
    const supportRows = supportSkills.map((entry, index) => characterEntry(scope, 'supportSkills', entry, index)).join('');
    const tipRows = tips.map((entry, index) => characterEntry(scope, 'tips', entry, index)).join('');
    const skillsSection = supportOnly ? '' : `
      <div class="original-form-section">
        <div class="original-section-header">
          <div class="original-section-title"><i class="fas fa-bolt"></i> 스킬 목록</div>
          <div class="original-section-actions">
            <label class="original-check"><input type="checkbox" id="${scope}_defaultSkills" onchange="toggleCharacterDefaultSkills('${scope}')"><span>기본 세트</span></label>
            <button type="button" class="btn btn-secondary btn-sm" id="${scope}_addDefaultSkills" onclick="addCharacterDefaultSkills('${scope}')" disabled>스킬 추가</button>
          </div>
        </div>
        <div class="character-entry-list" id="${scope}_skillsList">${skillRows}</div>
      </div>
    `;
    return `${skillsSection}
      <div class="original-form-section">
        <div class="original-section-header">
          <div class="original-section-title"><i class="fas fa-hands-helping"></i> 서포트 스킬 목록</div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addCharacterEntry('${scope}','supportSkills')">+ 스킬 추가</button>
        </div>
        <div class="character-entry-list" id="${scope}_supportSkillsList">${supportRows}</div>
      </div>
      <div class="original-form-section">
        <div class="original-section-header">
          <div class="original-section-title"><i class="fas fa-lightbulb"></i> 꿀팁</div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addCharacterEntry('${scope}','tips')">+ 꿀팁 추가</button>
        </div>
        <div class="character-entry-list" id="${scope}_tipsList">${tipRows}</div>
      </div>
    `;
  }

  function characterEntry(scope, section, item = {}, index = 0) {
    const id = `${scope}_${section}_${index}`;
    const isTip = section === 'tips';
    const type = item.type || 'custom';
    const skillLabels = {
      skill1: '스킬 1', skill2: '스킬 2', skill3: '스킬 3 (필살기)',
      skill4: '스킬 4 (궁극기)', cardSkill1: '카드 스킬 1', cardSkill2: '카드 스킬 2'
    };
    return `
      <div class="character-entry" data-character-entry="${section}" data-entry-type="${esc(type)}">
        <div class="character-entry-header">
          <strong>${isTip ? '꿀팁' : section === 'skills' ? (skillLabels[type] || '스킬') : '서포트 스킬'}</strong>
          ${isTip ? '<span class="character-entry-author">작성자: 관리자</span>' : ''}
          <button type="button" class="character-entry-remove" onclick="removeCharacterEntry('${id}')"><i class="fas fa-trash-alt"></i></button>
        </div>
        ${isTip
          ? `<textarea class="form-input character-entry-text" id="${id}_text" maxlength="300" placeholder="캐릭터 꿀팁을 입력하세요">${esc(item.text || item.content || '')}</textarea>`
          : `<input type="text" class="form-input character-entry-name" id="${id}_name" value="${esc(item.name || '')}" placeholder="${section === 'skills' ? '스킬 이름' : '서포트 스킬 이름'}">
             <textarea class="form-input character-entry-description" id="${id}_desc" maxlength="1000" placeholder="스킬 설명">${esc(item.desc || item.description || '')}</textarea>`}
      </div>
    `;
  }

  function pvpCharacterOptions(collection, current = '') {
    const rows = AppState.pageStates[collection]?.data || [];
    return rows.map(item => {
      const id = item.characterId ?? item.id;
      return `<option value="${esc(id)}" ${selected(current, id)}>${esc(id)} · ${esc(item.name || '이름 없음')}</option>`;
    }).join('');
  }

  async function ensurePvpOptionData() {
    for (const collection of ['characters', 'supportCharacters']) {
      const state = AppState.pageStates[collection];
      if (state?.data?.length) continue;
      try {
        const snapshot = await db.collection(collection).get();
        const data = [];
        snapshot.forEach(doc => {
          const source = doc.data() || {};
          data.push({
            ...source,
            id: doc.id,
            characterId: source.id ?? source.num ?? source.no ?? source.characterId ?? doc.id
          });
        });
        AppState.pageStates[collection] = {
          ...(state || {}),
          data,
          filteredData: data,
          loading: false,
          selectedIds: state?.selectedIds || new Set()
        };
      } catch (error) {
        console.warn(`${collection} 목록을 불러오지 못했습니다.`, error);
      }
    }
  }

  function pvpPatchRows(items = []) {
    const list = Array.isArray(items) && items.length ? items : [{ type: '', text: '' }];
    return list.map((patch, index) => `
      <div class="character-entry pvp-entry" data-pvp-entry>
        <div class="character-entry-header">
          <strong>패치 항목 ${index + 1}</strong>
          <button type="button" class="character-entry-remove" onclick="this.closest('[data-pvp-entry]').remove()"><i class="fas fa-trash-alt"></i></button>
        </div>
        <div class="pvp-entry-fields">
          ${selectField(`pvp_patch_type_${index}`, [
            { value: '', label: '타입 선택' },
            { value: 'buff', label: '▲ 버프' },
            { value: 'nerf', label: '▼ 너프' },
            { value: 'fix', label: '✦ 기능 수정' }
          ], normalizePvpTypeValue(patch.type))}
          <input type="text" class="form-input pvp-patch-text" value="${esc(patch.text || '')}" placeholder="패치 내용을 입력하세요">
        </div>
      </div>
    `).join('');
  }

  function normalizePvpTypeValue(type) {
    const normalized = normalizePvpType(type);
    return { '버프': 'buff', '너프': 'nerf', '기능 수정': 'fix' }[normalized] || String(type || '');
  }

  function formHtml(collection, item, mode) {
    const scope = mode === 'add' ? 'add' : 'edit';
    const isEdit = mode === 'edit';
    const currentVisible = item ? (item.visible ?? item.published ?? true) : true;
    const idField = item ? modalField('ID', `<input class="form-input" value="${esc(item.id)}" readonly>`) : '';

    if (collection === 'banners') {
      return `<div class="original-form">${idField}
        ${modalField('제목 <span class="required">*</span>', `<input class="form-input" id="${scope}_title" maxlength="50" value="${esc(item?.title || '')}" placeholder="배너 제목">`)}
        ${imageField('banners', item, { required: true })}
        ${modalField('활성화 상태', `<div class="original-radio-group">
          <label><input type="radio" name="${scope}_active" value="false" ${checked(item?.isActive !== true)}><span>OFF</span></label>
          <label><input type="radio" name="${scope}_active" value="true" ${checked(item?.isActive === true)}><span>ON</span></label>
        </div>`)}
        ${getBannerClickActionFormHtml(scope)}
      </div>`;
    }

    if (collection === 'characters') {
      const attribute = value(collection, item, 'attribute', 'attr');
      const type = value(collection, item, 'type', 'battleType');
      return `<div class="original-form">${idField}
        ${modalField('캐릭터 이름 <span class="required">*</span>', `<input class="form-input" id="${scope}_name" maxlength="20" value="${esc(item?.name || '')}" placeholder="캐릭터 이름">`)}
        <div class="original-form-grid">${modalField('등급', selectField(`${scope}_grade`, ['특전', 'SS', 'S', 'A', 'B', 'C'].map(v => ({ value: v, label: v })), value(collection, item, 'grade', 'tier', 'rank')))}
        ${modalField('속성', selectField(`${scope}_attribute`, [{ value: '力', label: '힘 (力)' }, { value: '技', label: '기 (技)' }, { value: '心', label: '심 (心)' }], attribute))}</div>
        ${modalField('타입', selectField(`${scope}_type`, [{ value: '격투', label: '격투' }, { value: '검술', label: '검술' }, { value: '원소', label: '원소' }, { value: '특수', label: '특수' }], type))}
        ${imageField('characters', item, { required: !isEdit, hint: '정사각형 비율로 자른 뒤 저장됩니다.' })}
        ${characterEntries(scope, item)}
        ${visibilityField(scope, currentVisible)}
      </div>`;
    }

    if (collection === 'supportCharacters') {
      return `<div class="original-form">${idField}
        ${modalField('캐릭터 이름 <span class="required">*</span>', `<input class="form-input" id="${scope}_name" value="${esc(item?.name || '')}" placeholder="캐릭터 이름">`)}
        ${modalField('등급', selectField(`${scope}_grade`, ['특전', 'SS', 'S', 'A', 'B', 'C'].map(v => ({ value: v, label: v })), value(collection, item, 'grade', 'tier', 'rank')))}
        ${imageField('supportCharacters', item, { required: !isEdit, hint: '정사각형 비율로 자른 뒤 저장됩니다.' })}
        ${characterEntries(scope, item, true)}
        ${visibilityField(scope, currentVisible)}
      </div>`;
    }

    if (collection === 'pvpPatch') {
      const patches = item?.patches || [];
      return `<div class="original-form">
        <div class="original-form-section"><div class="original-section-title"><i class="fas fa-calendar-alt"></i> 패치 날짜</div>
          <input type="date" class="form-input compact-input" id="${scope}_patchDate" value="${esc(dateString(item?.patchDate || item?.date || ''))}">
          <span class="form-hint">미입력 시 현재 날짜로 저장됩니다.</span>
        </div>
        <div class="original-form-section"><div class="original-section-title"><i class="fas fa-user"></i> 대상 캐릭터</div>
          <div class="original-form-grid">
            ${modalField('캐릭터', `<select class="form-input" id="${scope}_charId"><option value="">캐릭터 선택</option>${pvpCharacterOptions('characters', item?.charId)}</select>`)}
            ${modalField('현질 서폿 캐릭터', `<select class="form-input" id="${scope}_supportCharId"><option value="">서폿 캐릭터 선택</option>${pvpCharacterOptions('supportCharacters', item?.supportCharId)}</select>`)}
          </div>
          <span class="form-hint">캐릭터 또는 서폿 캐릭터 중 하나를 선택하세요.</span>
        </div>
        <div class="original-form-section"><div class="original-section-header"><div class="original-section-title"><i class="fas fa-list"></i> 패치 항목</div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addPvpPatchEntry('${scope}')">+ 항목 추가</button></div>
          <div class="character-entry-list" id="${scope}_pvpEntries">${pvpPatchRows(patches)}</div>
        </div>
        ${visibilityField(scope, currentVisible)}
      </div>`;
    }

    if (collection === 'patchNotes' || collection === 'notices') {
      const title = collection === 'patchNotes' ? '패치노트' : '공지사항';
      return `<div class="original-form">
        ${modalField('제목 <span class="required">*</span>', `<input class="form-input" id="${scope}_title" maxlength="200" value="${esc(item?.title || '')}" placeholder="${title} 제목">`)}
        <div class="form-group"><label class="form-label">본문 <span class="required">*</span></label>
          <textarea class="form-input original-editor" id="${scope}_content">${item?.content || ''}</textarea></div>
        ${visibilityField(scope, currentVisible, { pinned: collection === 'notices' })}
      </div>`;
    }

    if (collection === 'events') {
      return `<div class="original-form">
        <div class="original-form-section"><div class="original-section-title"><i class="fas fa-calendar-alt"></i> 이벤트 정보</div>
          <div class="original-form-grid">${modalField('시작일 <span class="required">*</span>', `<input type="date" class="form-input" id="${scope}_startDate" value="${esc(dateString(item?.startDate || item?.date || item?.createdAt))}">`)}
          ${modalField('종료일', `<input type="date" class="form-input" id="${scope}_endDate" value="${esc(dateString(item?.endDate))}">`)}</div>
          ${modalField('제목 <span class="required">*</span>', `<input class="form-input" id="${scope}_title" maxlength="200" value="${esc(item?.title || '')}" placeholder="이벤트 제목">`)}
          ${imageField('events', item, { required: false, hint: '카드 이미지로 사용됩니다.' })}
        </div>
        <div class="form-group"><label class="form-label">본문 <span class="required">*</span></label>
          <textarea class="form-input original-editor" id="${scope}_content">${item?.content || item?.text || ''}</textarea></div>
        ${visibilityField(scope, currentVisible)}
      </div>`;
    }

    if (collection === 'boards') {
      return `<div class="original-form">
        ${modalField('제목 <span class="required">*</span>', `<input class="form-input" id="${scope}_title" maxlength="200" value="${esc(item?.title || '')}" placeholder="게시글 제목">`)}
        ${modalField('카테고리', selectField(`${scope}_category`, ['', '자유', '정보', '질문', '자랑'].map(v => ({ value: v, label: v || '카테고리 선택' })), item?.category || ''))}
        <div class="form-group"><label class="form-label">본문</label>
          <textarea class="form-input original-editor" id="${scope}_content">${esc(item?.text || item?.content || '')}</textarea></div>
        ${visibilityField(scope, item ? item.published !== false : true)}
      </div>`;
    }

    return '';
  }

  function formConfig(collection, item, mode) {
    const scope = mode === 'add' ? 'add' : 'edit';
    return {
      title: `${mode === 'add' ? '추가' : '수정'} · ${PAGE_CONFIG[collection]?.title || collection}`,
      formHtml: formHtml(collection, item, mode),
      hasImage: ['banners', 'characters', 'supportCharacters', 'events'].includes(collection),
      scope
    };
  }

  function initEditor(scope, collection) {
    if (!richTextCollections.has(collection) && collection !== 'boards') return;
    if (!window.jQuery || !jQuery.fn?.summernote) return;
    const editor = jQuery(`#${scope}_content`);
    if (!editor.length || editor.next('.note-editor').length) return;
    editor.summernote({
      lang: 'ko-KR',
      height: collection === 'boards' ? 220 : 300,
      placeholder: '본문을 입력하세요...',
      fontSizes: ['11', '13', '15', '16', '19', '24', '28'],
      toolbar: [
        ['style', ['bold', 'italic', 'underline', 'strikethrough', 'clear']],
        ['font', ['fontsize', 'color']],
        ['para', ['ul', 'ol', 'paragraph']],
        ['table', ['table']],
        ['insert', ['link', 'picture']],
        ['view', ['fullscreen', 'codeview']]
      ],
      callbacks: {
        onImageUpload: async files => {
          for (const file of files) {
            try {
              const url = await uploadImage(file, collection);
              editor.summernote('insertImage', url, file.name || '이미지');
            } catch (error) {
              showToast('본문 이미지 업로드 실패: ' + error.message, 'error');
            }
          }
        }
      }
    });
  }

  function getEditorValue(scope, collection) {
    if ((richTextCollections.has(collection) || collection === 'boards')
      && window.jQuery && jQuery.fn?.summernote
      && jQuery(`#${scope}_content`).next('.note-editor').length) {
      return jQuery(`#${scope}_content`).summernote('code') || '';
    }
    return $(`#${scope}_content`)?.value || '';
  }

  async function setupDetailedForm(collection, item, mode) {
    if (collection === 'pvpPatch') await ensurePvpOptionData();
    const config = formConfig(collection, item, mode);
    showModal(config.title, config.formHtml, `
      <button class="btn btn-secondary" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="submitDetailedAdminForm('${collection}','${mode}',${item ? `'${esc(item.id)}'` : 'null'})">
        <i class="fas fa-save"></i> ${mode === 'add' ? '추가' : '수정'}
      </button>
    `);
    $('#modalContainer')?.classList.add('original-modal-container');
    activeForm = { collection, item, mode, scope: config.scope };
    if (config.hasImage) setupImageUpload(collection, getStoredImageUrl(collection, item));
    if (collection === 'banners') initializeBannerClickActionFields(config.scope, item || {});
    if (collection === 'characters' || collection === 'supportCharacters') {
      initializeCharacterDetailFields(config.scope, item || {});
    }
    initEditor(config.scope, collection);
  }

  function readFormData(collection, mode, item) {
    const scope = mode === 'add' ? 'add' : 'edit';
    const data = {};
    const get = id => $(`#${scope}_${id}`)?.value?.trim() || '';
    const visible = $(`#${scope}_published`)?.checked ?? true;

    if (collection === 'banners') {
      const title = get('title');
      if (!title) return showToast('제목을 입력하세요.', 'warning'), null;
      const action = getBannerClickActionData(scope);
      if (!action) return null;
      if (!currentImageUrl && !getStoredImageUrl(collection, item)) {
        showToast('배너 이미지를 등록하세요.', 'warning'); return null;
      }
      return { title, ...action, isActive: document.querySelector(`input[name="${scope}_active"]:checked`)?.value === 'true', visible, published: visible };
    }

    if (collection === 'characters') {
      const name = get('name');
      if (!name) return showToast('캐릭터 이름을 입력하세요.', 'warning'), null;
      if (!get('grade') || !get('attribute') || !get('type')) return showToast('등급, 속성, 타입을 선택하세요.', 'warning'), null;
      if (!currentImageUrl && !getStoredImageUrl(collection, item)) {
        showToast('캐릭터 이미지를 등록하세요.', 'warning'); return null;
      }
      return {
        name, grade: get('grade'), attr: get('attribute'), attribute: get('attribute'), type: get('type'),
        skills: collectCharacterEntries(scope, 'skills'),
        supportSkills: collectCharacterEntries(scope, 'supportSkills'),
        adminTipItems: collectCharacterEntries(scope, 'tips'),
        published: visible, visible
      };
    }

    if (collection === 'supportCharacters') {
      const name = get('name');
      if (!name || (!currentImageUrl && !getStoredImageUrl(collection, item))) {
        showToast(name ? '서폿 캐릭터 이미지를 등록하세요.' : '캐릭터 이름을 입력하세요.', 'warning'); return null;
      }
      return { name, grade: get('grade'), supportSkills: collectCharacterEntries(scope, 'supportSkills'), adminTipItems: collectCharacterEntries(scope, 'tips'), published: visible, visible };
    }

    if (collection === 'pvpPatch') {
      const charId = get('charId');
      const supportCharId = get('supportCharId');
      const patches = Array.from(document.querySelectorAll(`#${scope}_pvpEntries [data-pvp-entry]`)).map(row => ({
        type: row.querySelector('select')?.value || '',
        text: row.querySelector('.pvp-patch-text')?.value.trim() || ''
      })).filter(patch => patch.text);
      if (!charId && !supportCharId) return showToast('캐릭터나 서폿 캐릭터 중 하나를 선택하세요.', 'warning'), null;
      if (!patches.length) return showToast('패치 항목을 1개 이상 추가하세요.', 'warning'), null;
      return { charId: charId ? Number(charId) : null, supportCharId: supportCharId ? Number(supportCharId) : null, patches, patchDate: get('patchDate') || new Date().toISOString().slice(0, 10), visible, published: visible };
    }

    if (collection === 'patchNotes' || collection === 'notices') {
      const title = get('title');
      const content = getEditorValue(scope, collection);
      if (!title || !content.replace(/<[^>]*>/g, '').trim()) return showToast('제목과 본문은 필수입니다.', 'warning'), null;
      return { title, content, author: '관리자', visible, published: visible, ...(collection === 'notices' ? { pinned: $(`#${scope}_pinned`)?.checked || false } : {}) };
    }

    if (collection === 'events') {
      const title = get('title');
      const content = getEditorValue(scope, collection);
      if (!title || !get('startDate') || !content.replace(/<[^>]*>/g, '').trim()) return showToast('시작일, 제목, 본문은 필수입니다.', 'warning'), null;
      return { title, content, text: content, startDate: get('startDate'), endDate: get('endDate') || null, author: AppState.currentUser?.email?.split('@')[0] || '관리자', published: visible, visible };
    }

    if (collection === 'boards') {
      const title = get('title');
      const content = getEditorValue(scope, collection);
      if (!title) return showToast('제목을 입력하세요.', 'warning'), null;
      return { title, text: content, content, category: get('category'), published: visible, visible };
    }

    return null;
  }

  async function submitDetailedAdminForm(collection, mode, id) {
    const item = mode === 'edit' ? getItem(collection, id) : null;
    if (mode === 'edit' && !item) return;
    const formData = readFormData(collection, mode, item);
    if (!formData) return;
    const { adminTipItems, ...data } = formData;
    try {
      await currentImageUploadPromise;
      if (currentImageUploadError) throw currentImageUploadError;
      if (collection === 'characters' || collection === 'supportCharacters') {
        if (mode === 'add') data.id = await getNextCharacterId(collection);
      }
      if (currentImageUrl && currentImageUrl !== getStoredImageUrl(collection, item)) {
        data[getImageField(collection)] = currentImageUrl;
      }
      data.updatedAt = FieldValue.serverTimestamp();
      data.updatedBy = AppState.currentUser?.email || '-';
      data.adminEmail = AppState.currentUser?.email || '-';
      if (mode === 'add') data.createdAt = FieldValue.serverTimestamp();
      const ref = mode === 'add' ? db.collection(collection).doc() : db.collection(collection).doc(id);
      if (mode === 'add') await ref.set(data);
      else await ref.update(data);
      if (collection === 'characters' || collection === 'supportCharacters') {
        try {
          await persistAdminCharacterTips(data.id ?? item.characterId ?? item.id, adminTipItems || []);
        } catch (error) {
          console.warn('관리자 꿀팁 저장 실패', error);
          showToast('데이터는 저장됐지만 관리자 꿀팁 저장에 실패했습니다.', 'warning');
        }
      }
      closeModal();
      showToast(mode === 'add' ? '추가되었습니다.' : '수정되었습니다.', 'success');
      await loadCollectionData(collection, getPageColumns(collection));
    } catch (error) {
      showToast(`${mode === 'add' ? '추가' : '수정'} 실패: ${error.message}`, 'error');
    } finally {
      currentImageFile = null;
      currentImageUploadPromise = null;
      currentImageUploadError = null;
      activeForm = null;
    }
  }

  window.addPvpPatchEntry = function addPvpPatchEntry(scope) {
    const list = $(`#${scope}_pvpEntries`);
    if (!list) return;
    const index = list.querySelectorAll('[data-pvp-entry]').length;
    list.insertAdjacentHTML('beforeend', pvpPatchRows([{ type: '', text: '' }]).replace(/pvp_patch_type_0/g, `pvp_patch_type_${index}`));
  };

  window.addCharacterEntry = function addCharacterEntry(scope, section) {
    const list = $(`#${scope}_${section}List`);
    if (!list) return;
    const index = list.querySelectorAll('[data-character-entry]').length;
    list.insertAdjacentHTML('beforeend', characterEntry(scope, section, { type: 'custom' }, index));
  };

  window.removeCharacterEntry = function removeCharacterEntry(id) {
    const element = document.querySelector(`[id^="${id}_"]`)?.closest('.character-entry');
    element?.remove();
  };

  window.toggleCharacterDefaultSkills = function toggleCharacterDefaultSkills(scope) {
    const checkbox = $(`#${scope}_defaultSkills`);
    const button = $(`#${scope}_addDefaultSkills`);
    if (button) button.disabled = !checkbox?.checked;
  };

  window.addCharacterDefaultSkills = function addCharacterDefaultSkills(scope) {
    const list = $(`#${scope}_skillsList`);
    const button = $(`#${scope}_addDefaultSkills`);
    if (!list || !button || button.dataset.added === 'true') return;
    const defaults = ['skill1', 'skill2', 'skill3', 'skill4', 'cardSkill1', 'cardSkill2'];
    const start = list.querySelectorAll('[data-character-entry]').length;
    list.insertAdjacentHTML('beforeend', defaults.map((type, index) => characterEntry(scope, 'skills', { type }, start + index)).join(''));
    button.dataset.added = 'true';
    button.disabled = true;
  };

  window.handleAddItem = async function handleAddItem(collection) {
    currentImageFile = null;
    currentImagePreviewUrl = null;
    currentImageUrl = null;
    currentImageUploadPromise = null;
    currentImageUploadError = null;
    await setupDetailedForm(collection, null, 'add');
  };

  window.editItem = async function editItem(collection, id) {
    const item = getItem(collection, id);
    if (!item) return;
    if (collection === 'characters') {
      try { item.adminTips = await loadAdminCharacterTips(item.characterId ?? item.id); } catch (error) { item.adminTips = []; }
    }
    currentImageFile = null;
    currentImagePreviewUrl = null;
    currentImageUrl = null;
    currentImageUploadPromise = null;
    currentImageUploadError = null;
    await setupDetailedForm(collection, item, 'edit');
  };

  window.submitDetailedAdminForm = submitDetailedAdminForm;
})();