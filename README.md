# ServiciosYa

**Red de confianza para trabajo independiente en Chile.** Marketplace que conecta
clientes con profesionales independientes de múltiples rubros —hogar, belleza,
arte, bienestar, educación, mascotas, transporte— a través de un sistema de
confianza en capas: verificación de identidad por IA, confirmación en terreno
por PIN de seguridad, doble calificación, sistema de strikes, y un nivel de
verificación institucional respaldado por la OMIL de la comuna del profesional.

Proyecto desarrollado para la asignatura **Capstone (46104)**, Escuela de
Informática y Telecomunicaciones, Duoc UC.

---

## Índice

- [Descripción](#descripción)
- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Arquitectura de la solución](#arquitectura-de-la-solución)
- [Cómo ejecutar el proyecto localmente](#cómo-ejecutar-el-proyecto-localmente)
- [Variables de entorno](#variables-de-entorno)
- [Pruebas](#pruebas)
- [Despliegue con Docker](#despliegue-con-docker)
- [Integrantes del equipo](#integrantes-del-equipo)
- [Metodología de trabajo](#metodología-de-trabajo)
- [Seguridad](#seguridad)

---

## Descripción

ServiciosYa resuelve dos problemas al mismo tiempo: la informalidad de quienes
trabajan de forma independiente en Chile (gasfíteres, barberos, tatuadores,
psicólogos, entrenadores personales, etc.) y la falta de confianza real que
enfrenta un cliente al contratar a un desconocido para un servicio presencial.

> **Este repositorio es público y corre en modo simulado por defecto.** Las
> integraciones con Mercado Pago y Google Cloud Vision tienen un modo mock
> (activo de fábrica) que reemplaza esas llamadas externas por un flujo
> equivalente dentro de la propia app, para que cualquiera pueda clonar,
> instalar y probar el proyecto completo sin crear ninguna cuenta de pago ni
> de IA. Ver [`docs/PAGOS_Y_VERIFICACION.md`](docs/PAGOS_Y_VERIFICACION.md).

El diferenciador del proyecto es la capa de **verificación municipal**: un
profesional puede obtener el sello "Verificado por tu Municipalidad" a través
de la OMIL (Oficina Municipal de Información Laboral) de su comuna,
aprovechando el proceso de verificación de identidad y antecedentes que el
municipio ya realiza gratuitamente para inscribir a cualquier persona en su
bolsa de empleo. Ver `docs/INNOVACION.md` para el detalle del modelo.

Funcionalidades principales:

- Publicación de solicitudes de servicio con fotos, ubicación y urgencia.
- Postulación de profesionales mediante un sistema de créditos.
- Confirmación de inicio de servicio mediante PIN de seguridad de 4 dígitos.
- Verificación de identidad automatizada (Google Cloud Vision).
- Nivel de verificación municipal (OMIL), adicional y opcional.
- Calificación mutua cliente ↔ profesional y sistema de strikes (suspensión
  automática a los 3 strikes).
- Billetera digital y panel de analítica de negocio para el profesional.
- Pagos reales vía Mercado Pago (compra de créditos).
- Chat en tiempo real por solicitud.
- Panel de administración (gestión de usuarios, verificación municipal,
  moderación de solicitudes).

## Tecnologías utilizadas

| Capa | Tecnología |
|---|---|
| Frontend | React 19, Vite 7, React Router 7, Tailwind CSS |
| Backend | Firebase Cloud Functions (Node.js), Firebase Admin SDK |
| Base de datos | Cloud Firestore (NoSQL) |
| Almacenamiento | Firebase Storage |
| Autenticación | Firebase Authentication |
| Pagos | Mercado Pago (Checkout Pro / API) |
| Verificación de identidad | Google Cloud Vision API |
| Mapas / geocodificación | Google Maps JavaScript API (Places) |
| Pruebas | Vitest |
| Contenedores | Docker / Docker Compose |

## Arquitectura de la solución

```
┌──────────────────┐        ┌───────────────────────┐        ┌─────────────────────┐
│   Cliente (SPA)   │  HTTPS │   Firebase Hosting     │        │  Cloud Functions     │
│  React + Vite     │◄──────►│   (dist/ estático)     │        │  (Node.js, backend)  │
└─────────┬─────────┘        └───────────────────────┘        └──────────┬───────────┘
          │  Firebase SDK (Auth / Firestore / Storage)                    │
          │                                                               │ Admin SDK
          ▼                                                               ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                              Firebase / Google Cloud                          │
│  ┌───────────────┐   ┌─────────────────┐   ┌───────────────┐   ┌───────────┐  │
│  │  Authentication│   │ Cloud Firestore │   │    Storage     │   │  Vision   │  │
│  │                │   │  (users,        │   │  (fotos perfil,│   │  API (IA) │  │
│  │                │   │   requests,     │   │   solicitudes, │   │           │  │
│  │                │   │   chats, ...)   │   │   selfies)     │   │           │  │
│  └───────────────┘   └─────────────────┘   └───────────────┘   └───────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
          ▲
          │ REST / Webhook
          ▼
┌───────────────────┐
│    Mercado Pago     │
│  (Checkout Pro)     │
└───────────────────┘
```

El frontend es una SPA que habla directamente con Firebase (Auth, Firestore,
Storage) para la mayoría de las operaciones, protegida por reglas de
seguridad de Firestore/Storage (ver `firestore.rules` y `storage.rules`).
Las operaciones que requieren una credencial sensible —cobrar con Mercado
Pago, llamar a Vision API— pasan por Cloud Functions, que son las únicas que
usan esas credenciales (nunca el frontend).

Ver `docs/ARCHITECTURE.md` y `docs/MODELO_DATOS.md` para el detalle de
colecciones de Firestore, relaciones y decisiones de diseño.

## Cómo ejecutar el proyecto localmente

### Requisitos previos

- Node.js 20 o superior (recomendado: la misma versión que `functions/package.json` declara, Node 24)
- Una cuenta de Firebase con un proyecto creado (Firestore, Auth, Storage y Functions habilitados) — este sí es imprescindible, es la base de datos y autenticación de la app.
- **No se necesita** cuenta de Mercado Pago ni de Google Cloud Vision para probar el proyecto: ambas corren en modo simulado por defecto (ver [`docs/PAGOS_Y_VERIFICACION.md`](docs/PAGOS_Y_VERIFICACION.md)).
- Opcional: una clave de Google Maps API con Places habilitado (si no se configura, el paso de dirección usa un formulario manual sin mapa).

### 1. Clonar e instalar dependencias

```bash
git clone <url-del-repositorio>
cd ServiciosYa

# Frontend
npm install

# Backend (Cloud Functions)
cd functions
npm install
cd ..
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
cp functions/.env.example functions/.env
```

Completa ambos archivos `.env` con tus propias credenciales (ver sección
[Variables de entorno](#variables-de-entorno)). **Nunca subas estos archivos
a git** — ya están excluidos en `.gitignore`.

### 3. Ejecutar en modo desarrollo

```bash
# Frontend (http://localhost:5173)
npm run dev

# Backend, en otra terminal (emuladores de Firebase)
cd functions
npm run serve
```

### 4. Compilar para producción

```bash
npm run build     # genera la carpeta dist/
npm run preview   # sirve el build localmente para verificarlo
```

## Variables de entorno

### Frontend (`.env`, ver `.env.example`)

| Variable | Descripción |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | Clave de Google Maps (Places/Autocomplete) |
| `VITE_FIREBASE_API_KEY` | Configuración web de Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | Configuración web de Firebase |
| `VITE_FIREBASE_PROJECT_ID` | Configuración web de Firebase |
| `VITE_FIREBASE_STORAGE_BUCKET` | Configuración web de Firebase |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Configuración web de Firebase |
| `VITE_FIREBASE_APP_ID` | Configuración web de Firebase |

### Backend (`functions/.env`, ver `functions/.env.example`)

| Variable | Descripción |
|---|---|
| `PAYMENTS_MODE` | `mock` (por defecto) o `live`. Ver [`docs/PAGOS_Y_VERIFICACION.md`](docs/PAGOS_Y_VERIFICACION.md) |
| `IDENTITY_VERIFICATION_MODE` | `mock` (por defecto) o `live`. Ver [`docs/PAGOS_Y_VERIFICACION.md`](docs/PAGOS_Y_VERIFICACION.md) |
| `MP_ACCESS_TOKEN` | Token de acceso de Mercado Pago (solo necesario si `PAYMENTS_MODE=live`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Ruta al JSON de la cuenta de servicio de Google Cloud (solo necesaria si `IDENTITY_VERIFICATION_MODE=live`, y solo en desarrollo local) |

## Pruebas

```bash
npm run test         # corre la suite una vez
npm run test:watch   # modo watch para desarrollo
```

Las pruebas cubren la lógica de negocio central (`src/lib/business.js`):
generación y validación del PIN de seguridad, sistema de strikes, niveles de
verificación y cálculo de créditos. Esta lógica se extrajo de los
componentes de página a un módulo aparte específicamente para poder
probarla sin depender de React ni de Firebase.

## Despliegue con Docker

El frontend puede construirse y servirse en un contenedor Nginx, y el backend
puede levantarse localmente con los emuladores de Firebase, ambos orquestados
con Docker Compose. Ver `docs/DOCKER.md` para el detalle de cada imagen.

```bash
docker compose up --build
```

- Frontend: http://localhost:8080
- Emuladores de Firebase (UI): http://localhost:4000

## Integrantes del equipo

| Integrante | Rol |
|---|---|
| Maximiliano Navarrete | Product Owner / Frontend |
| Salomón Abdo | Backend / Datos |
| Sebastián Núñez | Scrum Master / QA / Documentación |

## Metodología de trabajo

Scrum, con sprints de dos semanas alineados a las tres fases de la
asignatura Capstone. Detalle completo de objetivos, plan de trabajo y carta
Gantt en la documentación de Fase 1 del equipo (fuera de este repositorio).

## Seguridad

- Ninguna credencial (tokens de pago, llaves de servicio, configuración de
  Firebase) está escrita en el código fuente: todas se cargan desde
  variables de entorno no versionadas (ver `.gitignore`).
- Las reglas de Firestore y Storage (`firestore.rules`, `storage.rules`)
  restringen el acceso a cada colección/ruta según el usuario autenticado y
  su relación con el recurso (dueño, profesional asignado, administrador).
- El sistema de strikes suspende automáticamente cualquier cuenta al llegar
  a 3 infracciones (`STRIKE_LIMIT` en `src/lib/business.js`).

Ver `docs/ARCHITECTURE.md` para las limitaciones de seguridad conocidas y
documentadas (no ocultas) pendientes de una futura iteración.
