// ===== PvP Patch Administration Module =====
(function registerPvpModule() {
  registerAdminModule('pvpPatch', {
    title: 'PvP 패치 관리',
    collection: 'pvpPatch',
    columns: [
      { key: 'id', label: 'ID', type: 'default' },
      { key: 'imageUrl', label: '이미지', type: 'image' },
      { key: 'name', label: '이름', type: 'default' },
      { key: 'type', label: '타입', type: 'default' },
      { key: 'published', label: '노출 상태', type: 'toggle' },
      { key: 'adminEmail', label: '관리자', type: 'default' }
    ],
    filters: [
      { key: 'type', label: '타입', options: ['버프', 'nerf', '신규', '조정'] }
    ],
    render(container) {
      createListPage(container, {
        title: this.title,
        collection: this.collection,
        columns: this.columns,
        filters: this.filters,
        hasAdd: true,
        hasSaveBar: true
      });
    }
  });
})();