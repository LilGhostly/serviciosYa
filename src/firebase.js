// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

 
const firebaseConfig = {
  apiKey: "AIzaSyB2xgExbjvpboEb3aiEM94rZbi9PA-1_aU",
  authDomain: "gasfiter-final.firebaseapp.com",
  projectId: "gasfiter-final",
  storageBucket: "gasfiter-final.firebasestorage.app",
  messagingSenderId: "522790105350",
  appId: "1:522790105350:web:317f6a24565d0f64ecae87"
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error(
    "⚠️ Falta configuración de Firebase. Copia .env.example a .env y " +
    "completa las variables VITE_FIREBASE_*."
  );
}

// 1. Inicializamos la App y la exportamos
// Esto es vital para que el SDK de Functions sepa a qué proyecto conectarse
export const app = initializeApp(firebaseConfig);

// 2. Exportamos los servicios vinculados a esa instancia de 'app'
export const db = getFirestore(app);
export const auth = getAuth(app);

// 3. Exportamos las funciones configurando explícitamente la región
// Al poner 'us-central1' aquí, el frontend sabrá buscar la URL correcta
export const functions = getFunctions(app, "us-central1");