# Arquitectura — ServiciosYa

## 1. Visión general

ServiciosYa sigue una arquitectura **serverless orientada a Firebase**: no
existe un servidor propio de aplicación; el frontend (SPA en React) habla
directamente con los servicios administrados de Firebase (Auth, Firestore,
Storage) protegidos por reglas de seguridad declarativas, y solo las
operaciones que requieren una credencial de terceros (Mercado Pago, Google
Cloud Vision) pasan por Cloud Functions.

```
Cliente (navegador)
   │
   ├─ Firebase Auth ──────────► autenticación de usuarios
   ├─ Cloud Firestore ────────► lectura/escritura directa (protegida por firestore.rules)
   ├─ Firebase Storage ───────► subida/lectura de imágenes (protegida por storage.rules)
   └─ Cloud Functions (HTTPS) ► crearPago, comprarCreditosMP, mpWebhook, validateIdentityIA
                                  (únicas responsables de credenciales sensibles)
```

## 2. Componentes

### 2.1 Frontend (`src/`)

- **`pages/`** — una página por ruta (React Router). Cada página gestiona su
  propio estado y llamadas a Firebase; no hay una capa de "servicios" para
  Firestore (se llama directamente desde los componentes). Esto es
  aceptable para el tamaño actual del proyecto, pero si el proyecto crece,
  se recomienda extraer un `src/services/` por dominio (solicitudes,
  usuarios, pagos) para reducir el acoplamiento entre UI y acceso a datos.
- **`lib/business.js`** — lógica de negocio pura (PIN, strikes, niveles de
  verificación, créditos), sin dependencias de React ni Firebase. Se creó
  específicamente para poder probarla con pruebas unitarias.
- **`data/categories.js`** — catálogo único de rubros/categorías de
  servicio, usado tanto por el registro de profesionales como por la
  publicación de solicitudes (antes eran listas separadas y
  desincronizadas — ver Sección 4).
- **`context/UserContext.jsx`** — estado global de sesión (usuario
  autenticado + su documento de Firestore).
- **`services/paymentService.js`** — cliente para invocar las Cloud
  Functions de pago desde el frontend.

### 2.2 Backend (`functions/`)

Cuatro funciones HTTPS/Callable:

| Función | Tipo | Propósito |
|---|---|---|
| `validateIdentityIA` | Callable | Analiza una selfie/cédula con Vision API y marca `isIdentityVerified` |
| `crearPago` | Callable | Crea una preferencia de pago de Mercado Pago para un servicio |
| `comprarCreditosMP` | HTTPS | Crea una preferencia de pago para la compra de créditos |
| `mpWebhook` | HTTPS | Recibe la confirmación de pago de Mercado Pago y acredita el resultado |

### 2.3 Base de datos (Cloud Firestore)

Ver `docs/MODELO_DATOS.md` para el detalle de colecciones y campos.

## 3. Verificación municipal (capa de innovación)

El nivel de verificación de un profesional (`src/lib/business.js →
getVerificationLevel`) se calcula a partir de dos campos del documento
`users/{uid}`:

```js
isIdentityVerified: boolean            // resultado de validateIdentityIA
municipalVerification: {
  active: boolean,
  comuna: string,
  verifiedAt: string (ISO date)
}
```

En esta iteración del proyecto, el campo `municipalVerification` se activa
manualmente desde el panel de administración (`pages/Admin.jsx`), simulando
la acción que en un escenario real realizaría un funcionario de la OMIL de
la comuna correspondiente, en el marco de un convenio de colaboración (ver
`docs/INNOVACION.md`). No existe todavía una integración automática con
ningún sistema municipal: es un roadmap de producto, no una limitación
técnica del modelo de datos, que ya está preparado para recibirla.

## 4. Decisiones de arquitectura y correcciones aplicadas

Durante la revisión del proyecto se identificaron y corrigieron los
siguientes problemas:

1. **Catálogo de rubros duplicado y desincronizado.** `Solicitar.jsx` (lo
   que un cliente puede pedir) incluía rubros de belleza, arte y mascotas
   que `RegisterProfesional.jsx` (dónde un profesional se registra) no
   ofrecía — un cliente podía pedir un tatuador, pero ningún tatuador podía
   registrarse como tal. Se unificó en `src/data/categories.js`.
2. **Credenciales en el código fuente.** El token de producción de Mercado
   Pago estaba escrito directamente en `functions/index.js`. Se migró a
   variables de entorno (`functions/.env`, no versionado).
3. **Reglas de seguridad inválidas.** `firestore.rules` usaba la regla de
   modo de prueba generada por Firebase, con fecha de expiración ya
   pasada (deniega todo desde esa fecha). `storage.rules` denegaba todo de
   forma incondicional. Ambas se reemplazaron por reglas reales acotadas al
   modelo de datos.
