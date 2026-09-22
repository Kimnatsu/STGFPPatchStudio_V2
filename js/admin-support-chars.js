// ===== Support Character Administration Module =====
(function registerSupportCharacterModule() {
  registerAdminModule('supportCharacters', {
    title: '현질 서폿 캐릭터 관리',
    collection: 'supportCharacters',
    columns: [
      { key: 'id', label: 'ID', type: 'default' },
      { key: 'imageUrl', label: '이미지', type: 'image' },
      { key: 'name', label: '이름', type: 'default' },
      { key: 'grade', label: '등급', type: 'default' },
      { key: 'attribute', label: '속성', type: 'default' },
      { key: 'published', label: '노출 상태', type: 'toggle' },
      { key: 'adminEmail', label: '관리자', type: 'default' }
    ],
    filters: [
      { key: 'grade', label: '등급', options: ['전설', '영웅', '희귀', '일반'] },
      { key: 'attribute', label: '속성', options: ['화염', '냉기', '전기', '암흑', '광명'] }
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