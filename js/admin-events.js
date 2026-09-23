// ===== Events and Boards Administration Modules =====
(function registerEventsModules() {
  const listPage = (module, container) => {
    const isBoard = module.collection === 'boards';
    createListPage(container, {
      title: module.title,
      collection: module.collection,
      columns: module.columns,
      filters: isBoard ? null : getPageFilterConfig(module.collection)?.filters || null,
      filterButtons: isBoard ? getPageFilterConfig(module.collection)?.filters || [] : [],
      hasAdd: true,
      hasSaveBar: true
    });
  };

  registerAdminModule('events', {
    title: '이벤트 관리',
    collection: 'events',
    columns: [
      { key: 'id', label: 'ID', type: 'default' },
      { key: 'createdAt', label: '날짜', type: 'date' },
      { key: 'title', label: '제목', type: 'truncate' },
      { key: 'author', label: '글쓴이', type: 'default' },
      { key: 'published', label: '노출 상태', type: 'toggle' },
      { key: 'adminEmail', label: '관리자', type: 'default' }
    ],
    render(container) {
      listPage(this, container);
    }
  });

  registerAdminModule('boards', {
    title: '게시판 관리',
    collection: 'boards',
    columns: [
      { key: 'id', label: 'ID', type: 'default' },
      { key: 'createdAt', label: '날짜', type: 'date' },
      { key: 'title', label: '제목', type: 'truncate' },
      { key: 'uid', label: '글쓴이', type: 'default' },
      { key: 'published', label: '노출 상태', type: 'status' },
      { key: 'adminEmail', label: '관리자', type: 'default' }
    ],
    render(container) {
      listPage(this, container);
    }
  });
})();