4. **Panel de administración desconectado del modelo de datos real.**
   `Admin.jsx` consultaba una colección `gasfiters` que ya no existe (el
   modelo real usa `users` con `role`), y escribía un estado de solicitud
   (`"aceptado"`) que ningún otro flujo de la aplicación reconoce. Se
   reescribió para operar sobre las colecciones y campos reales.
5. **Lógica de negocio no testeable.** La generación de PIN, la validación
   de intentos y el límite de strikes vivían embebidos dentro de
   componentes de página, con el número `3` repetido (y potencialmente
   desincronizable) en varios archivos. Se extrajo a `src/lib/business.js`.
6. **Autoverificación de identidad.** `PerfilProfesional.jsx` subía la
   selfie de verificación y marcaba `isIdentityVerified: true` directamente
   desde el cliente, sin llamar nunca a la Cloud Function
   `validateIdentityIA` — cualquiera podía autodeclararse verificado. Se
   corrigió en tres capas: el frontend ahora llama a la Cloud Function, la
   función es la única que escribe `isIdentityVerified` (con el SDK de
   administración), y `firestore.rules` bloquea explícitamente que un
   usuario modifique ese campo (y otros de confianza/moderación) sobre su
   propio documento. Ver `docs/PAGOS_Y_VERIFICACION.md`.
7. **Dependencia de credenciales reales para poder demostrar el proyecto.**
   El token de Mercado Pago y la cuenta de servicio de Vision API, aun
   estando en variables de entorno, seguían siendo un requisito para que
   cualquiera pudiera clonar el repositorio público y probar la app de
   punta a punta. Se agregó un modo simulado (`PAYMENTS_MODE` /
   `IDENTITY_VERIFICATION_MODE`, ambos en `mock` por defecto) que
   reemplaza esas integraciones por un flujo equivalente dentro de la
   propia app, sin credenciales externas. Ver `docs/PAGOS_Y_VERIFICACION.md`.
8. **Índices compuestos de Firestore incompletos.** Varias pantallas
   centrales —`ServiciosDisponibles.jsx` (buscar trabajos disponibles por
   rubro), `MisTrabajos.jsx` y `HistorialProfesional.jsx` (mis trabajos
   como profesional), `Notifications.jsx`— usan combinaciones de filtros
   (`where` + `where`/`orderBy` sobre campos distintos) que requieren un
   índice compuesto explícito en Firestore. `firestore.indexes.json` solo
   cubría un subconjunto (quedaba, además, un índice muerto de la
   colección `gasfiters` que ya no existe). Sin el índice correcto,
   Firestore rechaza la consulta en tiempo de ejecución con un error de
   "se requiere un índice" — es decir, la pantalla de trabajos
   disponibles para postular (el flujo central del negocio) podía fallar
   para cualquier profesional en un despliegue nuevo. Se reescribió el
   archivo completo cubriendo cada combinación de filtros realmente usada
   en el código.

## 5. Limitaciones conocidas (pendientes, documentadas y no ocultas)

- **Perfil público mezcla datos sensibles y públicos en un mismo
  documento.** El documento `users/{uid}` de un profesional contiene tanto
  campos públicos (nombre, rubro, comuna) como sensibles (RUT, teléfono,
  créditos). El frontend filtra qué campos muestra, pero las reglas de
  Firestore, al permitir la lectura del documento completo de cualquier
  profesional, no impiden una lectura directa contra la API de Firestore
  que exponga esos campos. La solución correcta es separar los datos
  públicos en una subcolección propia (`users/{uid}/public/profile`).
- **El saldo de créditos se descuenta con un `updateDoc` directo del
  propio profesional.** `firestore.rules` protege campos como
  `isIdentityVerified` o `reputationPoints` para que nadie pueda
  modificarlos sobre su propio documento, pero `credits` queda fuera de
  esa protección porque `ServiciosDisponibles.jsx` necesita descontarlo al
  postular. Esto significa que, en teoría, alguien podría escribir un
  balance de créditos arbitrario directamente contra Firestore. La
  solución correcta es mover también esa mutación a una Cloud Function que
  valide el monto exacto contra el costo real de la postulación.
- **Bundle de frontend sin code-splitting.** El build de producción genera
  un único archivo JS de ~1.9 MB. Se recomienda `React.lazy` por ruta y
  `manualChunks` en la configuración de Vite para reducir el tiempo de
  carga inicial.
- **Sin CI configurado.** Las pruebas (`npm run test`) y el build
  (`npm run build`) se ejecutan manualmente; se recomienda un workflow de
  GitHub Actions que los ejecute en cada push/PR.
