import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyAp6g2bZ49Fdzi990yXy79D_f_CBRUrQb0",
  authDomain: "cces-farm-market.firebaseapp.com",
  projectId: "cces-farm-market",
  storageBucket: "cces-farm-market.firebasestorage.app",
  messagingSenderId: "450594062725",
  appId: "1:450594062725:web:d7f3e68c61f18d6e2684ec",
  measurementId: "G-7XTJGX677Z"
};

export const app = initializeApp(firebaseConfig);