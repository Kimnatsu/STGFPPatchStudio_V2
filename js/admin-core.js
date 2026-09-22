// ===== FPPStudio Admin Module Registry =====
// Page modules register their page metadata here before fppstudio.js starts.
(function initializeAdminCore() {
  'use strict';

  const modules = Object.create(null);

  window.FPPAdminModules = modules;
  window.registerAdminModule = (key, definition) => {
    if (!key || !definition) throw new Error('관리자 모듈 키와 정의가 필요합니다.');
    modules[key] = Object.freeze({ key, ...definition });
  };
  window.getAdminModule = key => modules[key] || null;
})();