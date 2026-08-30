const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require("cors");
const vision = require("@google-cloud/vision");

admin.initializeApp();
const db = admin.firestore();
const corsHandler = cors({ origin: true });

// =====================================================
// 🔹 MODOS DE OPERACIÓN
// =====================================================
// Este repositorio es público. Para que cualquiera pueda clonarlo, instalar
// dependencias y probar la aplicación de punta a punta SIN necesitar una
// cuenta real de Mercado Pago ni de Google Cloud Vision, cada integración
// externa tiene un modo "mock" (simulado) que reemplaza la llamada real por
// un flujo equivalente dentro de la propia app.
//
// Por defecto (ver functions/.env.example) ambas integraciones parten en
// modo "mock". Para conectar credenciales reales y pasar a modo "live",
// se cambia el valor de PAYMENTS_MODE / IDENTITY_VERIFICATION_MODE en
// functions/.env y se completan las credenciales correspondientes — el
// código de este archivo no cambia.
const PAYMENTS_MODE = (process.env.PAYMENTS_MODE || "mock").toLowerCase();               // "mock" | "live"
const IDENTITY_VERIFICATION_MODE = (process.env.IDENTITY_VERIFICATION_MODE || "mock").toLowerCase(); // "mock" | "live"

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

if (PAYMENTS_MODE === "live" && !MP_ACCESS_TOKEN) {
  console.warn(
    "⚠️  PAYMENTS_MODE=live pero falta MP_ACCESS_TOKEN en functions/.env. " +
    "Los endpoints de Mercado Pago fallarán hasta que esté configurado."
  );
}

// El cliente de Vision solo se instancia si vamos a usarlo de verdad;
// en modo mock ni siquiera se requiere el paquete configurado con credenciales.
const visionClient =
  IDENTITY_VERIFICATION_MODE === "live"
    ? new vision.ImageAnnotatorClient(
        process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS }
          : undefined
      )
    : null;

// =====================================================
// 🔹 IA: VALIDACIÓN DE IDENTIDAD
// =====================================================
exports.validateIdentityIA = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const { imageBase64, expectedRut } = data;

  if (!imageBase64 || !expectedRut) {
    throw new functions.https.HttpsError('invalid-argument', 'Faltan datos para la validación.');
  }

  // Se verifica que el RUT recibido corresponda al del propio usuario
  // autenticado, para que nadie pueda validar la identidad de otra
  // persona invocando esta función con un RUT ajeno.
  const ownerSnap = await db.collection("users").doc(context.auth.uid).get();
  const ownerRut = String(ownerSnap.data()?.profile?.rut || "").replace(/[^0-9kK]/g, "").toLowerCase();
  const suppliedRut = String(expectedRut).replace(/[^0-9kK]/g, "").toLowerCase();
  if (!ownerRut || ownerRut !== suppliedRut) {
    throw new functions.https.HttpsError('permission-denied', 'El RUT no coincide con el de tu cuenta.');
  }

  let result;

  if (IDENTITY_VERIFICATION_MODE === "mock") {
    // ── Modo simulado ──────────────────────────────────
    // No llama a Google Cloud Vision. Verifica únicamente que se haya
    // enviado una imagen con contenido razonable (evita aprobar un envío
    // vacío o corrupto) y aprueba la verificación, replicando el resultado
    // que entregaría el flujo real para efectos de demostración del
    // producto, sin requerir una cuenta de Google Cloud.
    const looksLikeImage = typeof imageBase64 === "string" && imageBase64.length > 500;
    result = {
      isValid: looksLikeImage,
      mode: "mock",
      message: looksLikeImage
        ? "Identidad verificada (modo simulado)."
        : "La imagen recibida no es válida.",
    };
  } else {
    // ── Modo real (Google Cloud Vision) ─────────────────
    try {
      const [visionResult] = await visionClient.textDetection({
        image: { content: imageBase64 }
      });
      const detectedText = visionResult.fullTextAnnotation ? visionResult.fullTextAnnotation.text : "";
      const cleanDetected = detectedText.replace(/[^0-9kK]/g, "").toLowerCase();
      const isValid = cleanDetected.includes(ownerRut);
      result = {
        isValid,
        mode: "live",
        message: isValid ? "RUT verificado" : "El RUT no coincide.",
      };
    } catch (error) {
      console.error("VISION ERROR:", error);
      throw new functions.https.HttpsError('internal', 'Error al procesar con IA.');
    }
  }

  // Solo esta Cloud Function (con el SDK de administración, que no está
  // sujeto a firestore.rules) puede marcar isIdentityVerified — el cliente
  // no tiene permiso para escribir ese campo directamente (ver
  // firestore.rules, PROTECTED_USER_FIELDS). Así, ni en modo mock ni en
  // modo real, un usuario puede autodeclararse verificado.
  if (result.isValid) {
    await db.collection("users").doc(context.auth.uid).update({
      isIdentityVerified: true,
      identityVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      identityVerificationMode: result.mode,
    });
  }

  return { success: true, ...result };
});

