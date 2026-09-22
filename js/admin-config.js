// ===== FPPStudio Admin Configuration =====
// This file contains authorization configuration, separate from Firebase setup
// and the application behavior.
(function initializeAdminConfig() {
  'use strict';

  window.FPPAdminConfig = Object.freeze({
    CLOUDINARY_CONFIG: Object.freeze({
      cloudName: 'ds8fi00id',
      uploadPreset: 'zgzhnk6x',
      baseFolder: 'fighting-path',
      allowedTypes: Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
      maxSizeBytes: 10 * 1024 * 1024
    }),
    ADMIN_EMAILS: Object.freeze([
      'gichan1005kim@gmail.com',
      'gimbaein7@gmail.com',
      'kyg12555@gmail.com',
      'skadlstj9081@gmail.com',
      'brawnstars201596@gmail.com'
    ]),
    SUPER_ADMIN_EMAIL: 'gichan1005kim@gmail.com'
  });
})();