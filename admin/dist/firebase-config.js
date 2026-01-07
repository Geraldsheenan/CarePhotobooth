// admin/dist/firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyBPZIHbdd4vScmu_jD9zhwKohEdBVpov2o",
  authDomain: "photoboothweb-3e626.firebaseapp.com",
  projectId: "photoboothweb-3e626",
  storageBucket: "photoboothweb-3e626.firebasestorage.app",
  messagingSenderId: "730123959054",
  appId: "1:730123959054:web:f10616f23308f3957b755f",
  measurementId: "G-DDD8LXN16Q",
};

try {
  if (!window.firebase) throw new Error("firebase tidak terload. Cek firebase-app-compat.js");
  if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
  window.db = firebase.firestore();
} catch (e) {
  console.error("firebase-config init error:", e);
}
