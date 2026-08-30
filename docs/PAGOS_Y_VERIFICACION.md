# Pagos y verificación de identidad — modo simulado vs. modo real

Este repositorio es público. Para que cualquiera pueda clonarlo, instalar
dependencias y probar la aplicación completa sin necesitar una cuenta real
de Mercado Pago ni de Google Cloud, las dos integraciones que dependen de
credenciales de terceros tienen un **modo simulado**, controlado por dos
variables de entorno en `functions/.env`:

```env
PAYMENTS_MODE=mock                 # "mock" | "live"
IDENTITY_VERIFICATION_MODE=mock    # "mock" | "live"
```

Por defecto, ambas parten en `mock`. El comportamiento del resto de la
aplicación (Firestore, Auth, Storage, la lógica de negocio en
`src/lib/business.js`) es exactamente el mismo en ambos modos — lo único
que cambia es qué pasa dentro de las Cloud Functions que hoy dependían de
una API externa.

## Pagos (`PAYMENTS_MODE`)

| | `mock` (por defecto) | `live` |
|---|---|---|
| ¿Requiere cuenta de Mercado Pago? | No | Sí (`MP_ACCESS_TOKEN`) |
| ¿Quién crea la "preferencia" de pago? | `functions/index.js` genera un documento en `mockPayments/{id}` | La API real de Mercado Pago |
| ¿Dónde se confirma el pago? | `src/pages/PagoSimulado.jsx` — pantalla propia con botones "Aprobar" / "Rechazar" | El checkout real de Mercado Pago, luego el webhook (`mpWebhook`) |
| ¿Qué pasa al aprobar? | La Cloud Function `confirmarPagoSimulado` aplica exactamente el mismo efecto que aplicaría el webhook real: acredita créditos o marca la solicitud como prioritaria | El webhook `mpWebhook` aplica el efecto |

El frontend (`src/services/paymentService.jsx`, `src/pages/ComprarCreditos.jsx`)
**no necesita saber en qué modo está el backend**: en ambos casos recibe un
`init_point` (una URL) y simplemente redirige a esa URL. En modo mock, esa
URL es `/pago-simulado/{id}` (una ruta interna de la propia app); en modo
real, es la URL de checkout de Mercado Pago.

### Cambiar a modo real

1. Crear una cuenta de Mercado Pago y obtener el `Access Token` de
   producción o de pruebas (sandbox) desde su panel de credenciales.
2. En `functions/.env`: `PAYMENTS_MODE=live` y `MP_ACCESS_TOKEN=<tu token>`.
3. Configurar el webhook de Mercado Pago apuntando a la URL desplegada de
   `mpWebhook`.

## Verificación de identidad (`IDENTITY_VERIFICATION_MODE`)

| | `mock` (por defecto) | `live` |
|---|---|---|
| ¿Requiere cuenta de Google Cloud? | No | Sí (cuenta de servicio con Vision API habilitada) |
| ¿Qué valida? | Que se haya enviado una imagen con contenido razonable | Que el texto detectado en el documento (OCR de Vision API) contenga el RUT del usuario |
| ¿Quién puede marcar `isIdentityVerified: true`? | Solo la Cloud Function `validateIdentityIA`, en ambos modos | Igual |

**Importante:** en ninguno de los dos modos el usuario puede marcarse a sí
mismo como verificado escribiendo directamente en Firestore. El campo
`isIdentityVerified` (y `municipalVerification`, `reputationPoints`,
`isBlocked`, `banned`, `role`) está protegido en `firestore.rules`
(`userProtectedFieldsUnchanged()`): solo se puede modificar desde
administración o desde una Cloud Function, que usa el SDK de administración
y no está sujeta a esas reglas. Esto se corrigió durante la auditoría del
proyecto — antes, `PerfilProfesional.jsx` escribía `isIdentityVerified: true`
directamente desde el cliente después de subir la selfie, sin pasar nunca
por ninguna validación real ni simulada.

### Cambiar a modo real

1. Crear un proyecto de Google Cloud con Vision API habilitada y una cuenta
   de servicio con permisos sobre esa API.
2. Descargar el JSON de la cuenta de servicio (nunca commitearlo).
3. En `functions/.env`: `IDENTITY_VERIFICATION_MODE=live` y
   `GOOGLE_APPLICATION_CREDENTIALS=./nombre-del-archivo.json`.
4. En producción (Cloud Functions desplegado) no hace falta el archivo
   JSON: el SDK usa automáticamente la cuenta de servicio por defecto del
   entorno de ejecución.

## Google Maps (caso distinto: no es un "modo simulado")

La clave de Google Maps (`VITE_GOOGLE_MAPS_API_KEY`) no tiene un modo mock
en el mismo sentido que los dos anteriores, porque técnicamente Google
diseña esa clave para ser expuesta en el cliente (se restringe por
dominio/HTTP referrer en Google Cloud Console, no por mantenerla en
secreto — a diferencia del token de Mercado Pago o la cuenta de servicio de
Vision, que si son secretos reales). Aun así, exigir una cuenta de Google
Cloud con facturación habilitada es una barrera real para poder clonar y
probar el repositorio, así que `src/pages/Solicitar.jsx` funciona
igualmente sin esa clave: si `VITE_GOOGLE_MAPS_API_KEY` está vacía, el paso
de ubicación muestra un formulario de dirección manual (sin mapa ni
autocompletado) en vez de bloquear el flujo.
