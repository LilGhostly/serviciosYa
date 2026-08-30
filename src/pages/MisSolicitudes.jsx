import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
  limit,
  addDoc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { useUser } from "../context/UserContext";
import { createMercadoPagoPreference } from "../services/paymentService";
import { generateSecurityPin, validateSecurityPin, STRIKE_LIMIT } from "../lib/business";

/* ─────────────────────────────────────────────
   CONSTANTES Y CONFIGURACIÓN
───────────────────────────────────────────── */
const POSITIVE_TAGS = [
  { id: "puntual",   label: "Puntual",      icon: "⏱️" },
  { id: "limpio",    label: "Limpio",       icon: "✨" },
  { id: "experto",   label: "Muy Pro",      icon: "👨‍🔧" },
  { id: "precio",    label: "Precio Justo", icon: "💰" },
  { id: "amable",    label: "Amable",       icon: "🤝" },
];

const STATUS_MAP = {
  esperando_pago:         { label: "Pago Pendiente", class: "border-emerald-500 text-emerald-600",               dot: "bg-emerald-500" },
  pendiente:              { label: "Buscando",       class: "border-zinc-200 text-zinc-400",                     dot: "bg-zinc-300"    },
  asignado:               { label: "Propuesta",      class: "border-black dark:border-white text-black dark:text-white", dot: "bg-black dark:bg-white" },
  en_progreso:            { label: "En Curso",       class: "border-black dark:border-white text-black dark:text-white", dot: "bg-black dark:bg-white" },
  esperando_confirmacion: { label: "Revisar",        class: "border-amber-500 text-amber-600",                   dot: "bg-amber-500"   },
  completado:             { label: "Listo",           class: "border-emerald-500 text-emerald-600",              dot: "bg-emerald-500" },
  cancelado_cliente:      { label: "Anulado",        class: "border-red-200 text-red-400",                       dot: "bg-red-400"     },
  cancelado_profesional:  { label: "Pro Canceló",    class: "border-red-200 text-red-400",                       dot: "bg-red-400"     },
};

const REJECT_REASONS = [
  { id: "alto",      label: "Presupuesto elevado",  icon: "💸" },
  { id: "detalle",   label: "Poco detalle",         icon: "📋" },
  { id: "materiales",label: "Sin materiales",       icon: "📦" },
  { id: "agenda",    label: "Sin disponibilidad",   icon: "⏳" },
  { id: "otro",      label: "Elegí a otro",         icon: "👤" },
];

const CANCEL_REASONS = [
  { id: "no_necesito",  label: "Ya no lo necesito",         icon: "🛑" },
  { id: "error_datos",  label: "Error en datos del pedido", icon: "✏️" },
  { id: "costo_alto",   label: "El costo es muy elevado",   icon: "💰" },
  { id: "fuera_app",    label: "Lo resolví por otro medio", icon: "🏃" },
  { id: "otro",         label: "Otro motivo",               icon: "💬" },
];

