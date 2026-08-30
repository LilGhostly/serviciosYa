# Emuladores de Firebase para desarrollo local en contenedor.
# NOTA: esta imagen es para DESARROLLO, no para producción — Cloud Functions
# se despliega directamente a Firebase (`firebase deploy --only functions`),
# no se ejecuta en un contenedor propio en producción.
FROM node:20-slim

# El emulador de Firestore/Storage corre sobre la JVM.
RUN apt-get update \
    && apt-get install -y --no-install-recommends default-jdk-headless curl \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g firebase-tools@15

WORKDIR /workspace

# Dependencias de las Functions
COPY functions/package*.json functions/
RUN cd functions && npm ci

# Config de Firebase (necesaria para que el emulador sepa qué levantar)
COPY firebase.json firestore.rules firestore.indexes.json storage.rules ./
COPY functions/ functions/

EXPOSE 4000 5001 8080 9099 9199

CMD ["firebase", "emulators:start", "--only", "auth,functions,firestore,storage"]
