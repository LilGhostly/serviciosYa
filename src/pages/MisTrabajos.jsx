import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  addDoc,
  deleteDoc,
  limit,
  getDoc,
  getDocs,
  increment,
} from "firebase/firestore";
import { useUser } from "../context/UserContext";
import { validateSecurityPin } from "../lib/business";

/* ─────────────────────────────────────────────
   CONSTANTES Y CONFIGURACIÓN
───────────────────────────────────────────── */
const MAX_PIN_ATTEMPTS = 5;

const STATUS_MAP = {
  asignado:               { label: "Aceptado",   class: "border-zinc-200 text-zinc-400",                      dot: "bg-zinc-300"   },
  en_progreso:            { label: "En curso",    class: "border-black dark:border-white text-black dark:text-white", dot: "bg-black dark:bg-white" },
  esperando_confirmacion: { label: "Finalizado",  class: "border-amber-500 text-amber-600",                   dot: "bg-amber-500"  },
  completado:             { label: "Listo",       class: "border-emerald-500 text-emerald-600",                dot: "bg-emerald-500"},
  cancelado_cliente:      { label: "Cancelado",   class: "border-red-200 text-red-400",                       dot: "bg-red-400"    },
  cancelado_profesional:  { label: "Abandonado",  class: "border-red-200 text-red-400",                       dot: "bg-red-400"    },
};