// =====================================================
// 🔹 PAGOS — helpers compartidos
// =====================================================

/**
 * Crea un registro de pago simulado en Firestore y devuelve la URL interna
 * de checkout simulado (PagoSimulado.jsx) que el frontend debe abrir en vez
 * del init_point real de Mercado Pago.
 */
async function crearPagoSimulado({ baseUrl, amount, title, metadata, successPath, failurePath }) {
  const ref = db.collection("mockPayments").doc();
  await ref.set({
    amount: Number(amount),
    title,
    metadata,
    successPath,
    failurePath,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { success: true, init_point: `${baseUrl}/pago-simulado/${ref.id}`, mode: "mock" };
}

// =====================================================
// 🔹 MERCADO PAGO: CREAR PAGO (SOLICITUD FLASH)
// =====================================================
exports.crearPago = functions.https.onCall(async (data, context) => {
  const payload = data.requestId ? data : (data.data || {});
  const { requestId, price, title, returnUrl } = payload;

  if (!requestId || !price) {
    throw new functions.https.HttpsError('invalid-argument', 'Faltan requestId o price.');
  }

  const baseUrl = returnUrl || "https://gasfiter-final.web.app";

  if (PAYMENTS_MODE === "mock") {
    return crearPagoSimulado({
      baseUrl,
      amount: price,
      title: title || "Prioridad Flash - Servicio",
      metadata: { type: "flash_request", requestId: String(requestId) },
      successPath: "/cliente/dashboard?pago=exitoso",
      failurePath: "/cliente/dashboard?pago=fallido",
    });
  }

  // ── Modo real (Mercado Pago) ─────────────────────────
  if (!MP_ACCESS_TOKEN) {
    throw new functions.https.HttpsError('failed-precondition', 'Pagos no configurados en este entorno (falta MP_ACCESS_TOKEN).');
  }

  const preferencePayload = {
    items: [{
      title: title || "Prioridad Flash - Servicio",
      quantity: 1,
      currency_id: "CLP",
      unit_price: Number(price),
    }],
    external_reference: String(requestId),
    metadata: { type: "flash_request" },
    back_urls: {
      success: `${baseUrl}/cliente/dashboard?pago=exitoso`,
      failure: `${baseUrl}/cliente/dashboard?pago=fallido`,
    },
    auto_return: "approved"
  };

  try {
    const mpRes = await axios.post(
      "https://api.mercadopago.com/checkout/preferences",
      preferencePayload,
      { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } }
    );
    return { success: true, init_point: mpRes.data.init_point, mode: "live" };
  } catch (err) {
    console.error("❌ ERROR CREAR PAGO:", err.response?.data || err.message);
    throw new functions.https.HttpsError('internal', 'Error MP.');
  }
});

// =====================================================
// 🔹 MERCADO PAGO: COMPRAR CRÉDITOS
// =====================================================
exports.comprarCreditosMP = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Falta el token de autorización." });
      }

      const idToken = authHeader.split("Bearer ")[1];
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (tokenError) {
        return res.status(401).json({ error: "Token inválido. Vuelve a iniciar sesión." });
      }

      const uid = decodedToken.uid;
      const { packId, price, credits, label, returnUrl } = req.body;

      if (!packId || !price || !credits) {
        return res.status(400).json({ error: "Faltan datos del paquete." });
      }

      const baseUrl = returnUrl || "https://gasfiter-final.web.app";

      if (PAYMENTS_MODE === "mock") {
        const result = await crearPagoSimulado({
          baseUrl,
          amount: price,
          title: `Pack ${label} - ${credits} Diamantes`,
          metadata: {
            type: "credit_purchase",
            user_id: uid,
            credits_amount: credits,
            pack_id: packId,
          },
          successPath: "/prof/billetera?pago=exitoso",
          failurePath: "/prof/billetera?pago=fallido",
        });
        return res.status(200).json({ init_point: result.init_point, mode: "mock" });
      }

      // ── Modo real (Mercado Pago) ───────────────────────
      if (!MP_ACCESS_TOKEN) {
        return res.status(500).json({ error: "Pagos no configurados en este entorno (falta MP_ACCESS_TOKEN)." });
      }

      const preferencePayload = {
        items: [{
          title: `Pack ${label} - ${credits} Diamantes`,
          quantity: 1,
          currency_id: "CLP",
          unit_price: Number(price),
        }],
        external_reference: `${uid}_${Date.now()}`,
        metadata: {
          user_id: uid,
          credits_amount: credits,
          pack_id: packId,
          type: "credit_purchase"
        },
        back_urls: {
          success: `${baseUrl}/prof/billetera?pago=exitoso`,
          failure: `${baseUrl}/prof/billetera?pago=fallido`,
        },
        auto_return: "approved"
      };

      const mpRes = await axios.post(
        "https://api.mercadopago.com/checkout/preferences",
        preferencePayload,
        { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } }
      );

      return res.status(200).json({ init_point: mpRes.data.init_point, mode: "live" });

    } catch (err) {
      console.error("❌ ERROR CRÉDITOS:", err.response?.data || err.message);
      return res.status(500).json({ error: "Error interno al procesar el pago." });
    }
  });
});

