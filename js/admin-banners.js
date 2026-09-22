// ===== Banner Administration Module =====
(function registerBannerModule() {
  registerAdminModule('banners', {
    title: '메인 배너 관리',
    collection: 'banners',
    columns: [
      { key: 'id', label: 'ID', type: 'default' },
      { key: 'imageUrl', label: '미리보기', type: 'preview' },
      { key: 'title', label: '제목', type: 'truncate' },
      { key: 'isActive', label: '활성화 상태', type: 'toggle' },
      { key: 'visible', label: '노출 상태', type: 'toggle' },
      { key: 'updatedBy', label: '관리자', type: 'default' }
    ],
    render(container) {
      createListPage(container, {
        title: this.title,
        collection: this.collection,
        columns: this.columns,
        filters: null,
        filterLeftHtml: `
          <button class="btn btn-secondary btn-sm" onclick="openBannerOrderModal()">
            <i class="fas fa-sort"></i> 순서관리
          </button>
        `,
        hasAdd: true,
        hasSaveBar: true
      });
    }
  });

  function escapeBannerHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getBannerItemsInOrder() {
    const state = AppState.pageStates.banners;
    if (!state) return [];

    return [...state.data].sort((a, b) => {
      const aOrder = Number(a.order);
      const bOrder = Number(b.order);
      const aHasOrder = Number.isFinite(aOrder);
      const bHasOrder = Number.isFinite(bOrder);
      if (aHasOrder && bHasOrder && aOrder !== bOrder) return aOrder - bOrder;
      if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;
      return 0;
    });
  }

  function renderBannerOrderItems(items) {
    return items.length
      ? items.map((item, index) => `
          <div class="banner-order-item" draggable="true" data-id="${escapeBannerHtml(item.id)}">
            <span class="banner-order-drag" title="드래그하여 이동"><i class="fas fa-bars"></i></span>
            <span class="banner-order-number">${index + 1}</span>
            <div class="banner-order-thumb">
              ${item.imageUrl || item.image
                ? `<img src="${escapeBannerHtml(item.imageUrl || item.image)}" alt="">`
                : '<i class="fas fa-image"></i>'}
            </div>
            <div class="banner-order-title">${escapeBannerHtml(item.title || '제목 없음')}</div>
            <span class="badge ${item.isActive !== false && item.visible !== false ? 'badge-success' : 'badge-gray'}">
              ${item.isActive !== false && item.visible !== false ? 'ON' : 'OFF'}
            </span>
          </div>
        `).join('')
      : '<div class="banner-order-empty"><i class="fas fa-inbox"></i><p>등록된 배너가 없습니다.</p></div>';
  }

  function refreshBannerOrderNumbers(list) {
    list.querySelectorAll('.banner-order-item').forEach((item, index) => {
      const number = item.querySelector('.banner-order-number');
      if (number) number.textContent = index + 1;
    });
  }

  function moveBannerOrderItem(list, item, direction) {
    const sibling = direction < 0 ? item.previousElementSibling : item.nextElementSibling;
    if (!sibling) return;
    if (direction < 0) list.insertBefore(item, sibling);
    else list.insertBefore(sibling, item);
    refreshBannerOrderNumbers(list);
  }

  window.openBannerOrderModal = function openBannerOrderModal() {
    const state = AppState.pageStates.banners;
    if (!state || state.loading) {
      showToast('배너 목록을 불러오는 중입니다.', 'info');
      return;
    }

    const items = getBannerItemsInOrder();
    showModal('배너 순서 관리', `
      <div class="banner-order-modal">
        <div class="banner-order-guide">
          <i class="fas fa-info-circle"></i>
          <span>드래그하여 배너 노출 순서를 변경하세요. 맨 위의 배너가 1순위로 노출됩니다.</span>
        </div>
        <div class="banner-order-list" id="bannerOrderList">
          ${renderBannerOrderItems(items)}
        </div>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">취소</button>
      <button class="btn btn-primary" onclick="saveBannerOrder()"><i class="fas fa-save"></i> 저장</button>
    `);

    const list = $('#bannerOrderList');
    if (!list) return;

    let draggedItem = null;
    list.querySelectorAll('.banner-order-item').forEach(item => {
      item.addEventListener('dragstart', () => {
        draggedItem = item;
        item.classList.add('is-dragging');
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('is-dragging');
        draggedItem = null;
        refreshBannerOrderNumbers(list);
      });
      item.addEventListener('dragover', event => {
        event.preventDefault();
        if (!draggedItem || draggedItem === item) return;
        const rect = item.getBoundingClientRect();
        const insertAfter = event.clientY > rect.top + rect.height / 2;
        list.insertBefore(draggedItem, insertAfter ? item.nextSibling : item);
        refreshBannerOrderNumbers(list);
      });
      item.addEventListener('dblclick', () => moveBannerOrderItem(list, item, 1));
    });
  };

  window.saveBannerOrder = async function saveBannerOrder() {
    const state = AppState.pageStates.banners;
    const list = $('#bannerOrderList');
    if (!state || !list) return;

    const ids = [...list.querySelectorAll('.banner-order-item')].map(item => item.dataset.id);
    try {
      const batch = db.batch();
      ids.forEach((id, index) => {
        batch.set(db.collection('banners').doc(id), {
          order: index + 1,
          updatedBy: AppState.currentUser?.email || '-',
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      });
      await batch.commit();

      const orderMap = new Map(ids.map((id, index) => [id, index + 1]));
      state.data.forEach(item => {
        if (orderMap.has(item.id)) {
          item.order = orderMap.get(item.id);
          item.updatedBy = AppState.currentUser?.email || item.updatedBy;
        }
      });
      state.data.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      state.lastSavedData = JSON.parse(JSON.stringify(state.data));
      closeModal();
      applyFilters('banners');
      renderPagination('banners');
      showToast('배너 순서가 저장되었습니다.', 'success');
    } catch (error) {
      showToast('배너 순서 저장 실패: ' + error.message, 'error');
    }
  };
})();