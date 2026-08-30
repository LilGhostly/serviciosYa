/**
 * src/lib/business.js
 *
 * Reglas de negocio centrales de ServiciosYa, extraídas de los componentes
 * de página como funciones puras. Esto permite:
 *   1) Probarlas con pruebas unitarias sin tener que montar componentes React.
 *   2) Evitar que el mismo número mágico (ej. el límite de 3 strikes) esté
 *      repetido y potencialmente desincronizado en Dashboard.jsx, ClientProfile.jsx,
 *      CentroAyuda.jsx, etc.
 *
 * Ninguna función de este archivo accede a Firebase directamente: reciben
 * datos y devuelven resultados, para que sean fáciles de testear.
 */

/* ─────────────────────────────────────────────
   PIN DE SEGURIDAD
───────────────────────────────────────────── */

/**
 * Genera un PIN de seguridad de 4 dígitos (1000-9999) que el cliente
 * entrega al profesional para confirmar el inicio del servicio en terreno.
 * @returns {string} PIN de 4 dígitos, ej. "4821"
 */
export function generateSecurityPin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Valida que el PIN ingresado por el profesional coincida con el PIN
 * generado para la solicitud, y controla el número de intentos.
 * @param {string} inputPin - PIN ingresado por el profesional.
 * @param {string} expectedPin - PIN almacenado en la solicitud.
 * @param {number} attemptsSoFar - Intentos fallidos previos.
 * @param {number} maxAttempts - Máximo de intentos permitidos (default 3).
 * @returns {{ valid: boolean, attemptsRemaining: number, blocked: boolean }}
 */
export function validateSecurityPin(inputPin, expectedPin, attemptsSoFar = 0, maxAttempts = 3) {
  const valid = String(inputPin).trim() === String(expectedPin).trim();
  const attemptsRemaining = valid ? maxAttempts - attemptsSoFar : maxAttempts - (attemptsSoFar + 1);
  return {
    valid,
    attemptsRemaining: Math.max(attemptsRemaining, 0),
    blocked: !valid && attemptsRemaining <= 0,
  };
}

/* ─────────────────────────────────────────────
   SISTEMA DE STRIKES / REPUTACIÓN
───────────────────────────────────────────── */

/** Número de strikes que suspenden automáticamente una cuenta. */
export const STRIKE_LIMIT = 3;

/** Peso de un strike por conducta grave (acoso, suplantación, etc.). */
export const SEVERE_STRIKE_WEIGHT = 3;

/**
 * Determina el estado de reputación de un usuario (cliente o profesional)
 * a partir de su cantidad de strikes acumulados.
 * @param {number} strikes - Puntos de conducta acumulados.
 * @returns {{ level: "ok"|"warning"|"danger", suspended: boolean, remaining: number, label: string }}
 */
export function getReputationStatus(strikes = 0) {
  const remaining = Math.max(STRIKE_LIMIT - strikes, 0);
  const suspended = strikes >= STRIKE_LIMIT;

  let level = "ok";
  if (suspended) level = "danger";
  else if (strikes >= 2) level = "danger";
  else if (strikes >= 1) level = "warning";

  const label = strikes === 0
    ? "Conducta impecable"
    : `${strikes} strike${strikes > 1 ? "s" : ""} acumulado${strikes > 1 ? "s" : ""}`;

  return { level, suspended, remaining, label };
}

/* ─────────────────────────────────────────────
   NIVELES DE VERIFICACIÓN DEL PROFESIONAL
───────────────────────────────────────────── */

/**
 * Niveles de confianza que puede tener un profesional en su perfil.
 * "municipal" es la capa de innovación: verificación otorgada por la OMIL
 * de la comuna del profesional, en el marco de un convenio de colaboración
 * (ver docs/INNOVACION.md). No sustituye a la verificación por IA: la
 * complementa como un nivel superior y opcional.
 */
