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
        hasAdd: true,
        hasSaveBar: true
      });
    }
  });
})();