// Firebase 기본 연결
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCoDdaAQ36laH4G9KQqPERkQbNqNxO_Gok",
  authDomain: "diary-app-cc9cd.firebaseapp.com",
  projectId: "diary-app-cc9cd",
  storageBucket: "diary-app-cc9cd.appspot.com",
  messagingSenderId: "133868238231",
  appId: "1:133868238231:web:4dbcbdada1b7377a6b80d2"
};

const app = initializeApp(firebaseConfig);

// Firestore DB export
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app); // ✅ Storage 추가