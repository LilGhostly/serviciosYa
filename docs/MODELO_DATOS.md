# Modelo de datos — ServiciosYa (Cloud Firestore)

Este documento describe las colecciones reales que usa el código (verificado
contra `src/pages/*.jsx` y `functions/index.js`), no un modelo idealizado.

## `users/{uid}`

Un documento por usuario, con `role` como discriminador de tipo.

```js
{
  role: "cliente" | "profesional" | "admin",
  email: string,

  profile: {
    name: string,
    rut: string,
    phone: string,
    birthDate: string,
    region: string,
    comuna: string,
    rubro: string,          // solo profesionales — ver src/data/categories.js
  },

  // Verificación de identidad (IA)
  isIdentityVerified: boolean,
  identityReviewStatus: "pending" | "approved" | "rejected",

  // Verificación municipal (capa de innovación — ver docs/INNOVACION.md)
  municipalVerification: {
    active: boolean,
    comuna: string,
    verifiedAt: string,     // ISO date
  } | undefined,

  // Reputación / moderación
  reputationPoints: number, // strikes acumulados — suspendido al llegar a STRIKE_LIMIT (3)
  isBlocked: boolean,
  cancelCount: number,
  penaltyUntil: timestamp | null,
  banned: boolean | undefined,

  // Calidad (solo profesionales)
  ratingStats: {
    totalStars: number,
    totalReviews: number,
    tags: Record<string, number>,
  },

  // Créditos (solo profesionales)
  credits: {
    balance: number,        // 10 créditos de bienvenida al registrarse
    totalSpent: number,
  },

  createdAt: number,
  registeredFrom: "web",
}
```

## `requests/{requestId}`

Una solicitud de servicio, publicada por un cliente.

```js
{
  clientId: string,               // uid del cliente que publicó
  problemType: string,            // rubro solicitado (ver src/data/categories.js)
  description: string,
  address: string,
  comuna: string,
  location: { lat: number, lng: number },
  photos: string[],               // URLs de Storage
  urgency: "normal" | "urgente",
  status:
    | "pendiente"
    | "asignado"
    | "en_progreso"
    | "esperando_confirmacion"
    | "completado"
    | "cancelado_cliente"
    | "cancelado_profesional",

  // Se completan al ser tomada por un profesional (ver ServiciosDisponibles.jsx)
  acceptedById: string,
  professionalName: string,
  professionalPhone: string,
  professionalRatingAvg: number | null,
  acceptedAt: timestamp,
  laborCost: number,
  materialsCost: number,
  materialsDetail: string,
  proposedPrice: number,
  proposedBy: string,
  proposalStatus: string,

  // Seguridad en terreno
  securityPin: string,            // generado por src/lib/business.js → generateSecurityPin()
  pinAttempts: number,
  startedAt: timestamp,

  createdAt: timestamp,
}
```

## `chats/{requestId}`

Documento padre de la conversación (uno por solicitud), creado al momento en
que un profesional postula.

```js
{
  clientId: string,
  professionalId: string,
  lastMessage: string,
  lastUpdate: timestamp,
  createdAt: timestamp,
}
```

### `chats/{requestId}/messages/{messageId}` (subcolección)

```js
{
  system: boolean,
  type: "proposal" | undefined,
  text: string,
  details: { laborCost, materialsCost, materialsDetail } | undefined,
  totalPrice: number | undefined,
  createdAt: timestamp,
}
```

## `transactions/{txId}`

Historial de movimientos de créditos de un profesional (billetera).

```js
{
  userId: string,
  amount: number,           // negativo = gasto, positivo = recarga
  type: "use" | "purchase",
  description: string,
  requestId: string | undefined,
  createdAt: timestamp,
}
```

## `notifications/{notifId}`

```js
{
  userId: string,            // destinatario
  type: string,              // "proposal_accepted" | "new_proposal" | ...
  title: string,
  message: string,
  requestId: string,
  read: boolean,
  createdAt: timestamp,
}
```

## `reports/{reportId}`

Reportes de mal comportamiento, usados para calcular strikes.

```js
{
  requestId: string,
  reporterId: string,
  reportedUserId: string,
  reason: string,
  weight: number,            // puntos de strike que aporta este reporte
  isRecurrent: boolean,
  createdAt: timestamp,
}
```

## `tickets/{ticketId}`

Tickets del Centro de Ayuda / formulario de Contacto.

```js
{
  userId: string,
  subject: string,
  message: string,
  status: string,
  createdAt: timestamp,
}
```

## `metas/{uid}_{año}`

Meta de ingresos anual definida por un profesional (`AnalisisProfesional.jsx`).
El id del documento concatena el uid y el año para evitar duplicados.

```js
{
  uid: string,
  anio: number,
  metaIngresos: number,
}
```

## `mockPayments/{paymentId}`

Registro de pagos del checkout simulado (ver `docs/PAGOS_Y_VERIFICACION.md`).
Solo existe cuando `PAYMENTS_MODE=mock`. Se crea y actualiza exclusivamente
desde Cloud Functions con el SDK de administración; el frontend solo lo lee
para mostrar el detalle en `PagoSimulado.jsx`.

```js
{
  amount: number,
  title: string,
  metadata: object,          // mismo shape que enviaría Mercado Pago real
  successPath: string,       // ruta interna a la que redirigir si se aprueba
  failurePath: string,       // ruta interna a la que redirigir si se rechaza
  status: "pending" | "approved" | "rejected",
  createdAt: timestamp,
  resolvedAt: timestamp | undefined,
}
```

## `bannedRuts/{rut}`

Lista negra de RUT baneados definitivamente por administración.

```js
{
  rut: string,
  name: string,
  email: string,
  bannedAt: timestamp,
  reason: string,
}
```

## Diagrama entidad-relación (simplificado)

```
users (1) ────< requests (clientId)
users (1) ────< requests (acceptedById)
requests (1) ──── chats (1:1, mismo id)
chats (1) ────< messages
users (1) ────< transactions
users (1) ────< notifications
users (1) ────< reports (como reportante o reportado)
users (1) ────< tickets
users (1) ────< metas
```

No se usa un motor relacional: todas las relaciones se resuelven por
referencia de `uid`/`requestId` almacenado como string, consultado con
`where(...)` en el cliente o desde Cloud Functions.
