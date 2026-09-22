// ===== Patch Notes Administration Module =====
(function registerPatchNotesModule() {
  registerAdminModule('patchNotes', {
    title: '패치노트 관리',
    collection: 'patchNotes',
    columns: [
      { key: 'id', label: 'ID', type: 'default' },
      { key: 'createdAt', label: '날짜', type: 'date' },
      { key: 'title', label: '제목', type: 'truncate' },
      { key: 'author', label: '글쓴이', type: 'default' },
      { key: 'published', label: '노출 상태', type: 'toggle' },
      { key: 'adminEmail', label: '관리자', type: 'default' }
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