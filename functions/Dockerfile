FROM node:20-alpine

# Instala Java 21 (requerido por Firebase) y dependencias base
RUN apk add --no-cache openjdk21-jre curl bash

# Instala Firebase CLI
RUN npm install -g firebase-tools

WORKDIR /workspace

# Copia e instala las dependencias de Cloud Functions
COPY functions/package*.json functions/
RUN cd functions && npm ci

# Copia la configuración de Firebase y el código
COPY firebase.json firestore.rules firestore.indexes.json storage.rules ./
COPY functions/ functions/

# Arranca los emuladores 
CMD ["firebase", "emulators:start", "--project", "demo-serviciosya"]