/**
 * municipalMockRegistry.js
 *
 * Simula la respuesta que, en un escenario real, entregarían tres sistemas
 * públicos chilenos distintos al consultar el RUT de un profesional:
 *
 *  1. OMIL / Bolsa Nacional de Empleo (BNE) — bne.cl
 *     Confirma si la persona está inscrita como cesante buscando empleo
 *     en la OMIL de su comuna (trámite gratuito y presencial real).
 *
 *  2. Servicio de Registro Civil e Identificación (SRCeI) — registrocivil.cl
 *     Emite el "Certificado de Título Profesional": las universidades e
 *     institutos remiten mensualmente al Registro Civil la nómina de
 *     títulos otorgados, así que el SRCeI puede confirmar carrera,
 *     institución y nivel (técnico/profesional/universitario).
 *
 *  3. Servicio Nacional de Migraciones (antes "Extranjería")
 *     Confirma la categoría migratoria de una persona extranjera
 *     (Residente Definitivo, Residente Temporal, etc.) o si es chilena.
 *
 * IMPORTANTE: esto es una SIMULACIÓN para efectos de la memoria de título.
 * ServiciosYa no tiene ni pretende tener un convenio real con estas
 * instituciones — ver docs/INNOVACION.md para el alcance real del
 * proyecto. Ningún dato real de personas se consulta ni almacena aquí.
 */

/** Pequeño set de RUTs de prueba con resultados fijos, para demos consistentes. */
const CASOS_DEMO = {
  "11111111-1": {
    inscritoOMIL: true,
    fechaInscripcionOMIL: "2026-03-14",
    titulo: { tiene: true, carrera: "Técnico en Electricidad", institucion: "INACAP", nivel: "Técnico" },
    nacionalidad: "Chilena",
    categoriaMigratoria: null,
  },
  "22222222-2": {
    inscritoOMIL: true,
    fechaInscripcionOMIL: "2026-01-22",
    titulo: { tiene: false, carrera: "", institucion: "", nivel: "" },
    nacionalidad: "Extranjera",
    categoriaMigratoria: "Residente Definitivo",
  },
  "33333333-3": {
    inscritoOMIL: false,
    fechaInscripcionOMIL: "",
    titulo: { tiene: true, carrera: "Ingeniería en Construcción", institucion: "Universidad de Santiago", nivel: "Profesional" },
    nacionalidad: "Chilena",
    categoriaMigratoria: null,
  },
};

const NIVELES = ["Técnico", "Profesional", "Universitario"];
const CARRERAS = [
  "Técnico en Gasfitería", "Técnico Eléctrico", "Ingeniería en Construcción",
  "Técnico en Refrigeración y Climatización", "Diseño de Interiores",
  "Terapia Ocupacional", "Pedagogía en Educación Física", "Técnico en Enfermería",
];
const INSTITUCIONES = [
  "INACAP", "DUOC UC", "Universidad de Santiago", "Universidad de Chile",
  "AIEP", "Universidad Tecnológica Metropolitana",
];
const CATEGORIAS_MIGRATORIAS = ["Residente Definitivo", "Residente Temporal", "Permanencia Transitoria"];

/** Genera un índice determinístico a partir del RUT, para que el mismo
 *  RUT siempre devuelva el mismo resultado simulado (sin necesidad de
 *  guardar un registro aparte). */
function hashRut(rut) {
  let h = 0;
  for (let i = 0; i < rut.length; i++) h = (h * 31 + rut.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Simula la consulta a OMIL/BNE + Registro Civil + Migraciones para un RUT.
 * @param {string} rutRaw
 * @returns {{ inscritoOMIL: boolean, fechaInscripcionOMIL: string, titulo: object, nacionalidad: string, categoriaMigratoria: string|null }}
 */
export function simulateConsultaMunicipal(rutRaw) {
  const rut = (rutRaw || "").trim().toUpperCase();
  if (!rut) return null;

  if (CASOS_DEMO[rut]) return { ...CASOS_DEMO[rut] };

  // Para cualquier otro RUT (formato válido o no), generamos un resultado
  // plausible y estable en vez de fallar, para que la demo no dependa de
  // memorizar RUTs de prueba específicos.
  const h = hashRut(rut);
  const inscritoOMIL = h % 3 !== 0; // ~66% de probabilidad
  const tieneTitulo  = h % 2 === 0;
  const esExtranjero = h % 7 === 0; // ~14%, similar a la proporción real de migrantes en Chile

  return {
    inscritoOMIL,
    fechaInscripcionOMIL: inscritoOMIL ? new Date(Date.now() - (h % 200) * 86400000).toISOString().slice(0, 10) : "",
    titulo: tieneTitulo
      ? {
          tiene: true,
          carrera: CARRERAS[h % CARRERAS.length],
          institucion: INSTITUCIONES[h % INSTITUCIONES.length],
          nivel: NIVELES[h % NIVELES.length],
        }
      : { tiene: false, carrera: "", institucion: "", nivel: "" },
    nacionalidad: esExtranjero ? "Extranjera" : "Chilena",
    categoriaMigratoria: esExtranjero ? CATEGORIAS_MIGRATORIAS[h % CATEGORIAS_MIGRATORIAS.length] : null,
  };
}

/**
 * Genera un folio y código de verificación con el mismo formato que usan
 * los certificados digitales reales en Chile (Registro Civil, SII, etc.):
 * un folio correlativo con prefijo de institución/año, y un código
 * alfanumérico corto para "validar" el documento. Es puramente estético
 * — no hay ningún portal real donde ese código se pueda verificar.
 */
export function generarFolioVerificacion() {
  const year = new Date().getFullYear();
  const folio = `OMIL-${year}-${Math.floor(100000 + Math.random() * 900000)}`;
  const codigo = Array.from({ length: 8 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]
  ).join("");
  return { folio, codigo };
}

export { CASOS_DEMO };
