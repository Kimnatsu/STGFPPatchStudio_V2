// ===== System Administration Modules =====
(function registerSystemModules() {
  registerAdminModule('members', {
    title: '멤버 관리',
    render(container) {
      renderMembersPage(container);
    }
  });

  registerAdminModule('permissions', {
    title: '권한 관리',
    render(container) {
      renderPermissionsPage(container);
    }
  });

  registerAdminModule('support', {
    title: '고객센터 관리',
    render(container) {
      renderSupportPage(container);
    }
  });

  registerAdminModule('backup', {
    title: '백업 및 복원',
    render(container) {
      renderBackupPage(container);
    }
  });
})();