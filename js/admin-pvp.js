// ===== PvP Patch Administration Module =====
(function registerPvpModule() {
  registerAdminModule('pvpPatch', {
    title: 'PvP 패치 관리',
    collection: 'pvpPatch',
    columns: [
      { key: 'patchDate', label: '패치 날짜', type: 'date' },
      { key: 'displayCharId', label: '캐릭터 ID', type: 'default' },
      { key: 'name', label: '캐릭터 이름', type: 'default' },
      { key: 'type', label: '타입', type: 'pvpType' },
      { key: 'visible', label: '노출 상태', type: 'toggle' },
      { key: 'updatedBy', label: '관리자', type: 'default' }
    ],
    filters: [
      { key: 'type', label: '타입', options: ['버프', '너프', '기능 수정', '신규', 'Up Comming'] }
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