const REPORT_REASONS_PRO = [
  { id: "falsa_ubicacion",  label: "Dirección falsa / No existe",    icon: "📍", weight: 2 },
  { id: "zona_peligrosa",   label: "Zona de alto riesgo",            icon: "🛡️", weight: 1 },
  { id: "cliente_agresivo", label: "Conducta hostil del cliente",    icon: "⚠️", weight: 3 },
  { id: "trabajo_diferente",label: "El trabajo no es lo descrito",   icon: "📋", weight: 1 },
];

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function MisTrabajos() {
  const { user } = useUser();
  const navigate  = useNavigate();

  /* --- estado general --- */
  const [loading,  setLoading]  = useState(true);
  const [jobs,     setJobs]     = useState([]);
  const [prevJobs, setPrevJobs] = useState([]);
  const [actionId, setActionId] = useState(null);

  /* --- modales --- */
  const [confirmModal, setConfirmModal] = useState(null);
  const [cancelModal,  setCancelModal]  = useState(null);
  const [deleteModal,  setDeleteModal]  = useState(null);
  const [pinModal,     setPinModal]     = useState(null);
  const [reportModal,  setReportModal]  = useState(null);

  /* --- rating cliente --- */
  const [showClientRating,    setShowClientRating]    = useState(false);
  const [selectedJobForRating,setSelectedJobForRating]= useState(null);
  const [clientStars,         setClientStars]         = useState(0);

  /* --- alertas y misc --- */
  const [premiumAlert,  setPremiumAlert]  = useState(null);
  const [cancelReason,  setCancelReason]  = useState("");
  const [inputPin,      setInputPin]      = useState("");
  const [pendingReport, setPendingReport] = useState(null); // confirmación en 2 pasos

  /* ─── SUSCRIPCIÓN EN TIEMPO REAL ─── */
  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);

    const q = query(
      collection(db, "requests"),
      where("acceptedById", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fresh = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      /* Detectar transición a "completado" para abrir el modal de rating */
      setPrevJobs((prev) => {
        fresh.forEach((job) => {
          const old = prev.find((j) => j.id === job.id);
          if (old && old.status !== "completado" && job.status === "completado") {
            setSelectedJobForRating(job);
            setShowClientRating(true);
          }
        });
        return fresh;
      });

      setJobs(fresh);
      setLoading(false);
    }, () => setLoading(false));

    return () => unsubscribe();
  }, [user?.uid]);

  /* ─── HELPERS ─── */
  const formatDate = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const formatCountdown = (ts, hours = 48) => {
    if (!ts) return null;
    const deadline = new Date((ts.toDate ? ts.toDate() : new Date(ts)).getTime() + hours * 3600000);
    const left = Math.max(0, Math.floor((deadline - Date.now()) / 3600000));
    return left;
  };

  /* ─── VALIDAR PIN ─── */
  const handleVerifyPin = async () => {
    const job = jobs.find((j) => j.id === pinModal);
    if (!job) return;

    const attempts = job.pinAttempts || 0;
    const { valid, attemptsRemaining, blocked } = validateSecurityPin(
      inputPin,
      job.securityPin,
      attempts,
      MAX_PIN_ATTEMPTS
    );

    /* Bloqueado por demasiados intentos (antes de siquiera comparar) */
    if (attempts >= MAX_PIN_ATTEMPTS) {
      setPremiumAlert({
        icon: "🔒",
        title: "Acceso Bloqueado",
        text: `Superaste ${MAX_PIN_ATTEMPTS} intentos fallidos. El cliente debe generar un nuevo PIN desde su aplicación.`,
      });
      return;
    }

    if (valid) {
      try {
        setActionId(job.id);
        await updateDoc(doc(db, "requests", job.id), {
          status: "en_progreso",
          startedAt: serverTimestamp(),
          isOnWay: false,
          pinAttempts: 0,
        });
        /* Mensaje automático en el chat */
        await addDoc(collection(db, "chats", job.id, "messages"), {
          system: true,
          text: "✅ PIN validado. El servicio ha comenzado oficialmente.",
          createdAt: serverTimestamp(),
        });
        setPinModal(null);
        setInputPin("");
      } catch {
        setPremiumAlert({ icon: "❌", title: "Error", text: "No se pudo iniciar el servicio. Intenta nuevamente." });
      } finally {
        setActionId(null);
      }
    } else {
      try {
        await updateDoc(doc(db, "requests", job.id), { pinAttempts: increment(1) });
      } catch {}
      setPremiumAlert({
        icon: "🔐",
        title: "PIN Inválido",
        text: !blocked
          ? `Código incorrecto. Te quedan ${attemptsRemaining} intento${attemptsRemaining !== 1 ? "s" : ""}.`
          : "Has agotado todos los intentos. El acceso queda bloqueado.",
      });
    }
  };

  /* ─── ENVIAR REPORTE (2 pasos) ─── */
  const handleSendReport = async (reportObj) => {
    const jobId   = reportModal;
    const jobData = jobs.find((j) => j.id === jobId);
    const clientId= jobData?.clientId;
    if (!clientId) return;

    try {
      setActionId(jobId);

      /* ¿Es reincidente? */
      const historySnap = await getDocs(
        query(collection(db, "reports"),
          where("reportedUserId", "==", clientId),
          where("reason", "==", reportObj.label))
      );
      const isRecurrent = historySnap.size > 0;

      /* Guardar reporte */
      await addDoc(collection(db, "reports"), {
        requestId: jobId, reporterId: user.uid, reportedUserId: clientId,
        reason: reportObj.label, weight: reportObj.weight, isRecurrent,
        createdAt: serverTimestamp(),
      });

      /* Calcular peso final */
      const clientRef  = doc(db, "users", clientId);
      const clientSnap = await getDoc(clientRef);
      const current    = clientSnap.data()?.reputationPoints || 0;
      const finalWeight= (reportObj.weight === 3 || isRecurrent) ? reportObj.weight : 0;
      const newTotal   = current + finalWeight;

      await updateDoc(clientRef, {
        reputationPoints: increment(finalWeight),
        isBlocked: newTotal >= 3 ? true : (clientSnap.data()?.isBlocked || false),
      });

      /* Notificación al cliente */
      await addDoc(collection(db, "notifications"), {
        userId: clientId,
        type:    finalWeight > 0 ? "strike" : "security",
        title:   finalWeight > 0 ? "Aviso de Seguridad" : "Reporte de Conducta",
        message: finalWeight > 0
          ? `Has recibido un strike por: ${reportObj.label}.`
          : `Se registró una incidencia por: ${reportObj.label}. Mantén el respeto en la comunidad.`,
        read: false,
        createdAt: serverTimestamp(),
      });

      /* Cancelar el trabajo y notificar en el chat */
      await updateDoc(doc(db, "requests", jobId), {
        status: "cancelado_cliente",
        canceledAt: serverTimestamp(),
      });
      await addDoc(collection(db, "chats", jobId, "messages"), {
        system: true,
        text: "🚩 Se ha reportado una incidencia. El servicio ha sido cancelado por seguridad.",
        createdAt: serverTimestamp(),
      });

      setReportModal(null);
      setPendingReport(null);
      setPremiumAlert({
        icon:  finalWeight > 0 ? "🛡️" : "📝",
        title: finalWeight > 0 ? "Sanción Aplicada" : "Reporte Recibido",
        text:  newTotal >= 3
          ? "El cliente ha sido suspendido de la plataforma."
          : "Incidencia registrada y enviada al buzón del cliente.",
      });
    } catch {
      setPremiumAlert({ icon: "❌", title: "Error", text: "No se pudo procesar la denuncia." });
    } finally {
      setActionId(null);
    }
  };

  /* ─── NOTIFICAR EN CAMINO ─── */
  const handleNotifyOnWay = async (id) => {
    try {
      setActionId(id);
      await updateDoc(doc(db, "requests", id), { isOnWay: true, onWayAt: serverTimestamp() });
      await addDoc(collection(db, "chats", id, "messages"), {
        system: true,
        text: "🚗 El profesional ha confirmado que va en camino. Por favor, ten listo el PIN de seguridad.",
        createdAt: serverTimestamp(),
      });
      setPremiumAlert({ icon: "🚗", title: "En Camino", text: "El cliente ha sido notificado de tu llegada." });
    } catch {
      setPremiumAlert({ icon: "❌", title: "Error", text: "No se pudo notificar." });
    } finally {
      setActionId(null);
    }
  };

  /* ─── NOTIFICAR TÉRMINO (profesional) ─── */
  const markWaitingConfirmation = async (job) => {
    try {
      setActionId(job.id);
      await updateDoc(doc(db, "requests", job.id), {
        status: "esperando_confirmacion",
        completedAt: serverTimestamp(),
        confirmationDeadlineHours: 48,
      });
      /* Notificar al cliente en el chat */
      await addDoc(collection(db, "chats", job.id, "messages"), {
        system: true,
        text: "🔔 El profesional ha declarado el trabajo como terminado. Por favor, revisa y confirma desde tu panel.",
        createdAt: serverTimestamp(),
      });
      /* Notificación push/buzón al cliente */
      await addDoc(collection(db, "notifications"), {
        userId: job.clientId,
        type: "action_required",
        title: "¿Trabajo completado?",
        message: `El profesional declaró haber finalizado el servicio "${job.problemType}". Tienes 48 horas para confirmar o reportar.`,
        requestId: job.id,
        read: false,
        createdAt: serverTimestamp(),
      });
      setConfirmModal(null);
      setPremiumAlert({
        icon: "🔔",
        title: "Notificación Enviada",
        text: "El cliente debe confirmar el trabajo en las próximas 48 horas. Recibirás una notificación al ser aprobado.",
      });
    } catch {
      setPremiumAlert({ icon: "❌", title: "Error", text: "Error de conexión. Intenta nuevamente." });
    } finally {
      setActionId(null);
    }
  };

  /* ─── ENVIAR CALIFICACIÓN AL CLIENTE (se activa post-completado) ─── */
  const handleSendClientRating = async () => {
    if (clientStars === 0 || !selectedJobForRating) return;
    try {
      setLoading(true);
      await updateDoc(doc(db, "users", selectedJobForRating.clientId), {
        "ratingStats.totalStars":   increment(clientStars),
        "ratingStats.totalReviews": increment(1),
      });
      /* Marcar que el profesional ya calificó */
      await updateDoc(doc(db, "requests", selectedJobForRating.id), {
        proRatedClient: true,
        proClientStars: clientStars,
      });
      setShowClientRating(false);
      setClientStars(0);
      setSelectedJobForRating(null);
      setPremiumAlert({ icon: "⭐", title: "¡Gracias!", text: "Tu calificación ha sido registrada con éxito." });
    } catch {
      setPremiumAlert({ icon: "❌", title: "Error", text: "No se pudo guardar la calificación." });
    } finally {
      setLoading(false);
    }
  };

  /* ─── CANCELAR TRABAJO ─── */
  const handleCancelJob = async () => {
    if (!cancelReason || cancelReason.trim().length < 5) {
      setPremiumAlert({ icon: "💬", title: "Motivo requerido", text: "Describe brevemente el motivo (mínimo 5 caracteres)." });
      return;
    }
    const id  = cancelModal;
    const job = jobs.find((j) => j.id === id);
    try {
      setActionId(id);
      await updateDoc(doc(db, "requests", id), {
        status: "cancelado_profesional",
        cancelReason: cancelReason.trim(),
        canceledAt: serverTimestamp(),
      });
      await addDoc(collection(db, "chats", id, "messages"), {
        system: true,
        text: `⚠️ El profesional ha cerrado el servicio. Motivo: "${cancelReason.trim()}"`,
        createdAt: serverTimestamp(),
      });
      /* Notificar al cliente */
      await addDoc(collection(db, "notifications"), {
        userId: job?.clientId,
        type: "service_canceled",
        title: "Servicio Cancelado",
        message: `El profesional canceló el servicio "${job?.problemType}". Motivo: ${cancelReason.trim()}.`,
        requestId: id,
        read: false,
        createdAt: serverTimestamp(),
      });
      /* Penalización automática si estaba en progreso */
      if (job?.status === "en_progreso") {
        await updateDoc(doc(db, "users", user.uid), {
          reputationPoints: increment(1),
          cancelCount: increment(1),
        });
        await addDoc(collection(db, "notifications"), {
          userId: user.uid,
          type: "strike",
          title: "Penalización Aplicada",
          message: "Cancelaste un servicio que ya estaba en curso. Esto afecta tu reputación en la plataforma.",
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      setCancelModal(null);
      setCancelReason("");
    } catch {
      setPremiumAlert({ icon: "❌", title: "Error", text: "Error al cancelar el servicio." });
    } finally {
      setActionId(null);
    }
  };

  /* ─── ELIMINAR REGISTRO ───
     Las fotos se guardan como Base64 dentro del propio documento en
     Firestore (no en Storage), así que se eliminan solas junto con el
     documento, sin pasos extra. */
  const processDelete = async () => {
    const { id } = deleteModal;
    try {
      setActionId(id);
      await deleteDoc(doc(db, "requests", id));
      setDeleteModal(null);
    } catch {
      setPremiumAlert({ icon: "❌", title: "Error", text: "No se pudo borrar el registro." });
    } finally {
      setActionId(null);
    }
  };

  if (!user) return null;

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] font-sans pb-32 overflow-x-hidden transition-colors duration-500 text-left">
      <div className="max-w-md mx-auto px-6 pt-10">

        {/* HEADER */}
        <header className="mb-12 flex flex-col gap-6 animate-reveal">
          <button
            onClick={() => navigate("/prof/perfil")}
            className="w-12 h-12 rounded-2xl bg-[var(--card-light)] dark:bg-[var(--card-dark)] flex items-center justify-center border shadow-soft active:scale-90 transition-all"
          >
            <svg className="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-4xl font-black tracking-tighter uppercase leading-none italic">
                Mi <span className="opacity-20 italic">Agenda</span>
              </h1>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mt-3 italic">Gestión operativa</p>
            </div>
            <Link to="/historial-profesional" className="text-[9px] font-black uppercase tracking-widest border-b-2 border-black dark:border-white pb-1">
              Historial
            </Link>
          </div>
        </header>

        {/* CONTENIDO */}
        {loading && !showClientRating ? (
          <div className="flex flex-col items-center py-32 opacity-20 text-center">
            <div className="w-8 h-8 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin mb-6" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] italic">Actualizando agenda...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] rounded-[3rem] p-16 text-center border animate-reveal">
            <div className="text-6xl mb-8 grayscale opacity-10 italic">💼</div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-10 opacity-40">Sin trabajos asignados</p>
            <Link to="/servicios-disponibles" className="btn-primary w-full py-5">Bolsa de Trabajo</Link>
          </div>
        ) : (
          <div className="space-y-8 animate-reveal">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                actionId={actionId}
                user={user}
                formatDate={formatDate}
                formatCountdown={formatCountdown}
                openPinModal={() => { setInputPin(""); setPinModal(job.id); }}
                openReportModal={() => { setPendingReport(null); setReportModal(job.id); }}
                onWay={() => handleNotifyOnWay(job.id)}
                onCancel={() => { setCancelReason(""); setCancelModal(job.id); }}
                onDelete={(id, photoUrls) => setDeleteModal({ id, photoUrls })}
                openConfirmModal={() => markWaitingConfirmation(job)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════
          MODALES
      ═══════════════════════════════════════ */}

      {/* RATING AL CLIENTE — aparece al detectar status="completado" */}
      {showClientRating && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-8 bg-black/90 backdrop-blur-2xl animate-fade-in text-center">
          <div className="bg-white dark:bg-black rounded-[4rem] p-12 w-full max-w-sm border dark:border-zinc-800 shadow-2xl">
            <div className="text-6xl mb-6 italic">👤</div>
            <h3 className="text-2xl font-black uppercase tracking-tighter dark:text-white mb-3 italic leading-none">
              Puntúa al Cliente
            </h3>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-2 leading-relaxed italic">
              {selectedJobForRating?.clientSnapshot?.name || "Cliente"}
            </p>
            <p className="text-[9px] text-zinc-400 mb-10 leading-relaxed">
              Tu valoración ayuda a mantener la calidad de la comunidad.
            </p>
            <div className="flex justify-center gap-3 mb-12">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  onClick={() => setClientStars(num)}
                  className={`text-4xl transition-all ${num <= clientStars ? "text-black dark:text-white scale-110" : "text-zinc-200 dark:text-zinc-800"}`}
                >★</button>
              ))}
            </div>
            {clientStars > 0 && clientStars < 4 && (
              <p className="text-[9px] text-zinc-400 mb-6 italic leading-relaxed px-4">
                Si el cliente tuvo una conducta grave, puedes reportarlo desde la tarjeta del trabajo.
              </p>
            )}
            <button
              onClick={handleSendClientRating}
              disabled={clientStars === 0}
              className="btn-primary w-full py-6 italic disabled:opacity-30"
            >
              Enviar y Finalizar
            </button>
            <button
              onClick={() => { setShowClientRating(false); setClientStars(0); }}
              className="mt-4 w-full py-2 text-[9px] font-black uppercase text-zinc-300 italic"
            >
              Omitir por ahora
            </button>
          </div>
        </div>
      )}

      {/* ALERTA GENÉRICA */}
      {premiumAlert && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-8 bg-black/90 backdrop-blur-2xl animate-fade-in text-center">
          <div className="bg-white dark:bg-black rounded-[4rem] p-12 w-full max-w-sm border dark:border-zinc-800 shadow-2xl">
            <div className="text-6xl mb-8 italic">{premiumAlert.icon}</div>
            <h3 className="text-3xl font-black uppercase tracking-tighter dark:text-white mb-4 italic leading-none">
              {premiumAlert.title}
            </h3>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-12 leading-relaxed italic">
              {premiumAlert.text}
            </p>
            <button onClick={() => setPremiumAlert(null)} className="btn-primary w-full py-6 !rounded-[2rem]">
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* MODAL PIN */}
      <BottomModal show={!!pinModal} onClose={() => { setPinModal(null); setInputPin(""); }}>
        <div className="text-5xl mb-6 italic">🔐</div>
        <h3 className="text-2xl font-black uppercase tracking-tighter mb-2 italic">Validación de Seguridad</h3>
        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-2 px-4 leading-relaxed">
          Ingresa el PIN de 4 dígitos que el cliente ve en su pantalla.
        </p>
        {(() => {
          const job = jobs.find((j) => j.id === pinModal);
          const attempts = job?.pinAttempts || 0;
          const blocked  = attempts >= MAX_PIN_ATTEMPTS;
          return (
            <>
              {attempts > 0 && !blocked && (
                <p className="text-[9px] font-black uppercase text-amber-500 mb-4">
                  ⚠️ Intento {attempts}/{MAX_PIN_ATTEMPTS}
                </p>
              )}
              {blocked && (
                <p className="text-[9px] font-black uppercase text-red-500 mb-4 px-4">
                  🔒 Bloqueado. El cliente debe generar un nuevo PIN.
                </p>
              )}
              <input
                type="tel"
                maxLength={4}
                value={inputPin}
                onChange={(e) => setInputPin(e.target.value.replace(/\D/g, ""))}
                disabled={blocked}
                className="input-base !text-4xl !text-center !py-6 !rounded-[2rem] tracking-[0.5em] mb-8 font-black disabled:opacity-30"
                placeholder="0000"
              />
              <button
                onClick={handleVerifyPin}
                disabled={inputPin.length < 4 || !!actionId || blocked}
                className="btn-primary w-full py-6 shadow-2xl italic disabled:opacity-30"
              >
                {actionId ? "Validando..." : "Validar e Iniciar"}
              </button>
            </>
          );
        })()}
      </BottomModal>

      {/* MODAL REPORTE (2 pasos) */}
      <BottomModal show={!!reportModal} onClose={() => { setReportModal(null); setPendingReport(null); }}>
        <div className="text-5xl mb-6 italic">🚩</div>
        <h3 className="text-2xl font-black uppercase italic text-red-600 mb-4">Protocolo de Reporte</h3>
        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-8 px-4 leading-relaxed">
          Esta acción notificará al cliente en su buzón de seguridad y cancelará el servicio.
        </p>

        {!pendingReport ? (
          <div className="space-y-3 mb-4 text-left">
            {REPORT_REASONS_PRO.map((r) => (
              <button
                key={r.id}
                onClick={() => setPendingReport(r)}
                className="w-full flex items-center gap-5 p-5 rounded-[2rem] bg-red-50 dark:bg-red-900/10 border border-transparent active:scale-95 transition-all"
              >
                <span className="text-2xl italic">{r.icon}</span>
                <span className="text-[11px] font-black uppercase italic text-red-700 dark:text-red-400">{r.label}</span>
                <span className="ml-auto text-zinc-300 dark:text-zinc-700">›</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="animate-reveal">
            <div className="p-6 bg-red-50 dark:bg-red-900/20 rounded-[2rem] mb-6 text-left">
              <p className="text-[8px] font-black uppercase text-red-400 mb-2 tracking-widest">Motivo seleccionado</p>
              <p className="text-sm font-black italic text-red-700 dark:text-red-300">
                {pendingReport.icon} {pendingReport.label}
              </p>
            </div>
            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-6 px-4 leading-relaxed">
              ¿Confirmas enviar este reporte? El servicio quedará cancelado y el cliente será notificado.
            </p>
            <button
              onClick={() => handleSendReport(pendingReport)}
              disabled={!!actionId}
              className="w-full py-5 bg-red-600 text-white rounded-[2rem] font-black text-[10px] uppercase shadow-2xl mb-3 active:scale-95 transition-all"
            >
              {actionId ? "Procesando..." : "Confirmar Denuncia"}
            </button>
            <button
              onClick={() => setPendingReport(null)}
              className="w-full py-2 text-[9px] font-black uppercase text-zinc-300 italic"
            >
              Volver
            </button>
          </div>
        )}
      </BottomModal>

      {/* MODAL CANCELAR */}
      <BottomModal show={!!cancelModal} onClose={() => { setCancelModal(null); setCancelReason(""); }}>
        <h3 className="text-2xl font-black uppercase mb-2 italic text-center">Cerrar Servicio</h3>
        <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest mb-6 text-center leading-relaxed">
          Explica el motivo. Si el servicio ya había iniciado, esto afectará tu reputación.
        </p>
        {(() => {
          const job = jobs.find((j) => j.id === cancelModal);
          return job?.status === "en_progreso" ? (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-[2rem] mb-6 border border-amber-200 dark:border-amber-800/30">
              <p className="text-[9px] font-black uppercase text-amber-700 dark:text-amber-400 text-center leading-relaxed">
                ⚠️ El servicio ya está en curso. Cancelar ahora generará una penalización automática en tu perfil.
              </p>
            </div>
          ) : null;
        })()}
        <textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          className="input-base !bg-zinc-100 dark:!bg-zinc-900 !rounded-[2rem] mb-4 h-36 resize-none italic"
          placeholder="Describe el motivo con detalle..."
          maxLength={300}
        />
        <p className="text-[8px] text-zinc-300 text-right mb-6">{cancelReason.length}/300</p>
        <button
          onClick={handleCancelJob}
          disabled={!!actionId || cancelReason.trim().length < 5}
          className="w-full py-6 bg-red-600 text-white rounded-[2rem] text-[10px] font-black uppercase shadow-2xl disabled:opacity-30 active:scale-95 transition-all"
        >
          Confirmar Cierre
        </button>
      </BottomModal>

      {/* MODAL ELIMINAR */}
      <BottomModal show={!!deleteModal} onClose={() => setDeleteModal(null)}>
        <div className="text-5xl mb-6 italic">🗑️</div>
        <h3 className="text-2xl font-black uppercase italic text-red-600 mb-4 text-center">¿Eliminar registro?</h3>
        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-10 px-4 text-center leading-relaxed">
          La información se borrará permanentemente de tu agenda. Esta acción no se puede deshacer.
        </p>
        <button
          onClick={processDelete}
          disabled={!!actionId}
          className="w-full py-6 bg-red-600 text-white rounded-[2rem] font-black text-[10px] uppercase shadow-2xl disabled:opacity-30 active:scale-95 transition-all"
        >
          {actionId ? "Eliminando..." : "Confirmar Borrado"}
        </button>
        <button onClick={() => setDeleteModal(null)} className="mt-4 w-full py-2 text-[9px] font-black uppercase text-zinc-300 italic">
          Cancelar
        </button>
      </BottomModal>

      <style>{`
        .animate-reveal { animation: reveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes reveal { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.4s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-bounce-subtle { animation: bounceSub 2s ease-in-out infinite; }
        @keyframes bounceSub { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TARJETA DE TRABAJO
───────────────────────────────────────────── */
function JobCard({ job, actionId, user, openPinModal, openReportModal, onWay, onCancel, onDelete, formatDate, formatCountdown, openConfirmModal }) {
  const s   = job.status || "asignado";
  const cfg = STATUS_MAP[s] || STATUS_MAP.asignado;
  const total = job.proposedPrice ?? ((job.laborCost || 0) + (job.materialsCost || 0));
  const canReport = !s.includes("cancelado") && s !== "completado";
  const hasUnreadMessages = job.unreadChat && job.lastMessageSenderId !== user.uid;

  /* Contador de confirmación (para esperando_confirmacion) */
  const hoursLeft = s === "esperando_confirmacion" ? formatCountdown(job.completedAt, 48) : null;

  return (
    <article className={`
      bg-[var(--card-light)] dark:bg-[var(--card-dark)] border rounded-[3rem] p-8 shadow-soft
      relative overflow-hidden transition-all active:scale-[0.98]
      ${s === "en_progreso"
        ? "border-black dark:border-white ring-1 ring-black/5"
        : s === "esperando_confirmacion"
        ? "border-amber-400 ring-1 ring-amber-400/20"
        : "border-[var(--border-light)] dark:border-[var(--border-dark)]"}
    `}>

      {/* HEADER TARJETA */}
      <div className="flex justify-between items-start mb-8 text-left">
        <div className="overflow-hidden flex-1 mr-4">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-black uppercase leading-none truncate italic">{job.problemType}</h2>
            {canReport && (
              <button
                onClick={openReportModal}
                className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs shadow-sm active:scale-75 shrink-0"
                title="Reportar incidencia"
              >🚩</button>
            )}
          </div>
          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest italic opacity-40">
            Pedido • {formatDate(job.createdAt)}
          </p>
        </div>
        <div className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border shrink-0 flex items-center gap-2 ${cfg.class}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </div>
      </div>

      <div className="space-y-6">

        {/* BANNER EN CAMINO */}
        {job.isOnWay && s === "asignado" && (
          <div className="bg-blue-600 p-5 rounded-[2rem] flex items-center gap-5 shadow-xl shadow-blue-500/20 text-left">
            <span className="text-2xl shrink-0">🚗</span>
            <div>
              <p className="text-[10px] font-black uppercase text-white mb-1 italic">Notificado al cliente</p>
              <p className="text-[8px] font-bold text-blue-100 uppercase tracking-widest leading-tight">
                Has confirmado que vas en camino.
              </p>
            </div>
          </div>
        )}

        {/* BLOQUE CLIENTE */}
        <div className="flex items-center justify-between p-6 bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-soft">
          <div className="flex items-center gap-4 text-left">
            <div className="w-12 h-12 rounded-2xl bg-black text-white dark:bg-white dark:text-black flex items-center justify-center font-black text-xl italic shadow-2xl">
              {job.clientSnapshot?.name?.charAt(0) || "C"}
            </div>
            <div>
              <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 leading-none">Contratante</p>
              <p className="text-sm font-black uppercase italic truncate w-36 leading-none">
                {job.clientSnapshot?.name || "Cliente"}
              </p>
              {job.clientSnapshot?.ratingAvg > 0 && (
                <p className="text-[8px] font-black text-amber-500 mt-1">
                  ★ {job.clientSnapshot.ratingAvg.toFixed(1)}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {job.clientSnapshot?.phone && (
              <a
                href={`tel:${job.clientSnapshot.phone}`}
                className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shadow-sm active:scale-90 transition-all"
                title="Llamar al cliente"
              >📞</a>
            )}
            <Link
              to={`/client-profile/${job.clientId}`}
              className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center italic font-black text-xs active:scale-90 transition-all"
              title="Ver perfil del cliente"
            >i</Link>
          </div>
        </div>

        {/* UBICACIÓN */}
        <div className="flex items-start gap-4 text-left px-2">
          <span className="text-2xl opacity-40 italic shrink-0">📍</span>
          <div>
            <p className="text-[8px] font-black uppercase text-zinc-400 mb-1.5 tracking-widest leading-none">Ubicación</p>
            <p className="text-xs font-bold italic leading-tight">{job.address}</p>
            {job.commune && (
              <p className="text-[8px] text-zinc-400 mt-1 uppercase tracking-widest">{job.commune}</p>
            )}
          </div>
        </div>

        {/* PRESUPUESTO */}
        {total > 0 && (
          <div className="bg-zinc-100 dark:bg-zinc-900/50 p-8 rounded-[2.5rem] text-center italic relative overflow-hidden">
            <p className="text-[8px] font-black uppercase opacity-30 mb-4 tracking-[0.3em] leading-none">Presupuesto Cerrado</p>
            <span className="text-4xl font-black tracking-tighter italic">
              ${total.toLocaleString("es-CL")}
            </span>
            {job.laborCost > 0 && job.materialsCost > 0 && (
              <div className="flex justify-center gap-6 mt-4">
                <div className="text-center">
                  <p className="text-[7px] uppercase text-zinc-400 tracking-widest">Mano de obra</p>
                  <p className="text-[10px] font-black">${job.laborCost.toLocaleString("es-CL")}</p>
                </div>
                <div className="text-center">
                  <p className="text-[7px] uppercase text-zinc-400 tracking-widest">Materiales</p>
                  <p className="text-[10px] font-black">${job.materialsCost.toLocaleString("es-CL")}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* BLOQUE ESPERANDO CONFIRMACIÓN */}
        {s === "esperando_confirmacion" && (
          <div className="p-6 bg-amber-50 dark:bg-amber-950/20 rounded-[2.5rem] border border-amber-100 dark:border-amber-800/30 text-left">
            <p className="text-[8px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-widest mb-2">
              Esperando confirmación del cliente
            </p>
            <p className="text-[10px] text-amber-800 dark:text-amber-300 leading-relaxed">
              El cliente debe aprobar el trabajo desde su panel. Recibirás una notificación y podrás calificar al finalizar.
            </p>
            {hoursLeft !== null && (
              <p className="text-[8px] font-black text-amber-600/70 mt-3 uppercase tracking-widest">
                ⏳ Auto-confirmación en {hoursLeft}h si el cliente no actúa
              </p>
            )}
          </div>
        )}

        {/* DESCRIPCIÓN DEL PROBLEMA */}
        {job.description && (
          <div className="px-2">
            <p className="text-[8px] font-black uppercase text-zinc-400 mb-2 tracking-widest">Descripción</p>
            <p className="text-[10px] text-zinc-600 dark:text-zinc-400 leading-relaxed italic">{job.description}</p>
          </div>
        )}

        {/* ACCIONES */}
        <div className="space-y-4 pt-2">

          {/* CHAT — visible en estados activos */}
          {!["completado", "cancelado_cliente", "cancelado_profesional"].includes(s) ? (
            <Link
              to={`/chat/${job.id}`}
              className="relative btn-primary w-full py-5 flex justify-center items-center gap-3 italic"
            >
              💬 Chat Seguro
              {hasUnreadMessages && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-5 w-5 bg-red-600 items-center justify-center text-[8px] font-black text-white border-2 border-white dark:border-zinc-900 shadow-lg">1</span>
                </span>
              )}
            </Link>
          ) : (
            <div className="w-full py-4 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700 font-black text-[9px] uppercase text-center italic">
              💬 Canal cerrado
            </div>
          )}

          {/* ESTADO: ASIGNADO */}
          {s === "asignado" && (
            <div className="space-y-4">
              {job.proposalStatus === "aceptada" ? (
                <>
                  {!job.isOnWay && (
                    <button
                      onClick={onWay}
                      disabled={!!actionId}
                      className="w-full py-4 rounded-[2rem] border border-blue-500 text-blue-600 font-black text-[10px] uppercase tracking-widest active:bg-blue-50 dark:active:bg-blue-950 animate-bounce-subtle disabled:opacity-30 transition-all"
                    >
                      🚗 Notificar que voy en camino
                    </button>
                  )}
                  <button
                    onClick={openPinModal}
                    disabled={!!actionId}
                    className="btn-primary w-full py-6 !rounded-[2.5rem] shadow-2xl italic disabled:opacity-30"
                  >
                    🔐 Validar PIN e Iniciar
                  </button>
                </>
              ) : (
                <div className="p-6 rounded-[2.5rem] bg-zinc-50 dark:bg-zinc-900 border border-dashed border-zinc-200 dark:border-zinc-800 text-center italic">
                  <p className="text-[9px] font-black uppercase text-zinc-400 tracking-widest leading-relaxed">
                    Esperando que el cliente apruebe<br />tu propuesta de servicio
                  </p>
                </div>
              )}
              <button
                onClick={onCancel}
                className="w-full py-2 text-red-500 text-[9px] font-black uppercase opacity-40 hover:opacity-80 italic transition-opacity"
              >
                Cerrar Servicio
              </button>
            </div>
          )}

          {/* ESTADO: EN PROGRESO */}
          {s === "en_progreso" && (
            <div className="space-y-4">
              <button
                onClick={openConfirmModal}
                disabled={!!actionId}
                className="w-full py-6 rounded-[2.5rem] bg-emerald-600 text-white font-black text-[10px] uppercase shadow-2xl active:scale-95 transition-all disabled:opacity-30"
              >
                ✅ Notificar Término del Trabajo
              </button>
              <button
                onClick={onCancel}
                className="w-full py-2 text-red-500 text-[9px] font-black uppercase opacity-30 hover:opacity-70 italic transition-opacity"
              >
                Cerrar Servicio
              </button>
            </div>
          )}

          {/* ESTADOS TERMINADOS */}
          {(s.includes("cancelado") || s === "completado") && (
            <div className="space-y-4">
              {s === "completado" && !job.proRatedClient && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-[2rem] border border-emerald-100 dark:border-emerald-800/30 text-center">
                  <p className="text-[9px] font-black uppercase text-emerald-700 dark:text-emerald-400">
                    Trabajo certificado por el cliente
                  </p>
                </div>
              )}
              <button
                onClick={() => onDelete(job.id, job.photoUrls || [])}
                disabled={!!actionId}
                className="w-full py-5 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 text-zinc-400 font-black text-[9px] uppercase shadow-sm active:scale-95 transition-all disabled:opacity-30"
              >
                Limpiar Agenda
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────────
   BOTTOM MODAL REUTILIZABLE
───────────────────────────────────────────── */
function BottomModal({ show, onClose, children }) {
  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-[400] flex items-end justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-black w-full max-w-sm rounded-[3.5rem] p-10 pb-12 text-center shadow-2xl animate-reveal border dark:border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto mb-10 opacity-30" />
        {children}
      </div>
    </div>
  );
}