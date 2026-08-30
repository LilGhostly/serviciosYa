# Docker — ServiciosYa

## Por qué dos Dockerfiles

El proyecto no tiene un "backend" tradicional que se pueda empaquetar tal
cual: en producción, `functions/` se despliega directamente a Cloud
Functions (`firebase deploy --only functions`), no corre en un contenedor
propio. Por eso:

- **`Dockerfile`** (raíz) — build de producción real: compila el frontend
  con Vite y lo sirve con Nginx. Esta es la imagen que tendría sentido en
  un despliegue real (ej. detrás de un balanceador, o como alternativa a
  Firebase Hosting).
- **`functions/Dockerfile`** — no es para producción, sino para poder
  levantar el backend completo (Functions + Firestore + Auth + Storage)
  en un entorno local reproducible usando los **emuladores de Firebase**,
  sin que cada integrante del equipo tenga que instalar Java y
  `firebase-tools` manualmente en su máquina.

## Uso

```bash
cp .env.example .env
cp functions/.env.example functions/.env
# completa ambos .env con tus credenciales de desarrollo

docker compose up --build
```

- Frontend: http://localhost:8080
- UI de emuladores de Firebase: http://localhost:4000
- Firestore emulator (para herramientas externas): localhost:8081
- Auth emulator: localhost:9099
- Storage emulator: localhost:9199

## Limitación conocida

El frontend construido dentro del contenedor se conecta al proyecto de
Firebase **real** definido en `VITE_FIREBASE_*` (no a los emuladores
levantados por el servicio `backend`), porque `src/firebase.js` no llama a
`connectFirestoreEmulator` / `connectAuthEmulator`. Esto es intencional
para no complicar el flujo de build de producción con lógica condicional
de entorno; conectar ambos contenedores entre sí (frontend usando los
emuladores del backend) es una mejora pendiente si el equipo necesita un
entorno 100% aislado de Firebase real para pruebas.
