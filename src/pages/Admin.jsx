import { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { STRIKE_LIMIT, VERIFICATION_META, VERIFICATION_LEVELS, getVerificationLevel, getMunicipalBadges } from "../lib/business";
import { simulateConsultaMunicipal, generarFolioVerificacion } from "../data/municipalMockRegistry";

/*
 * NOTA DE ARQUITECTURA (corrección respecto a la versión anterior):
 * Este panel consultaba la colección "gasfiters", que ya no existe en el
 * modelo de datos actual. Todo el resto de la aplicación (registro, login,
 * perfiles, solicitudes) usa la colección "users" con un campo `role`
 * ("profesional" | "cliente"), y el campo real de suspensión es
 * `isBlocked` (no `active`). El panel quedaba completamente desconectado
 * de los datos reales: no mostraba usuarios, y sus acciones no tenían
 * ningún efecto visible en el resto del sistema.
 *
 * Los estados reales de una solicitud (colección "requests") son:
 * "pendiente" → "asignado" → "en_progreso" → "esperando_confirmacion" →
 * "completado", con las variantes "cancelado_cliente" / "cancelado_profesional".
 * El botón "Aceptado" de la versión anterior escribía el valor "aceptado",
 * que ningún otro flujo de la aplicación reconoce.
 */

const REQUEST_STATUS_META = {
  pendiente:               { label: "Pendiente",               tone: "bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  asignado:                { label: "Asignado",                tone: "bg-blue-200 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  en_progreso:             { label: "En progreso",              tone: "bg-indigo-200 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
  esperando_confirmacion:  { label: "Esperando confirmación",   tone: "bg-purple-200 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  completado:              { label: "Completado",               tone: "bg-green-200 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  cancelado_cliente:       { label: "Cancelado (cliente)",      tone: "bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  cancelado_profesional:   { label: "Cancelado (profesional)",  tone: "bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

function statusMeta(status) {
  return REQUEST_STATUS_META[status] || { label: status || "Sin estado", tone: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" };
}

/* Comunas chilenas de ejemplo con OMIL activa, para el selector del sello
   municipal. En una integración real esto vendría de un catálogo de
   convenios vigentes, no de una lista fija en el frontend. */
const COMUNAS_CON_CONVENIO = [
  "Santiago", "Providencia", "Ñuñoa", "Maipú", "Puente Alto",
  "La Florida", "San Bernardo", "Recoleta", "Valparaíso", "Concepción",
];

export default function Admin() {
  const [tab, setTab] = useState("profesionales"); // profesionales | clientes | requests

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Panel de Administración</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gestión de usuarios, verificación municipal y solicitudes.
          </p>
        </div>
        <Link to="/" className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-200 transition">
          ← Volver
        </Link>
      </header>

      <div className="flex gap-6 mb-6 border-b border-slate-300 dark:border-slate-800">
        {[
          { id: "profesionales", label: "Profesionales" },
          { id: "clientes",      label: "Clientes" },
          { id: "requests",      label: "Solicitudes" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-2 text-sm font-medium ${
              tab === t.id ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profesionales" && <ProfesionalesTab />}
      {tab === "clientes" && <ClientesTab />}
      {tab === "requests" && <RequestsTab />}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PROFESIONALES
   Colección real: users, filtrado por role == "profesional"
═══════════════════════════════════════════════ */
function ProfesionalesTab() {
  const [profesionales, setProfesionales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [municipalModalFor, setMunicipalModalFor] = useState(null); // profesional en edición, o null

  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "profesional"));
    const unsub = onSnapshot(q, (snap) => {
      setProfesionales(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const toggleBlocked = async (id, current) => {
    try {
      await updateDoc(doc(db, "users", id), { isBlocked: !current });
    } catch (err) {
      console.error(err);
      alert("Error cambiando el estado de la cuenta.");
    }
  };

  const resetStrikes = async (id) => {
    if (!confirm("¿Reiniciar los strikes de este profesional a 0? Esto no reactiva automáticamente una cuenta suspendida.")) return;
    try {
      await updateDoc(doc(db, "users", id), { reputationPoints: 0 });
    } catch (err) {
      console.error(err);
      alert("Error reiniciando strikes.");
    }
  };

  /* Activa/retira el sello "Verificado por tu Municipalidad".
     Ver docs/INNOVACION.md para el modelo de convenio en que se sustenta.
     Otorgar el sello abre un modal que simula la consulta a OMIL/BNE,
     Registro Civil y Migraciones (ver ConsultaMunicipalModal más abajo). */
  const toggleMunicipalVerification = async (p) => {
    const currentlyActive = p.municipalVerification?.active === true;
    if (currentlyActive) {
      try {
        await updateDoc(doc(db, "users", p.id), {
          municipalVerification: { active: false },
        });
      } catch (err) {
        console.error(err);
        alert("Error actualizando la verificación municipal.");
      }
      return;
    }
    setMunicipalModalFor(p);
  };

  const banProfesional = async (p) => {
    if (!confirm(`¿Banear permanentemente a ${p.profile?.name || "este profesional"}? Esta acción registra su RUT en la lista negra.`)) return;
    try {
      if (p.profile?.rut) {
        await setDoc(doc(db, "bannedRuts", p.profile.rut), {
          rut: p.profile.rut,
          name: p.profile?.name || "",
          email: p.email || "",
          bannedAt: new Date(),
          reason: "Ban aplicado manualmente por administración",
        });
      }
      await updateDoc(doc(db, "users", p.id), { isBlocked: true, banned: true });
    } catch (err) {
      console.error(err);
      alert("Error baneando al profesional.");
    }
  };

  if (loading) return <p className="text-center text-slate-500">Cargando profesionales...</p>;
  if (profesionales.length === 0) return <p className="text-center text-slate-500">No hay profesionales registrados.</p>;

  return (
    <div className="space-y-4">
      {profesionales.map((p) => {
        const level = getVerificationLevel(p);
        const isMunicipal = level === VERIFICATION_LEVELS.MUNICIPAL;
        const strikes = p.reputationPoints || 0;

        return (
          <div key={p.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 backdrop-blur">
            <div className="flex justify-between items-start gap-3">
              <div>
                <h2 className="text-lg font-semibold">{p.profile?.name || "(sin nombre)"}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {p.profile?.rubros?.length ? p.profile.rubros.join(" · ") : (p.profile?.rubro || "Sin rubro")}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`px-2 py-1 text-xs rounded-full ${p.isBlocked ? "bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-green-200 text-green-800 dark:bg-green-900/40 dark:text-green-300"}`}>
                  {p.isBlocked ? "Suspendido" : "Activo"}
                </span>
                <span className={`px-2 py-1 text-[11px] rounded-full ${
                  isMunicipal
                    ? "bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    : level === VERIFICATION_LEVELS.IDENTIDAD
                      ? "bg-blue-200 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                      : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                }`}>
                  {VERIFICATION_META[level].label}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400 mt-3">
              <p><span className="font-medium">Comuna:</span> {p.profile?.comuna || "—"}</p>
              <p><span className="font-medium">RUT:</span> {p.profile?.rut || "—"}</p>
              <p><span className="font-medium">Teléfono:</span> {p.profile?.phone || "—"}</p>
              <p><span className="font-medium">Email:</span> {p.email || "—"}</p>
              <p className={strikes >= STRIKE_LIMIT ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                <span className="font-medium">Strikes:</span> {strikes}/{STRIKE_LIMIT}
              </p>
              {isMunicipal && p.municipalVerification?.comuna && (
                <p><span className="font-medium">OMIL:</span> {p.municipalVerification.comuna}</p>
              )}
            </div>

            {isMunicipal && getMunicipalBadges(p.municipalVerification).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {getMunicipalBadges(p.municipalVerification).map((b, i) => (
                  <span key={i} className="text-[11px] px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300">
                    {b.icon} {b.label}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={() => toggleBlocked(p.id, p.isBlocked)}
                className={`flex-1 min-w-[140px] py-2 rounded-xl text-sm font-semibold transition active:scale-[0.98] ${
                  p.isBlocked ? "bg-green-600 text-white hover:bg-green-700" : "bg-red-600 text-white hover:bg-red-700"
                }`}
              >
                {p.isBlocked ? "Reactivar cuenta" : "Suspender cuenta"}
              </button>

              <button
                onClick={() => toggleMunicipalVerification(p)}
                className={`flex-1 min-w-[180px] py-2 rounded-xl text-sm font-semibold transition active:scale-[0.98] ${
                  isMunicipal
                    ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                🏛️ {isMunicipal ? "Quitar sello municipal" : "Consultar y otorgar sello (OMIL)"}
              </button>

              {strikes > 0 && (
                <button
                  onClick={() => resetStrikes(p.id)}
                  className="flex-1 min-w-[140px] py-2 rounded-xl text-sm font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition active:scale-[0.98]"
                >
                  Reiniciar strikes
                </button>
              )}

              <button
                onClick={() => banProfesional(p)}
                className="flex-1 min-w-[140px] py-2 bg-red-800 text-white rounded-xl text-sm font-semibold hover:bg-red-900 transition active:scale-[0.98]"
              >
                Banear definitivamente
              </button>
            </div>
          </div>
        );
      })}

      {municipalModalFor && (
        <ConsultaMunicipalModal
          profesional={municipalModalFor}
          onClose={() => setMunicipalModalFor(null)}
        />
      )}
    </div>
  );
}

const CONSULTA_PASOS = [
  { label: "Conectando con OMIL / Bolsa Nacional de Empleo…", ms: 550 },
  { label: "Consultando Registro Civil e Identificación (Certificado de Título)…", ms: 650 },
  { label: "Consultando Servicio Nacional de Migraciones…", ms: 500 },
];

/* ═══════════════════════════════════════════════
   MODAL: Consulta Municipal (simulada)
   Simula lo que en un escenario real serían tres consultas separadas —
   OMIL/BNE, Registro Civil (Certificado de Título) y Servicio Nacional de
   Migraciones — para otorgar el "Pasaporte de Confianza Vecinal" ampliado.
   Ver docs/INNOVACION.md y src/data/municipalMockRegistry.js.
═══════════════════════════════════════════════ */
function ConsultaMunicipalModal({ profesional, onClose }) {
  const [rut, setRut] = useState(profesional.profile?.rut || "");
  const [resultado, setResultado] = useState(null);
  const [comuna, setComuna] = useState(profesional.profile?.comuna || COMUNAS_CON_CONVENIO[0]);
  const [saving, setSaving] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [pasoActual, setPasoActual] = useState(0);
  const [error, setError] = useState("");

  const handleConsultar = async () => {
    setError("");
    if (!rut.trim()) {
      setError("Ingresa un RUT para consultar.");
      return;
    }
    setResultado(null);
    setConsultando(true);

    // Animación secuencial: simula que se están consultando 3 sistemas
    // públicos distintos, uno por uno, en vez de una respuesta instantánea
    // (que se sentiría poco creíble para una demo).
    for (let i = 0; i < CONSULTA_PASOS.length; i++) {
      setPasoActual(i);
      await new Promise((r) => setTimeout(r, CONSULTA_PASOS[i].ms));
    }

    const datos = simulateConsultaMunicipal(rut);
    const { folio, codigo } = generarFolioVerificacion();
    setResultado({ ...datos, folio, codigoVerificacion: codigo });
    setConsultando(false);
  };

  const handleOtorgar = async () => {
    if (!resultado) return;
    try {
      setSaving(true);
      await updateDoc(doc(db, "users", profesional.id), {
        municipalVerification: {
          active: true,
          comuna,
          verifiedAt: new Date().toISOString(),
          rutConsultado: rut.trim(),
          ...resultado,
        },
      });
      onClose();
    } catch (err) {
      console.error(err);
      if (err.code === "permission-denied") {
        setError("Permisos insuficientes: tu cuenta no tiene role \"admin\" en Firestore, o las reglas no están desplegadas todavía.");
      } else {
        setError("Error al guardar la verificación. Intenta nuevamente.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
        {/* Encabezado estilo portal de gobierno (azul institucional) */}
        <div className="bg-gradient-to-r from-blue-800 to-blue-700 text-white px-6 py-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏛️</span>
              <div>
                <h3 className="text-base font-bold leading-tight">Portal de Verificación Interinstitucional</h3>
                <p className="text-[11px] text-blue-100 mt-0.5">OMIL · Registro Civil · Migraciones</p>
              </div>
            </div>
            <button onClick={onClose} className="text-blue-200 hover:text-white text-xl leading-none">×</button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Otorgar sello ampliado a <strong>{profesional.profile?.name || "este profesional"}</strong>
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">RUT a consultar</label>
            <div className="flex gap-2">
              <input
                value={rut}
                onChange={(e) => { setRut(e.target.value); setResultado(null); }}
                placeholder="11111111-1"
                disabled={consultando}
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                onClick={handleConsultar}
                disabled={consultando}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800 text-white hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-60 min-w-[110px]"
              >
                {consultando ? "Consultando…" : "Consultar"}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Prueba con 11111111-1, 22222222-2 o 33333333-3, o cualquier RUT.</p>
          </div>

          {consultando && (
            <div className="space-y-2 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 p-4">
              {CONSULTA_PASOS.map((paso, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span>
                    {i < pasoActual ? "✅" : i === pasoActual ? "⏳" : "⚪"}
                  </span>
                  <span className={i <= pasoActual ? "text-slate-700 dark:text-slate-200" : "text-slate-400"}>
                    {paso.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          {resultado && !consultando && (
            <div className="rounded-xl border-2 border-blue-100 dark:border-blue-900/40 overflow-hidden">
              {/* Cabecera tipo certificado oficial */}
              <div className="bg-blue-50 dark:bg-blue-950/20 px-4 py-3 flex items-center justify-between border-b border-blue-100 dark:border-blue-900/40">
                <p className="text-[11px] font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide">
                  Resultado de la consulta
                </p>
                <span className="text-[10px] text-slate-400 italic">Simulado — fines académicos</span>
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span>{resultado.inscritoOMIL ? "✅" : "⚪"}</span>
                  <span>
                    {resultado.inscritoOMIL
                      ? `Inscrito en la Bolsa Nacional de Empleo desde ${resultado.fechaInscripcionOMIL}`
                      : "No registra inscripción vigente en la OMIL"}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <span>{resultado.titulo?.tiene ? "🎓" : "⚪"}</span>
                  <span>
                    {resultado.titulo?.tiene
                      ? `Título verificado: ${resultado.titulo.carrera} (${resultado.titulo.nivel}) — ${resultado.titulo.institucion}`
                      : "Sin título profesional registrado en el Registro Civil"}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <span>{resultado.nacionalidad === "Chilena" ? "🇨🇱" : "🌎"}</span>
                  <span>
                    {resultado.nacionalidad === "Chilena"
                      ? "Nacionalidad chilena"
                      : `Extranjero — categoría migratoria: ${resultado.categoriaMigratoria}`}
                  </span>
                </div>

                {/* Folio y código de verificación, igual al formato de un
                    certificado digital chileno real (Registro Civil, SII). */}
                <div className="flex items-center justify-between text-[11px] font-mono bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2 mt-2">
                  <span className="text-slate-500 dark:text-slate-400">Folio: <strong className="text-slate-700 dark:text-slate-200">{resultado.folio}</strong></span>
                  <span className="text-slate-500 dark:text-slate-400">Cód. verificación: <strong className="text-slate-700 dark:text-slate-200">{resultado.codigoVerificacion}</strong></span>
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Comuna que certifica (OMIL con convenio)</label>
                  <select
                    value={comuna}
                    onChange={(e) => setComuna(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {COMUNAS_CON_CONVENIO.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            >
              Cancelar
            </button>
            <button
              onClick={handleOtorgar}
              disabled={!resultado || saving || consultando}
              className="flex-1 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {saving ? "Guardando…" : "Otorgar sello ampliado"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   CLIENTES
   Colección real: users, filtrado por role == "cliente"
═══════════════════════════════════════════════ */
function ClientesTab() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "cliente"));
    const unsub = onSnapshot(q, (snap) => {
      setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const toggleBlocked = async (id, current) => {
    try {
      await updateDoc(doc(db, "users", id), { isBlocked: !current });
    } catch (err) {
      console.error(err);
      alert("Error cambiando el estado de la cuenta.");
    }
  };

  const resetStrikes = async (id) => {
    if (!confirm("¿Reiniciar los strikes de este cliente a 0?")) return;
    try {
      await updateDoc(doc(db, "users", id), { reputationPoints: 0 });
    } catch (err) {
      console.error(err);
      alert("Error reiniciando strikes.");
    }
  };

  if (loading) return <p className="text-center text-slate-500">Cargando clientes...</p>;
  if (clientes.length === 0) return <p className="text-center text-slate-500">No hay clientes registrados.</p>;

  return (
    <div className="space-y-4">
      {clientes.map((c) => {
        const strikes = c.reputationPoints || 0;
        return (
          <div key={c.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 backdrop-blur">
            <div className="flex justify-between items-start">
              <h2 className="text-lg font-semibold">{c.profile?.name || "(sin nombre)"}</h2>
              <span className={`px-2 py-1 text-xs rounded-full ${c.isBlocked ? "bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-green-200 text-green-800 dark:bg-green-900/40 dark:text-green-300"}`}>
                {c.isBlocked ? "Suspendido" : "Activo"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400 mt-3">
              <p><span className="font-medium">Email:</span> {c.email || "—"}</p>
              <p><span className="font-medium">Teléfono:</span> {c.profile?.phone || "—"}</p>
              <p className={strikes >= STRIKE_LIMIT ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                <span className="font-medium">Strikes:</span> {strikes}/{STRIKE_LIMIT}
              </p>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => toggleBlocked(c.id, c.isBlocked)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition active:scale-[0.98] ${
                  c.isBlocked ? "bg-green-600 text-white hover:bg-green-700" : "bg-red-600 text-white hover:bg-red-700"
                }`}
              >
                {c.isBlocked ? "Reactivar cuenta" : "Suspender cuenta"}
              </button>
              {strikes > 0 && (
                <button
                  onClick={() => resetStrikes(c.id)}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition active:scale-[0.98]"
                >
                  Reiniciar strikes
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SOLICITUDES
   Colección real: requests. Estados corregidos para reflejar
   el ciclo de vida real usado en MisSolicitudes.jsx / MisTrabajos.jsx.
═══════════════════════════════════════════════ */
function RequestsTab() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "requests"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const updateStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, "requests", id), { status });
    } catch (err) {
      console.error(err);
      alert("Error actualizando estado.");
    }
  };

  const deleteRequest = async (id) => {
    if (!confirm("¿Eliminar solicitud permanentemente?")) return;
    try {
      await deleteDoc(doc(db, "requests", id));
    } catch (err) {
      console.error(err);
      alert("Error eliminando solicitud.");
    }
  };

  if (loading) return <p className="text-center text-slate-500">Cargando solicitudes...</p>;
  if (requests.length === 0) return <p className="text-center text-slate-500">No hay solicitudes.</p>;

  return (
    <div className="space-y-4">
      {requests.map((req) => {
        const meta = statusMeta(req.status);
        return (
          <div key={req.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 backdrop-blur">
            <div className="flex justify-between mb-2">
              <span className={`px-2 py-1 text-xs rounded-full ${meta.tone}`}>{meta.label}</span>
              <span className="text-xs text-slate-500">{req.createdAt?.toDate?.().toLocaleString?.()}</span>
            </div>

            <h3 className="text-lg font-semibold">{req.problemType}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{req.description || "Sin descripción"}</p>

            <div className="mt-3 text-sm">
              <p><span className="font-medium">Cliente:</span> {req.name}</p>
              <p><span className="font-medium">Teléfono:</span> {req.phone}</p>
              <p><span className="font-medium">Dirección:</span> {req.address}, {req.comuna}</p>
            </div>

            {req.photos?.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {req.photos.map((url, i) => (
                  <img key={i} src={url} alt="foto" className="w-20 h-20 rounded-lg object-cover border border-slate-300 dark:border-slate-700" />
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={() => updateStatus(req.id, "pendiente")} className="flex-1 min-w-[110px] py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 transition">Pendiente</button>
              <button onClick={() => updateStatus(req.id, "en_progreso")} className="flex-1 min-w-[110px] py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition">En progreso</button>
              <button onClick={() => updateStatus(req.id, "completado")} className="flex-1 min-w-[110px] py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition">Completado</button>
            </div>

            <button
              onClick={() => deleteRequest(req.id)}
              className="w-full mt-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition"
            >
              Eliminar solicitud
            </button>
          </div>
        );
      })}
    </div>
  );
}