// =====================================================
// 🔹 PAGO SIMULADO: CONFIRMACIÓN
// =====================================================
// Reemplaza al webhook de Mercado Pago cuando PAYMENTS_MODE=mock. La
// aprueba/rechaza directamente la persona usuaria desde PagoSimulado.jsx
// (frontend), y esta función aplica exactamente el mismo efecto que
// aplicaría el webhook real: acreditar créditos o marcar la solicitud
// como prioritaria.
exports.confirmarPagoSimulado = functions.https.onCall(async (data, context) => {
  if (PAYMENTS_MODE !== "mock") {
    throw new functions.https.HttpsError('failed-precondition', 'Esta función solo está disponible en modo de pagos simulado.');
  }
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const { paymentId, approve } = data;
  if (!paymentId) {
    throw new functions.https.HttpsError('invalid-argument', 'Falta paymentId.');
  }

  const ref = db.collection("mockPayments").doc(paymentId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Pago simulado no encontrado.');
  }

  const payment = snap.data();
  if (payment.status !== "pending") {
    return { success: true, alreadyProcessed: true, redirectPath: approve ? payment.successPath : payment.failurePath };
  }

  if (!approve) {
    await ref.update({ status: "rejected", resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true, redirectPath: payment.failurePath };
  }

  const metadata = payment.metadata || {};

  if (metadata.type === "credit_purchase") {
    const userRef = db.collection("users").doc(metadata.user_id);
    const transRef = db.collection("transactions").doc();
    await db.runTransaction(async (t) => {
      t.update(userRef, {
        "credits.balance": admin.firestore.FieldValue.increment(Number(metadata.credits_amount)),
        "credits.totalEarned": admin.firestore.FieldValue.increment(Number(metadata.credits_amount)),
      });
      t.set(transRef, {
        userId: metadata.user_id,
        amount: Number(metadata.credits_amount),
        type: "purchase",
        status: "completed",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentId: `mock_${paymentId}`,
      });
      t.update(ref, { status: "approved", resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
  } else if (metadata.type === "flash_request") {
    await db.runTransaction(async (t) => {
      t.update(db.collection("requests").doc(metadata.requestId), {
        status: "pendiente",
        isPriority: true,
        priorityLevel: 1,
        "payment.status": "approved",
        "payment.paymentId": `mock_${paymentId}`,
        "payment.updatedAt": admin.firestore.FieldValue.serverTimestamp(),
      });
      t.update(ref, { status: "approved", resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
  } else {
    await ref.update({ status: "approved", resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
  }

  return { success: true, redirectPath: payment.successPath };
});

// =====================================================
// 🔹 MERCADO PAGO: WEBHOOK (solo modo real)
// =====================================================
exports.mpWebhook = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    try {
      res.sendStatus(200);

      if (PAYMENTS_MODE !== "live") {
        console.warn("mpWebhook invocado pero PAYMENTS_MODE no es 'live'. Ignorado.");
        return;
      }

      const topic = req.query.topic || req.query.type;
      const id = req.query.id || req.body?.data?.id;

      if (!id || topic !== "payment") return;

      const payRes = await axios.get(`https://api.mercadopago.com/v1/payments/${id}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });

      const payment = payRes.data;
      const metadata = payment.metadata || {};

      if (metadata.type === "credit_purchase" && payment.status === "approved") {
        const userId = metadata.user_id;
        const creditsToAdd = Number(metadata.credits_amount);

        const userRef = db.collection("users").doc(userId);
        const transRef = db.collection("transactions").doc();

        await db.runTransaction(async (t) => {
          t.update(userRef, {
            "credits.balance": admin.firestore.FieldValue.increment(creditsToAdd),
            "credits.totalEarned": admin.firestore.FieldValue.increment(creditsToAdd)
          });
          t.set(transRef, {
            userId,
            amount: creditsToAdd,
            type: "purchase",
            status: "completed",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentId: String(payment.id)
          });
        });
      }
      else if (payment.external_reference && payment.status === "approved") {
        const requestId = payment.external_reference;
        await db.collection("requests").doc(requestId).update({
          status: "pendiente",
          isPriority: true,
          priorityLevel: 1,
          "payment.status": payment.status,
          "payment.paymentId": String(payment.id),
          "payment.updatedAt": admin.firestore.FieldValue.serverTimestamp(),
        });
      }

    } catch (err) {
      console.error("❌ WEBHOOK ERROR:", err.message);
    }
  });
});
