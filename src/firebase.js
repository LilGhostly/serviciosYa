// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

// NOTA: Firebase Storage se dejó de usar en este proyecto porque, desde
// 2026, requiere el plan de pago Blaze (tarjeta vinculada). Las imágenes
// (avatares, verificación de identidad, fotos de solicitudes, chat) se
// comprimen en el navegador y se guardan como Base64 directamente en los
// documentos de Firestore — ver src/lib/imageCompression.js. Firestore y
// Auth siguen funcionando normalmente en el plan Spark (gratis).

// La configuración web de Firebase se carga desde variables de entorno
// (ver .env.example) en lugar de quedar escrita en el código fuente.
//
// Nota técnica: a diferencia del token de Mercado Pago o la llave de
// servicio de Google Cloud, esta configuración NO es un secreto tradicional
// — Firebase la considera segura de exponer en un cliente web, porque el
// acceso real a los datos lo controlan las reglas de Firestore/Storage, no
// esta clave. Aun así, se externaliza a variables de entorno porque:
//   1) Permite usar un proyecto de Firebase distinto en desarrollo/pruebas
//      sin tocar el código.
//   2) Es el estándar exigido por el instructivo para que el repositorio
//      público no contenga ningún valor de configuración embebido.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
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