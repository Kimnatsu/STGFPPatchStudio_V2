// ===== FPPStudio Firebase Setup =====
// Firebase SDK scripts are loaded by index.html before this file.
(function initializeFirebase() {
  'use strict';

  const firebaseConfig = Object.freeze({
    apiKey: 'AIzaSyCF1o7_h-70-HwfC_5YoxOmTJFTBfFa04w',
    authDomain: 'fighting-path-patch.firebaseapp.com',
    projectId: 'fighting-path-patch',
    storageBucket: 'fighting-path-patch.firebasestorage.app',
    messagingSenderId: '1071337898551',
    appId: '1:1071337898551:web:d6f2c10f0f29e430a675b2',
    measurementId: 'G-VMY3PHGN4C'
  });

  if (!window.firebase) {
    throw new Error('Firebase SDK가 로드되지 않았습니다.');
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  window.FPPFirebase = Object.freeze({
    db: firebase.firestore(),
    auth: firebase.auth(),
    storage: firebase.storage(),
    googleProvider: new firebase.auth.GoogleAuthProvider(),
    FieldValue: firebase.firestore.FieldValue,
    Persistence: firebase.auth.Auth.Persistence
  });
})();