export const VERIFICATION_LEVELS = {
  BASICO: "basico",
  IDENTIDAD: "identidad",
  MUNICIPAL: "municipal",
};

export const VERIFICATION_META = {
  [VERIFICATION_LEVELS.BASICO]: {
    label: "Registro básico",
    description: "Cuenta creada, identidad aún no verificada.",
    icon: "circle",
    rank: 0,
  },
  [VERIFICATION_LEVELS.IDENTIDAD]: {
    label: "Identidad verificada",
    description: "Cédula validada mediante análisis documental automatizado (IA).",
    icon: "shield-check",
    rank: 1,
  },
  [VERIFICATION_LEVELS.MUNICIPAL]: {
    label: "Verificado por tu Municipalidad",
    description: "Identidad y antecedentes confirmados por la OMIL de su comuna.",
    icon: "landmark",
    rank: 2,
  },
};

/**
 * Determina el nivel de verificación vigente de un profesional a partir
 * de los flags almacenados en su documento de Firestore (colección "users").
 * @param {{ isIdentityVerified?: boolean, municipalVerification?: { active?: boolean } }} profile
 * @returns {string} Una de las claves de VERIFICATION_LEVELS.
 */
export function getVerificationLevel(profile = {}) {
  if (profile?.municipalVerification?.active) return VERIFICATION_LEVELS.MUNICIPAL;
  if (profile?.isIdentityVerified) return VERIFICATION_LEVELS.IDENTIDAD;
  return VERIFICATION_LEVELS.BASICO;
}

/**
 * Arma la lista de "sub-sellos" del pasaporte municipal ampliado, a partir
 * del objeto `municipalVerification` guardado en Firestore. Cada uno
 * representa un trámite público real que la OMIL/Registro Civil/Migraciones
 * ya realiza en Chile (ver src/data/municipalMockRegistry.js y
 * docs/INNOVACION.md) — acá solo se listan los que sí tienen dato.
 * @param {object} municipalVerification
 * @returns {{ icon: string, label: string }[]}
 */
export function getMunicipalBadges(municipalVerification = {}) {
  const badges = [];
  if (municipalVerification?.inscritoOMIL) {
    badges.push({ icon: "📋", label: "Inscrito en la Bolsa Nacional de Empleo (OMIL)" });
  }
  if (municipalVerification?.titulo?.tiene) {
    const { carrera, institucion } = municipalVerification.titulo;
    badges.push({ icon: "🎓", label: `Título verificado: ${carrera}${institucion ? ` — ${institucion}` : ""}` });
  }
  if (municipalVerification?.nacionalidad === "Extranjera" && municipalVerification?.categoriaMigratoria) {
    badges.push({ icon: "🌎", label: `Estado migratorio: ${municipalVerification.categoriaMigratoria}` });
  } else if (municipalVerification?.nacionalidad === "Chilena") {
    badges.push({ icon: "🇨🇱", label: "Nacionalidad chilena confirmada" });
  }
  return badges;
}


/* ─────────────────────────────────────────────
   CRÉDITOS
───────────────────────────────────────────── */

/**
 * Calcula el precio por crédito de un paquete, usado para mostrar el
 * ahorro relativo entre paquetes en ComprarCreditos.jsx.
 * @param {number} price - Precio total del paquete en CLP.
 * @param {number} credits - Cantidad de créditos del paquete.
 * @returns {number} Precio unitario por crédito, redondeado.
 */
export function pricePerCredit(price, credits) {
  if (!credits) return 0;
  return Math.round(price / credits);
}

/**
 * Verifica si un profesional tiene créditos suficientes para postular
 * a una solicitud.
 * @param {number} currentBalance - Créditos disponibles.
 * @param {number} cost - Costo en créditos de la postulación.
 * @returns {boolean}
 */
export function hasSufficientCredits(currentBalance = 0, cost = 1) {
  return currentBalance >= cost;
}
