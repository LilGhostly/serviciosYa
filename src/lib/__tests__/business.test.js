import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateSecurityPin,
  validateSecurityPin,
  STRIKE_LIMIT,
  getReputationStatus,
  VERIFICATION_LEVELS,
  getVerificationLevel,
  pricePerCredit,
  hasSufficientCredits,
} from "../business.js";

describe("generateSecurityPin", () => {
  it("genera un PIN de 4 dígitos", () => {
    const pin = generateSecurityPin();
    expect(pin).toMatch(/^\d{4}$/);
  });

  it("siempre está en el rango 1000-9999 (nunca empieza en 0)", () => {
    for (let i = 0; i < 200; i++) {
      const pin = Number(generateSecurityPin());
      expect(pin).toBeGreaterThanOrEqual(1000);
      expect(pin).toBeLessThanOrEqual(9999);
    }
  });

  it("genera valores distintos entre llamadas (no está hardcodeado)", () => {
    const pins = new Set(Array.from({ length: 30 }, () => generateSecurityPin()));
    // Con 30 muestras sobre 9000 valores posibles, es prácticamente imposible
    // obtener el mismo PIN 30 veces si el generador funciona correctamente.
    expect(pins.size).toBeGreaterThan(1);
  });
});

describe("validateSecurityPin", () => {
  it("valida un PIN correcto en el primer intento", () => {
    const result = validateSecurityPin("4821", "4821", 0, 3);
    expect(result.valid).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.attemptsRemaining).toBe(3);
  });

  it("ignora espacios en blanco alrededor del PIN ingresado", () => {
    const result = validateSecurityPin(" 4821 ", "4821", 0, 3);
    expect(result.valid).toBe(true);
  });

  it("rechaza un PIN incorrecto y descuenta un intento", () => {
    const result = validateSecurityPin("0000", "4821", 0, 3);
    expect(result.valid).toBe(false);
    expect(result.attemptsRemaining).toBe(2);
    expect(result.blocked).toBe(false);
  });

  it("bloquea cuando se agotan los intentos permitidos", () => {
    const result = validateSecurityPin("0000", "4821", 2, 3);
    expect(result.valid).toBe(false);
    expect(result.attemptsRemaining).toBe(0);
    expect(result.blocked).toBe(true);
  });

  it("nunca deja attemptsRemaining en negativo", () => {
    const result = validateSecurityPin("0000", "4821", 10, 3);
    expect(result.attemptsRemaining).toBe(0);
  });
});

describe("getReputationStatus / STRIKE_LIMIT", () => {
  it("el límite de suspensión es 3 strikes (regla de negocio del instructivo)", () => {
    expect(STRIKE_LIMIT).toBe(3);
  });

  it("una cuenta sin strikes está en estado óptimo", () => {
    const status = getReputationStatus(0);
    expect(status.level).toBe("ok");
    expect(status.suspended).toBe(false);
    expect(status.remaining).toBe(3);
  });

  it("una cuenta con 1 strike queda en advertencia, no suspendida", () => {
    const status = getReputationStatus(1);
    expect(status.level).toBe("warning");
    expect(status.suspended).toBe(false);
  });

  it("una cuenta con 3 strikes queda suspendida", () => {
    const status = getReputationStatus(3);
    expect(status.suspended).toBe(true);
    expect(status.level).toBe("danger");
    expect(status.remaining).toBe(0);
  });

  it("una cuenta con más de 3 strikes sigue marcada como suspendida (no negativa)", () => {
    const status = getReputationStatus(5);
    expect(status.suspended).toBe(true);
    expect(status.remaining).toBe(0);
  });
});

describe("getVerificationLevel", () => {
  it("un profesional recién registrado está en nivel básico", () => {
    const level = getVerificationLevel({ isIdentityVerified: false });
    expect(level).toBe(VERIFICATION_LEVELS.BASICO);
  });

  it("un profesional con identidad validada por IA sube a nivel 'identidad'", () => {
    const level = getVerificationLevel({ isIdentityVerified: true });
    expect(level).toBe(VERIFICATION_LEVELS.IDENTIDAD);
  });

  it("el sello municipal activo tiene prioridad sobre el resto de los niveles", () => {
    const level = getVerificationLevel({
      isIdentityVerified: true,
      municipalVerification: { active: true, comuna: "Providencia" },
    });
    expect(level).toBe(VERIFICATION_LEVELS.MUNICIPAL);
  });

  it("un sello municipal inactivo (active: false) no otorga el nivel municipal", () => {
    const level = getVerificationLevel({
      isIdentityVerified: true,
      municipalVerification: { active: false },
    });
    expect(level).toBe(VERIFICATION_LEVELS.IDENTIDAD);
  });

  it("no lanza error si el perfil viene vacío o indefinido", () => {
    expect(getVerificationLevel()).toBe(VERIFICATION_LEVELS.BASICO);
    expect(getVerificationLevel({})).toBe(VERIFICATION_LEVELS.BASICO);
  });
});

describe("pricePerCredit", () => {
  it("calcula el precio unitario correctamente", () => {
    expect(pricePerCredit(10000, 10)).toBe(1000);
  });

  it("redondea a un número entero", () => {
    expect(pricePerCredit(10000, 3)).toBe(Math.round(10000 / 3));
  });

  it("devuelve 0 si la cantidad de créditos es 0 (evita división por cero)", () => {
    expect(pricePerCredit(10000, 0)).toBe(0);
  });
});

describe("hasSufficientCredits", () => {
  it("permite postular cuando el saldo alcanza exactamente el costo", () => {
    expect(hasSufficientCredits(4, 4)).toBe(true);
  });

  it("permite postular cuando el saldo es mayor al costo", () => {
    expect(hasSufficientCredits(10, 4)).toBe(true);
  });

  it("rechaza la postulación cuando el saldo es insuficiente", () => {
    expect(hasSufficientCredits(2, 4)).toBe(false);
  });

  it("un profesional urgente cuesta más créditos (6) que uno normal (4), según ServiciosDisponibles.jsx", () => {
    // Documenta la regla de negocio real usada en el flujo de postulación:
    // creditCost = selectedJob.urgency === "urgente" ? 6 : 4
    expect(hasSufficientCredits(5, 4)).toBe(true);
    expect(hasSufficientCredits(5, 6)).toBe(false);
  });
});
