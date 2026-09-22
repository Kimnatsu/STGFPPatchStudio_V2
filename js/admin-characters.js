// ===== Character Administration Module =====
(function registerCharacterModule() {
  registerAdminModule('characters', {
    title: '캐릭터 관리',
    collection: 'characters',
    columns: [
      { key: 'id', label: 'ID', type: 'default' },
      { key: 'img', label: '이미지', type: 'image' },
      { key: 'name', label: '이름', type: 'default' },
      { key: 'grade', label: '등급', type: 'default' },
      { key: 'attribute', label: '속성', type: 'default' },
      { key: 'type', label: '타입', type: 'default' },
      { key: 'visible', label: '노출 상태', type: 'toggle' },
      { key: 'updatedBy', label: '관리자', type: 'default' }
    ],
    filters: [
      { key: 'grade', label: '등급', options: ['전설', '영웅', '희귀', '일반'] },
      { key: 'attribute', label: '속성', options: ['화염', '냉기', '전기', '암흑', '광명'] },
      { key: 'type', label: '타입', options: ['전사', '마법사', '궁수', '탱커', '서포터'] }
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