const REPORT_REASONS = [
  { id: "no_llego",     label: "El profesional nunca llegó",    icon: "🚶‍♂️", weight: 1 },
  { id: "conducta",     label: "Conducta inapropiada / Acoso", icon: "⚠️",  weight: 3 },
  { id: "precio_change",label: "Cambió el precio al llegar",   icon: "💵",  weight: 2 },
  { id: "suplantacion", label: "No es la persona de la foto",  icon: "🎭",  weight: 3 },
];

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function MisSolicitudes() {
  const { user }   = useUser();
  const navigate   = useNavigate();
  const location   = useLocation();

  /* --- estado general --- */
  const [loading,   setLoading]   = useState(true);
  const [requests,  setRequests]  = useState([]);
  const [actionId,  setActionId]  = useState(null);
  const [previewUrl,setPreviewUrl]= useState(null);

  /* --- rating al profesional --- */
  const [showRatingModal,    setShowRatingModal]    = useState(false);
  const [selectedReqForRating,setSelectedReqForRating]= useState(null);
  const [stars,        setStars]        = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);

  /* --- diálogos --- */
  const [confirmDialog, setConfirmDialog] = useState({ show: false, title: "", text: "", onConfirm: null, type: "default" });
  const [rejectDialog,  setRejectDialog]  = useState({ show: false, reqId: null });
  const [cancelDialog,  setCancelDialog]  = useState({ show: false, reqId: null });
  const [reportDialog,  setReportDialog]  = useState({ show: false, reqId: null });
  const [pendingReport, setPendingReport] = useState(null); // confirmación en 2 pasos

  /* --- alertas --- */
  const [premiumAlert, setPremiumAlert] = useState(null);

  const showBackButton = location.state?.fromProfile === true;

  /* ─── SUSCRIPCIÓN EN TIEMPO REAL ─── */
  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    const q = query(
      collection(db, "requests"),
      where("clientId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
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
    return Math.max(0, Math.floor((deadline - Date.now()) / 3600000));
  };

  /* ─── REINTENTAR PAGO FLASH ─── */
  const handleRetryPayment = async (req) => {
    try {
      setActionId(req.id);
      const data = await createMercadoPagoPreference(
        req.id,
        req.upsell?.price || 150,
        `Prioridad Flash - ${req.problemType}`
      );
      if (data?.init_point) window.location.href = data.init_point;
    } catch {
      setPremiumAlert({ icon: "❌", title: "Error de Pago", text: "No se pudo conectar con la pasarela de pagos. Intenta nuevamente." });
    } finally {
      setActionId(null);
    }
  };

  /* ─── ACEPTAR PROPUESTA DEL PROFESIONAL ─── */
  const handleAcceptProposal = async (id) => {
    try {
      setActionId(id);
      const pin = generateSecurityPin();
      await updateDoc(doc(db, "requests", id), {
        status: "asignado",
        proposalStatus: "aceptada",
        acceptedAt: serverTimestamp(),
        securityPin: pin,
        pinAttempts: 0,
        isOnWay: false,
      });
      /* Notificar al profesional que fue aceptado */
      const req = requests.find((r) => r.id === id);
      if (req?.acceptedById) {
        await addDoc(collection(db, "notifications"), {
          userId: req.acceptedById,
          type: "proposal_accepted",
          title: "¡Propuesta Aceptada!",
          message: `El cliente aceptó tu propuesta para "${req.problemType}". Puedes notificar que vas en camino.`,
          requestId: id,
          read: false,
          createdAt: serverTimestamp(),
        });
        await addDoc(collection(db, "chats", id, "messages"), {
          system: true,
          text: "✅ El cliente aceptó la propuesta. Se ha generado el PIN de seguridad. El profesional puede notificar que va en camino.",
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionId(null);
    }
  };

  /* ─── REPORTAR PROFESIONAL (2 pasos) ─── */
  const handleConfirmReport = async (reportObj) => {
    const reqId = reportDialog.reqId;
    const requestData = requests.find((r) => r.id === reqId);
    const proId = requestData?.acceptedById;
    if (!proId) return;

    try {
      setActionId(reqId);

      /* ¿Es reincidente? */
      const historySnap = await getDocs(
        query(collection(db, "reports"),
          where("reportedUserId", "==", proId),
          where("reason", "==", reportObj.label))
      );
      const isRecurrent = historySnap.size > 0;

      await addDoc(collection(db, "reports"), {
        requestId: reqId, reporterId: user.uid, reportedUserId: proId,
        reason: reportObj.label, weight: reportObj.weight, isRecurrent,
        createdAt: serverTimestamp(), status: "applied",
      });

      const proRef  = doc(db, "users", proId);
      const proSnap = await getDoc(proRef);
      const current = proSnap.data()?.reputationPoints || 0;
      const weight  = (reportObj.weight === 3 || isRecurrent) ? reportObj.weight : 0;
      const newTotal= current + weight;

      await updateDoc(proRef, {
        reputationPoints: increment(weight),
        isBlocked: newTotal >= 3 ? true : (proSnap.data()?.isBlocked || false),
      });

      /* Notificación al profesional */
      await addDoc(collection(db, "notifications"), {
        userId: proId,
        type:    weight > 0 ? "strike" : "security",
        title:   weight > 0 ? "Sanción Aplicada" : "Aviso de Conducta",
        message: weight > 0
          ? `Has recibido un strike por: ${reportObj.label}.`
          : `Se registró una incidencia en tu contra: ${reportObj.label}. Mantén los estándares de la plataforma.`,
        read: false,
        createdAt: serverTimestamp(),
      });

      /* Cancelar y notificar en chat */
      await updateDoc(doc(db, "requests", reqId), {
        status: "cancelado_profesional",
        canceledAt: serverTimestamp(),
      });
      await addDoc(collection(db, "chats", reqId, "messages"), {
        system: true,
        text: "🚩 El cliente ha reportado una incidencia. El servicio ha sido cancelado por seguridad.",
        createdAt: serverTimestamp(),
      });

      setReportDialog({ show: false, reqId: null });
      setPendingReport(null);
      setPremiumAlert({
        icon:  weight > 0 ? "🛡️" : "📝",
        title: weight > 0 ? "Sanción Aplicada" : "Reporte Recibido",
        text:  newTotal >= 3
          ? "El profesional ha sido suspendido definitivamente de la plataforma."
          : "Reporte registrado. El profesional ha sido notificado en su buzón de seguridad.",
      });
    } catch {
      setPremiumAlert({ icon: "❌", title: "Error", text: "No se pudo procesar el reporte. Intenta nuevamente." });
    } finally {
      setActionId(null);
    }
  };

  /* ─── CONFIRMAR TRABAJO (cliente aprueba) ─── */
  const approveJob = async (req) => {
    try {
      setActionId(req.id);
      await updateDoc(doc(db, "requests", req.id), {
        status: "completado",
        approvedAt: serverTimestamp(),
      });
      /* Notificar al profesional */
      if (req.acceptedById) {
        await addDoc(collection(db, "notifications"), {
          userId: req.acceptedById,
          type: "job_approved",
          title: "¡Trabajo Aprobado!",
          message: `El cliente confirmó la finalización de "${req.problemType}". ¡Bien hecho!`,
          requestId: req.id,
          read: false,
          createdAt: serverTimestamp(),
        });
        await addDoc(collection(db, "chats", req.id, "messages"), {
          system: true,
          text: "🎉 El cliente ha confirmado y aprobado el trabajo. ¡Servicio completado con éxito!",
          createdAt: serverTimestamp(),
        });
      }
      setSelectedReqForRating(req);
      setShowRatingModal(true);
    } catch (err) {
      console.error(err);
    } finally {
      setActionId(null);
    }
  };

  /* ─── CANCELAR PEDIDO ─── */
  const confirmCancelRequest = async (reason) => {
    const id = cancelDialog.reqId;
    try {
      setActionId(id);
      await updateDoc(doc(db, "requests", id), {
        status: "cancelado_cliente",
        cancelReason: reason,
        canceledAt: serverTimestamp(),
      });
      /* Notificar al profesional si había uno asignado */
      const req = requests.find((r) => r.id === id);
      if (req?.acceptedById) {
        await addDoc(collection(db, "notifications"), {
          userId: req.acceptedById,
          type: "service_canceled",
          title: "Servicio Cancelado por el Cliente",
          message: `El cliente canceló el pedido "${req.problemType}". Motivo: ${reason}.`,
          requestId: id,
          read: false,
          createdAt: serverTimestamp(),
        });
        await addDoc(collection(db, "chats", id, "messages"), {
          system: true,
          text: `⚠️ El cliente ha cancelado el pedido. Motivo: "${reason}"`,
          createdAt: serverTimestamp(),
        });
      }
      setCancelDialog({ show: false, reqId: null });
    } catch (err) {
      console.error(err);
    } finally {
      setActionId(null);
    }
  };

  /* ─── RECHAZAR PROPUESTA ─── */
  const confirmRejectProposal = async (reason) => {
    const id = rejectDialog.reqId;
    if (!id) return;
    try {
      setActionId(id);
      const req = requests.find((r) => r.id === id);
      await updateDoc(doc(db, "requests", id), {
        status: "pendiente",
        acceptedById: null,
        professionalName: null,
        proposedPrice: null,
        laborCost: null,
        materialsCost: null,
        proposalStatus: null,
        lastRejectReason: reason,
        rejectedAt: serverTimestamp(),
      });
      /* Notificar al profesional rechazado */
      if (req?.acceptedById) {
        await addDoc(collection(db, "notifications"), {
          userId: req.acceptedById,
          type: "proposal_rejected",
          title: "Propuesta No Aceptada",
          message: `El cliente rechazó tu propuesta para "${req.problemType}". Motivo: ${reason}.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      setRejectDialog({ show: false, reqId: null });
    } catch (err) {
      console.error(err);
    } finally {
      setActionId(null);
    }
  };

  /* ─── ELIMINAR PEDIDO ───
     Las fotos ya no viven en Firebase Storage: se guardan como Base64
     dentro del propio documento en Firestore (ver Solicitar.jsx), así que
     al borrar el documento se eliminan solas, sin pasos extra. */
  const deleteRequest = (id) => {
    setConfirmDialog({
      show: true,
      title: "¿Eliminar registro?",
      text: "Esta acción borrará el pedido de forma permanente. No se puede deshacer.",
      type: "danger",
      onConfirm: async () => {
        try {
          setActionId(id);
          await deleteDoc(doc(db, "requests", id));
          setConfirmDialog((p) => ({ ...p, show: false }));
        } finally {
          setActionId(null);
        }
      },
    });
  };

  /* ─── ENVIAR CALIFICACIÓN AL PROFESIONAL ─── */
  const handleSendRating = async () => {
    if (stars === 0 || !selectedReqForRating) return;
    try {
      setLoading(true);
      await updateDoc(doc(db, "requests", selectedReqForRating.id), {
        rating: stars,
        ratedAt: serverTimestamp(),
        positiveTags: selectedTags,
      });
      if (selectedReqForRating.acceptedById) {
        const proUpdate = {
          "ratingStats.totalStars":   increment(stars),
          "ratingStats.totalReviews": increment(1),
        };
        selectedTags.forEach((tag) => { proUpdate[`ratingStats.tags.${tag}`] = increment(1); });
        await updateDoc(doc(db, "users", selectedReqForRating.acceptedById), proUpdate);
        /* Notificar al profesional de la nueva reseña */
        await addDoc(collection(db, "notifications"), {
          userId: selectedReqForRating.acceptedById,
          type: "new_review",
          title: `Nueva reseña: ${"★".repeat(stars)}`,
          message: `Has recibido una calificación de ${stars} estrella${stars !== 1 ? "s" : ""} por "${selectedReqForRating.problemType}".`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      setShowRatingModal(false);
      setStars(0);
      setSelectedTags([]);
      setPremiumAlert({ icon: "⭐", title: "¡Gracias!", text: "Tu reseña fue publicada en el perfil del profesional." });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = (id) => {
    setSelectedTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  };

  if (!user) return null;

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] font-sans pb-32 overflow-x-hidden transition-colors duration-500 text-left">

      {/* HEADER STICKY */}
      <header className="bg-[var(--bg-light)]/80 dark:bg-[var(--bg-dark)]/80 backdrop-blur-xl border-b border-[var(--border-light)] dark:border-[var(--border-dark)] sticky top-0 z-40 px-6 py-8">
        <div className="max-w-md mx-auto flex items-center justify-between">
          {showBackButton ? (
            <button
              onClick={() => navigate("/cliente/perfil")}
              className="w-12 h-12 rounded-2xl bg-[var(--card-light)] dark:bg-[var(--card-dark)] flex items-center justify-center border border-[var(--border-light)] dark:border-[var(--border-dark)] active:scale-90 transition-all shadow-soft"
            >
              <svg className="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
          ) : (
            <div className="w-12 h-12" />
          )}
          <h1 className="text-sm font-black uppercase tracking-[0.3em] italic">
            Mis <span className="opacity-20 italic">Pedidos</span>
          </h1>
          <Link
            to="/solicitar"
            className="w-12 h-12 rounded-2xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center shadow-2xl active:scale-90 transition-all"
            title="Nuevo pedido"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeWidth="4" d="M12 4v16m8-8H4"/>
            </svg>
          </Link>
        </div>
      </header>

      {/* CONTENIDO */}
      <main className="max-w-md mx-auto px-6 pt-10">
        {loading && !showRatingModal ? (
          <div className="flex flex-col items-center py-32 opacity-20 text-center">
            <div className="w-8 h-8 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin mb-6" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] italic">Actualizando pedidos...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] rounded-[3rem] p-16 text-center border animate-reveal">
            <span className="text-6xl block mb-8 opacity-10 italic">📂</span>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-10 opacity-40">Sin actividad operativa</p>
            <Link to="/solicitar" className="btn-primary w-full py-5">Nuevo Servicio</Link>
          </div>
        ) : (
          <div className="space-y-8 animate-reveal">
            {requests.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                formatDate={formatDate}
                formatCountdown={formatCountdown}
                user={user}
                cancelRequest={() => setCancelDialog({ show: true, reqId: req.id })}
                approveJob={() => approveJob(req)}
                handleAcceptProposal={() => handleAcceptProposal(req.id)}
                handleRetryPayment={() => handleRetryPayment(req)}
                openRejectDialog={() => setRejectDialog({ show: true, reqId: req.id })}
                openReportDialog={() => { setPendingReport(null); setReportDialog({ show: true, reqId: req.id }); }}
                deleteRequest={() => deleteRequest(req.id)}
                actionId={actionId}
                setPreviewUrl={setPreviewUrl}
              />
            ))}
          </div>
        )}
      </main>

      {/* ═══════════════════════════════════════
          MODALES
      ═══════════════════════════════════════ */}

      {/* ALERTA GENÉRICA */}
      {premiumAlert && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-8 bg-black/90 backdrop-blur-2xl animate-fade-in">
          <div className="bg-white dark:bg-black rounded-[4rem] p-12 w-full max-w-sm text-center border dark:border-zinc-800 shadow-2xl">
            <div className="text-6xl mb-8 italic">{premiumAlert.icon}</div>
            <h3 className="text-3xl font-black uppercase italic mb-4 dark:text-white leading-none">{premiumAlert.title}</h3>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-relaxed mb-12">{premiumAlert.text}</p>
            <button onClick={() => setPremiumAlert(null)} className="btn-primary w-full py-6">Entendido</button>
          </div>
        </div>
      )}

      {/* MODAL REPORTE PROFESIONAL (2 pasos) */}
      <BottomModal show={reportDialog.show} onClose={() => { setReportDialog({ show: false, reqId: null }); setPendingReport(null); }}>
        <div className="text-5xl mb-6 italic">🚩</div>
        <h3 className="text-2xl font-black uppercase italic text-red-600 mb-4">Reportar al Profesional</h3>
        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-8 leading-relaxed px-4">
          Esta acción notificará al profesional y cancelará el servicio.
        </p>

        {!pendingReport ? (
          <div className="space-y-3 mb-4 text-left">
            {REPORT_REASONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setPendingReport(r)}
                className="w-full flex items-center gap-5 p-5 rounded-[2rem] bg-red-50 dark:bg-red-900/10 border border-transparent group text-left active:scale-95 transition-all"
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
              ¿Confirmas este reporte? El servicio quedará cancelado y el profesional será notificado.
            </p>
            <button
              onClick={() => handleConfirmReport(pendingReport)}
              disabled={!!actionId}
              className="w-full py-5 bg-red-600 text-white rounded-[2rem] font-black text-[10px] uppercase shadow-2xl mb-3 active:scale-95 transition-all disabled:opacity-30"
            >
              {actionId ? "Procesando..." : "Confirmar Denuncia"}
            </button>
            <button onClick={() => setPendingReport(null)} className="w-full py-2 text-[9px] font-black uppercase text-zinc-300 italic">
              Volver
            </button>
          </div>
        )}
      </BottomModal>

      {/* MODAL CANCELAR PEDIDO */}
      <BottomModal show={cancelDialog.show} onClose={() => setCancelDialog({ show: false, reqId: null })}>
        <h3 className="text-2xl font-black uppercase mb-4 italic">Anular Pedido</h3>
        <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest mb-6 leading-relaxed">
          Selecciona el motivo de cancelación.
        </p>
        <div className="space-y-3 mb-4">
          {CANCEL_REASONS.map((r) => (
            <button
              key={r.id}
              onClick={() => confirmCancelRequest(r.label)}
              disabled={!!actionId}
              className="w-full flex items-center gap-5 p-5 rounded-[2rem] bg-zinc-50 dark:bg-zinc-900 border border-transparent text-left active:scale-95 transition-all disabled:opacity-30"
            >
              <span className="text-2xl italic">{r.icon}</span>
              <span className="text-[11px] font-black uppercase italic">{r.label}</span>
            </button>
          ))}
        </div>
      </BottomModal>

      {/* MODAL RECHAZAR PROPUESTA */}
      <BottomModal show={rejectDialog.show} onClose={() => setRejectDialog({ show: false, reqId: null })}>
        <h3 className="text-2xl font-black uppercase mb-4 italic">Rechazar Propuesta</h3>
        <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest mb-6 leading-relaxed">
          Tu feedback ayuda al profesional a mejorar futuras propuestas.
        </p>
        <div className="space-y-3 mb-4 text-left">
          {REJECT_REASONS.map((r) => (
            <button
              key={r.id}
              onClick={() => confirmRejectProposal(r.label)}
              disabled={!!actionId}
              className="w-full flex items-center gap-5 p-5 rounded-[2rem] bg-zinc-50 dark:bg-zinc-900 border border-transparent active:scale-95 transition-all disabled:opacity-30"
            >
              <span className="text-2xl italic">{r.icon}</span>
              <span className="text-[11px] font-black uppercase italic">{r.label}</span>
            </button>
          ))}
        </div>
      </BottomModal>

      {/* MODAL RATING AL PROFESIONAL */}
      {showRatingModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/95 backdrop-blur-2xl text-center animate-fade-in">
          <div className="bg-white dark:bg-black w-full max-w-sm rounded-[4rem] p-12 shadow-2xl border dark:border-zinc-800">
            <div className="text-6xl mb-6 italic">⭐</div>
            <h2 className="text-3xl font-black uppercase italic mb-2 dark:text-white">Certifica el Trabajo</h2>
            <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest mb-8 leading-relaxed">
              Tu reseña aparecerá en el perfil público del profesional.
            </p>
            <div className="flex justify-center gap-3 mb-8">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  onClick={() => setStars(num)}
                  className={`text-4xl transition-all ${num <= stars ? "text-black dark:text-white scale-110" : "text-zinc-200 dark:text-zinc-800"}`}
                >★</button>
              ))}
            </div>
            {/* Mensaje contextual según puntaje */}
            {stars > 0 && (
              <p className="text-[9px] text-zinc-400 mb-6 italic">
                {stars === 5 ? "¡Excelente! Puedes agregar etiquetas positivas." :
                 stars >= 3 ? "Buen servicio. Tu opinión es valiosa." :
                 "Lamentamos que no haya sido ideal. Si hubo una falla grave, puedes reportar desde la tarjeta."}
              </p>
            )}
            {stars === 5 && (
              <div className="mb-10">
                <p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest mb-4">¿Qué destacas?</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {POSITIVE_TAGS.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase italic border transition-all active:scale-95
                        ${selectedTags.includes(tag.id)
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "bg-transparent border-zinc-100 dark:border-zinc-800 text-zinc-400"}`}
                    >
                      {tag.icon} {tag.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={handleSendRating}
              disabled={stars === 0}
              className="btn-primary w-full py-6 disabled:opacity-30"
            >
              Publicar Reseña
            </button>
            <button
              onClick={() => { setShowRatingModal(false); setStars(0); setSelectedTags([]); }}
              className="mt-4 w-full py-2 text-[9px] font-black uppercase text-zinc-300 italic"
            >
              Omitir
            </button>
          </div>
        </div>
      )}

      {/* CONFIRM DIALOG GENÉRICO */}
      {confirmDialog.show && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-fade-in text-center">
          <div className="bg-white dark:bg-black w-full max-w-sm rounded-[3.5rem] p-12 shadow-2xl border dark:border-zinc-800">
            <div className="text-5xl mb-6 italic">🗑️</div>
            <h3 className="text-2xl font-black uppercase italic dark:text-white mb-4">{confirmDialog.title}</h3>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-10 leading-relaxed">{confirmDialog.text}</p>
            <div className="space-y-4">
              <button
                onClick={confirmDialog.onConfirm}
                disabled={!!actionId}
                className={`w-full py-6 rounded-[2rem] text-[11px] font-black uppercase disabled:opacity-30 active:scale-95 transition-all
                  ${confirmDialog.type === "danger" ? "bg-red-600 text-white" : "btn-primary"}`}
              >
                {actionId ? "Eliminando..." : "Confirmar"}
              </button>
              <button
                onClick={() => setConfirmDialog((p) => ({ ...p, show: false }))}
                className="w-full py-2 text-zinc-400 text-[10px] font-black uppercase opacity-30 italic"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW DE FOTO */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/95 z-[550] flex items-center justify-center p-6 animate-fade-in"
          onClick={() => setPreviewUrl(null)}
        >
          <img
            src={previewUrl}
            className="max-w-full max-h-[80vh] rounded-[2rem] shadow-2xl object-contain animate-reveal"
            alt="evidencia"
          />
          <button
            className="absolute top-8 right-8 w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white font-black text-xl"
            onClick={() => setPreviewUrl(null)}
          >×</button>
        </div>
      )}

      <style>{`
        .animate-reveal { animation: reveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes reveal { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.4s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TARJETA DE SOLICITUD
───────────────────────────────────────────── */
function RequestCard({
  req, formatDate, formatCountdown, user,
  handleAcceptProposal, handleRetryPayment,
  openRejectDialog, openReportDialog,
  deleteRequest, approveJob,
  actionId, cancelRequest, setPreviewUrl,
}) {
  const status   = req.status || "pendiente";
  const cfg      = STATUS_MAP[status] || STATUS_MAP["pendiente"];
  const total    = req.proposedPrice ?? ((req.laborCost || 0) + (req.materialsCost || 0));
  const hasBudget= req.proposedPrice || req.laborCost;
  const showPin  = status === "asignado" && req.securityPin;
  const canReport= !status.includes("cancelado") && status !== "completado" && !!req.acceptedById;
  const hasUnreadMessages = req.unreadChat && req.lastMessageSenderId !== user.uid;

  /* Contador para confirmar trabajo */
  const hoursLeft = status === "esperando_confirmacion"
    ? formatCountdown(req.completedAt, 48)
    : null;

  return (
    <article className={`
      bg-[var(--card-light)] dark:bg-[var(--card-dark)] border rounded-[3rem] p-8 shadow-soft
      relative overflow-hidden transition-all active:scale-[0.98]
      ${status === "en_progreso"
        ? "border-black dark:border-white ring-1 ring-black/5"
        : status === "esperando_pago"
        ? "border-emerald-500 ring-2 ring-emerald-500/10"
        : status === "esperando_confirmacion"
        ? "border-amber-400 ring-1 ring-amber-400/20"
        : "border-[var(--border-light)] dark:border-[var(--border-dark)]"}
    `}>

      {/* HEADER */}
      <div className="flex justify-between items-start mb-8 text-left">
        <div className="overflow-hidden flex-1 mr-4">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-black uppercase truncate italic leading-none">{req.problemType}</h2>
            {canReport && (
              <button
                onClick={openReportDialog}
                className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs active:scale-75 shadow-sm shrink-0"
                title="Reportar incidencia"
              >🚩</button>
            )}
          </div>
          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest opacity-40">
            Pedido • {formatDate(req.createdAt)}
          </p>
        </div>
        <div className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border shrink-0 flex items-center gap-2 ${cfg.class}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </div>
      </div>

      <div className="space-y-6">

        {/* BLOQUE: PAGO PENDIENTE */}
        {status === "esperando_pago" && (
          <div className="p-8 bg-emerald-50 dark:bg-emerald-950/20 rounded-[2.5rem] border border-emerald-100 dark:border-emerald-800/30 text-center animate-reveal">
            <div className="text-4xl mb-4 italic">💳</div>
            <p className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 tracking-widest mb-6 px-4 leading-relaxed">
              Tu solicitud Flash requiere el pago de prioridad para ser publicada.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleRetryPayment}
                disabled={actionId === req.id}
                className="w-full py-5 bg-emerald-600 text-white rounded-[2rem] font-black text-[10px] uppercase shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-30"
              >
                {actionId === req.id ? "Conectando..." : "Finalizar Pago ⚡"}
              </button>
              <button
                onClick={cancelRequest}
                className="w-full py-2 text-[9px] font-black uppercase text-emerald-800/30 dark:text-emerald-400/20 italic"
              >
                Cancelar pedido
              </button>
            </div>
          </div>
        )}

        {/* BANNER: PROFESIONAL EN CAMINO */}
        {req.isOnWay && status === "asignado" && (
          <div className="bg-blue-600 p-5 rounded-[2rem] flex items-center gap-5 shadow-xl shadow-blue-500/20 text-left">
            <span className="text-3xl shrink-0">🚗</span>
            <div>
              <p className="text-[10px] font-black uppercase text-white mb-1 italic">¡El profesional va en camino!</p>
              <p className="text-[8px] font-bold text-blue-100 uppercase tracking-widest leading-tight">
                Ten listo el PIN de seguridad al recibirlo.
              </p>
            </div>
          </div>
        )}

        {/* PIN DE SEGURIDAD */}
        {showPin && (
          <div className="bg-zinc-900 dark:bg-white p-8 rounded-[2.5rem] text-center border dark:border-white/10 shadow-2xl">
            <p className="text-[8px] font-black uppercase tracking-[0.5em] text-zinc-500 mb-2">
              PIN de Seguridad
            </p>
            <p className="text-[7px] font-bold text-blue-400 uppercase tracking-widest mb-6">
              Muéstralo solo al profesional cuando llegue
            </p>
            <div className="flex justify-center gap-4 mb-4">
              {req.securityPin.split("").map((digit, i) => (
                <span key={i} className="text-5xl font-black italic text-white dark:text-black">
                  {digit}
                </span>
              ))}
            </div>
            <p className="text-[7px] text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
              No compartas este código por chat ni teléfono
            </p>
          </div>
        )}

        {/* BLOQUE: PROFESIONAL ASIGNADO */}
        {req.acceptedById && (
          <div className="flex items-center justify-between p-6 bg-white dark:bg-zinc-900 rounded-[2.5rem] border dark:border-zinc-800 shadow-soft">
            <div className="flex items-center gap-4 text-left">
              <div className="w-12 h-12 rounded-2xl bg-black text-white dark:bg-white dark:text-black flex items-center justify-center font-black text-xl italic">
                {req.professionalName?.charAt(0) || "P"}
              </div>
              <div>
                <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1 leading-none">Especialista</p>
                <p className="text-sm font-black uppercase italic truncate w-32 leading-none">
                  {req.professionalName || "Asignado"}
                </p>
                {req.professionalRatingAvg > 0 && (
                  <p className="text-[8px] font-black text-amber-500 mt-1">
                    ★ {req.professionalRatingAvg.toFixed(1)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {req.professionalPhone && (
                <a
                  href={`tel:${req.professionalPhone}`}
                  className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shadow-sm active:scale-90 transition-all"
                  title="Llamar al profesional"
                >📞</a>
              )}
              <Link
                to={`/profesional/${req.acceptedById}`}
                className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center italic font-black text-xs active:scale-90 transition-all"
                title="Ver perfil del profesional"
              >i</Link>
            </div>
          </div>
        )}

        {/* PRESUPUESTO */}
        {hasBudget && status !== "esperando_pago" ? (
          <div className="bg-zinc-100 dark:bg-zinc-900/50 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 text-center relative overflow-hidden">
            <p className="text-[8px] font-black uppercase opacity-30 mb-4 tracking-[0.3em] leading-none">Inversión Total</p>
            <div className="flex justify-center items-center gap-3 mb-2">
              <span className="text-4xl font-black tracking-tighter italic">${total.toLocaleString("es-CL")}</span>
              <span className={`px-2 py-0.5 rounded-lg text-[7px] font-black uppercase
                ${req.proposalStatus === "aceptada"
                  ? "bg-black text-white dark:bg-white dark:text-black shadow-lg"
                  : "bg-amber-100 text-amber-700 animate-pulse"}`}
              >
                {req.proposalStatus === "aceptada" ? "Aprobado" : "En revisión"}
              </span>
            </div>
            {req.laborCost > 0 && req.materialsCost > 0 && (
              <div className="flex justify-center gap-6 mt-4">
                <div>
                  <p className="text-[7px] uppercase text-zinc-400 tracking-widest">Mano de obra</p>
                  <p className="text-[10px] font-black">${req.laborCost.toLocaleString("es-CL")}</p>
                </div>
                <div>
                  <p className="text-[7px] uppercase text-zinc-400 tracking-widest">Materiales</p>
                  <p className="text-[10px] font-black">${req.materialsCost.toLocaleString("es-CL")}</p>
                </div>
              </div>
            )}
          </div>
        ) : (!status.includes("cancelado") && status !== "completado" && status !== "esperando_pago") && (
          <div className="p-10 rounded-[3rem] border-2 border-dashed border-zinc-100 dark:border-zinc-800 flex flex-col items-center justify-center bg-zinc-50/10 italic">
            <span className="text-3xl mb-4 animate-bounce">⏳</span>
            <p className="text-[9px] font-black uppercase text-zinc-400 tracking-[0.4em] text-center leading-relaxed">
              Esperando propuesta del especialista
            </p>
          </div>
        )}

        {/* BLOQUE: ESPERANDO CONFIRMACIÓN */}
        {status === "esperando_confirmacion" && (
          <div className="p-6 bg-amber-50 dark:bg-amber-950/20 rounded-[2.5rem] border border-amber-100 dark:border-amber-800/30 text-left">
            <p className="text-[8px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-widest mb-2">
              El profesional declaró haber terminado
            </p>
            <p className="text-[10px] text-amber-800 dark:text-amber-300 leading-relaxed">
              Revisa que el trabajo esté completo y en buen estado antes de confirmar. Una vez que certifiques, el servicio queda cerrado.
            </p>
            {req.completedAt && (
              <p className="text-[8px] text-amber-600/60 mt-3 uppercase tracking-widest">
                Declarado el {formatDate(req.completedAt)}
              </p>
            )}
            {hoursLeft !== null && (
              <p className="text-[8px] font-black text-amber-600 mt-2 uppercase tracking-widest">
                ⏳ Se auto-confirmará en {hoursLeft}h si no actúas
              </p>
            )}
          </div>
        )}

        {/* FOTOS DE EVIDENCIA */}
        {req.photoUrls && req.photoUrls.length > 0 && (
          <div>
            <p className="text-[8px] font-black uppercase text-zinc-400 mb-3 tracking-widest">Evidencia fotográfica</p>
            <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
              {req.photoUrls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  onClick={() => setPreviewUrl(url)}
                  className="w-20 h-20 rounded-2xl object-cover shrink-0 border dark:border-zinc-800 shadow-sm active:scale-95 transition-all cursor-pointer"
                  alt={`evidencia ${i + 1}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── ACCIONES ── */}
        <div className="space-y-4 pt-2">

          {/* CHAT — visible en estados activos */}
          {["asignado", "en_progreso", "esperando_confirmacion"].includes(status) ? (
            <Link
              to={`/chat/${req.id}`}
              className="relative btn-primary w-full py-5 flex justify-center items-center gap-3 italic"
            >
              💬 Canal Seguro
              {hasUnreadMessages && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-5 w-5 bg-red-600 items-center justify-center text-[8px] font-black text-white border-2 border-white dark:border-zinc-900 shadow-lg">1</span>
                </span>
              )}
            </Link>
          ) : status !== "esperando_pago" && (
            <div className="w-full py-4 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700 font-black text-[9px] uppercase text-center italic">
              💬 Canal cerrado
            </div>
          )}

          {/* ACEPTAR / RECHAZAR PROPUESTA */}
          {req.proposalStatus === "pendiente" && req.acceptedById && !status.includes("cancelado") && (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleAcceptProposal}
                disabled={actionId === req.id}
                className="py-5 rounded-[2rem] bg-black text-white dark:bg-white dark:text-black font-black text-[10px] uppercase active:scale-95 shadow-2xl disabled:opacity-30 transition-all"
              >
                Confirmar
              </button>
              <button
                onClick={openRejectDialog}
                disabled={actionId === req.id}
                className="py-5 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 text-zinc-400 font-black text-[10px] uppercase active:scale-95 disabled:opacity-30 transition-all"
              >
                Rechazar
              </button>
            </div>
          )}

          {/* APROBAR TRABAJO FINALIZADO */}
          {status === "esperando_confirmacion" && (
            <button
              onClick={() => approveJob(req)}
              disabled={actionId === req.id}
              className="w-full py-6 rounded-[2rem] bg-emerald-600 text-white font-black text-[10px] uppercase shadow-2xl animate-bounce disabled:opacity-30 active:scale-95 transition-all"
            >
              ✅ Confirmar y Certificar Trabajo
            </button>
          )}

          {/* CANCELAR PEDIDO (pendiente sin asignar) */}
          {status === "pendiente" && !req.acceptedById && (
            <button
              onClick={cancelRequest}
              disabled={actionId === req.id}
              className="w-full py-5 rounded-[2rem] border border-red-100 text-red-400 font-black text-[10px] uppercase opacity-50 italic active:scale-95 disabled:opacity-20 transition-all"
            >
              Anular Pedido
            </button>
          )}

          {/* BORRAR REGISTRO */}
          {(status.includes("cancelado") || status === "completado") && (
            <button
              onClick={() => deleteRequest(req.id)}
              disabled={actionId === req.id}
              className="w-full py-5 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 text-zinc-400 font-black text-[10px] uppercase opacity-50 active:scale-95 disabled:opacity-20 transition-all"
            >
              Borrar Registro
            </button>
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