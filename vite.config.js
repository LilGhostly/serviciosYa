import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// import basicSsl from '@vitejs/plugin-basic-ssl' // <--- COMENTA O BORRA ESTO

export default defineConfig({
  plugins: [
    react(),
    // basicSsl() // <--- COMENTA O BORRA ESTO TAMBIÉN
  ],
  server: {
    host: true, // Mantén esto para poder entrar desde el celular (aunque sin cámara)
  },
  build: {
    rollupOptions: {
      output: {
        // Separa las librerías pesadas de terceros del bundle de la app,
        // para que cambien de hash (y por tanto de caché del navegador)
        // con menos frecuencia que el código propio, y para que el chunk
        // principal de la app sea más liviano junto con el code-splitting
        // por ruta ya aplicado en src/App.jsx (React.lazy).
        manualChunks: {
          "vendor-firebase": ["firebase/app", "firebase/auth", "firebase/firestore", "firebase/storage", "firebase/functions"],
          "vendor-charts": ["recharts"],
          "vendor-maps": ["@react-google-maps/api"],
        },
      },
    },
  },
})