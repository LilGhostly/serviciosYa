import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection, query, where, orderBy, getDocs, doc,
  serverTimestamp, addDoc, limit, startAfter,
  runTransaction, increment, getDoc,
} from "firebase/firestore";
import { useUser } from "../context/UserContext";

/* ─────────────────────────────────────────────
   UTILIDADES
───────────────────────────────────────────── */
const deg2rad = (d) => d * (Math.PI / 180);

const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getTimeAgo = (ts) => {
  if (!ts) return "Recién publicado";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60)   return "Hace unos instantes";
  if (s < 3600) return `Hace ${Math.floor(s / 60)} min`;
  if (s < 86400)return `Hace ${Math.floor(s / 3600)} h`;
  return `Hace ${Math.floor(s / 86400)} día${Math.floor(s / 86400) !== 1 ? "s" : ""}`;
};

const formatCLP = (val) => {
  const n = String(val || "").replace(/\D/g, "");
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const PAGE_SIZE   = 15;
const MIN_DETAIL  = 20;
const MIN_LABOR   = 1000;

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function ServiciosDisponibles() {
  const { user }  = useUser();
  const navigate  = useNavigate();

  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [available,    setAvailable]    = useState([]);
  const [previewUrl,   setPreviewUrl]   = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [lastVisible,  setLastVisible]  = useState(null);
  const [hasMore,      setHasMore]      = useState(true);
  const [queryError,   setQueryError]   = useState("");

  /* GPS */
  const [proLocation,  setProLocation]  = useState(null);
  const [locationError,setLocationError]= useState(false);
  const [maxDistance,  setMaxDistance]  = useState("all");

  /* Modales */
  const [isModalOpen,       setIsModalOpen]       = useState(false);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [isConfirmOpen,     setIsConfirmOpen]      = useState(false); // confirmación antes de cobrar créditos
  const [selectedJob,       setSelectedJob]        = useState(null);
  const [neededCredits,     setNeededCredits]      = useState(0);

  /* Propuesta */
  const [proposal,      setProposal]      = useState({ laborCost: "", materialsCost: "", materialsDetail: "" });
  const [proposalError, setProposalError] = useState("");

  /* Seguridad: verificar que el profesional no está bloqueado */
  const isBlocked        = user?.profile?.isBlocked || false;
  const reputationPoints = user?.profile?.reputationPoints || 0;

  // Un profesional ahora puede tener más de un rubro (ver profile.rubros).
  // Se mantiene compatibilidad con cuentas antiguas que solo tienen
  // profile.rubro (string) en vez del array nuevo.
  // "userRubrosKey" es un string estable para usar en dependencias de
  // efectos/callbacks sin que un array nuevo en cada render dispare loops.
  const userRubrosKey = user?.profile?.rubros?.length
    ? user.profile.rubros.join(",")
    : (user?.profile?.rubro || "");
  const userRubros = userRubrosKey ? userRubrosKey.split(",") : [];
  const userRubro  = userRubros[0] || null; // usado solo para mostrar texto en la UI

  /* ─── GPS ─── */
  useEffect(() => {
    if (!("geolocation" in navigator)) { setLocationError(true); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setProLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()    => setLocationError(true),
      { timeout: 8000, maximumAge: 300000 }
    );
  }, []);

  /* ─── CARGA INICIAL ─── */
  useEffect(() => {
    if (userRubros.length) loadInitial();
  }, [userRubrosKey]);

  const loadInitial = useCallback(async () => {
    try {
      setLoading(true);
      setQueryError("");
      const q = query(
        collection(db, "requests"),
        where("status", "==", "pendiente"),
        where("problemType", "in", userRubros),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAvailable(sortList(list));
        setLastVisible(snap.docs[snap.docs.length - 1]);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } else {
        setAvailable([]);
        setHasMore(false);
      }
    } catch (err) {
      console.error(err);
      if (err.message?.includes("requires an index")) {
        setQueryError("Índice de Firestore pendiente. Abre la consola (F12) y sigue el enlace azul para crearlo.");
      } else {
        setQueryError("No se pudieron cargar los servicios. Intenta nuevamente.");
      }
    } finally {
      setLoading(false);
    }
  }, [userRubrosKey]);

  const fetchMore = async () => {
    if (!lastVisible || loadingMore) return;
    try {
      setLoadingMore(true);
      const q = query(
        collection(db, "requests"),
        where("status", "==", "pendiente"),
        where("problemType", "in", userRubros),
        orderBy("createdAt", "desc"),
        startAfter(lastVisible),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const newList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAvailable((prev) => sortList([...prev, ...newList]));
        setLastVisible(snap.docs[snap.docs.length - 1]);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } catch (err) { console.error(err); }
    finally { setLoadingMore(false); }
  };

  /* Urgentes primero, luego por fecha */
  const sortList = (list) =>
    [...list].sort((a, b) => {
      if (a.urgency === "urgente" && b.urgency !== "urgente") return -1;
      if (a.urgency !== "urgente" && b.urgency === "urgente") return  1;
      return 0;
    });

  /* ─── ABRIR MODAL PROPUESTA ─── */
  const openProposalModal = (job) => {
    /* Seguridad: profesional bloqueado no puede postular */
    if (isBlocked) {
      alert("Tu cuenta está suspendida. No puedes postular a servicios.");
      return;
    }
    const creditCost    = job.urgency === "urgente" ? 6 : 4;
    const currentBalance= user?.credits?.balance ?? user?.profile?.credits?.balance ?? 0;
    if (currentBalance < creditCost) {
      setNeededCredits(creditCost);
      setIsCreditModalOpen(true);
      return;
    }
    setSelectedJob(job);
    setProposal({ laborCost: "", materialsCost: "", materialsDetail: "" });
    setProposalError("");
    setIsModalOpen(true);
  };

  /* ─── VALIDAR Y PEDIR CONFIRMACIÓN ─── */
  const handleProposalSubmit = () => {
    const labor     = Number(proposal.laborCost);
    const materials = Number(proposal.materialsCost || 0);
    const detail    = proposal.materialsDetail.trim();

    if (!labor || labor < MIN_LABOR)
      return setProposalError(`El costo mínimo de mano de obra es $${MIN_LABOR.toLocaleString("es-CL")}.`);
    if (labor > 50_000_000)
      return setProposalError("El monto ingresado parece incorrecto. Verifica.");
    if (materials > 50_000_000)
      return setProposalError("El monto de materiales parece incorrecto. Verifica.");
    if (detail.length < MIN_DETAIL)
      return setProposalError(`Describe el servicio con más detalle (mín. ${MIN_DETAIL} caracteres).`);

    setProposalError("");
    setIsConfirmOpen(true); // mostrar confirmación antes de descontar créditos
  };

  /* ─── ENVIAR PROPUESTA (tras confirmación) ─── */
  const sendProposal = async () => {
    if (!selectedJob || processingId) return;
    setIsConfirmOpen(false);

    const labor     = Number(proposal.laborCost);
    const materials = Number(proposal.materialsCost || 0);
    const detail    = proposal.materialsDetail.trim();
    const creditCost= selectedJob.urgency === "urgente" ? 6 : 4;

    setProcessingId(selectedJob.id);
    setProposalError("");

    try {
      const userRef    = doc(db, "users", user.uid);
      const reqRef     = doc(db, "requests", selectedJob.id);
      const txRef      = doc(collection(db, "transactions"));

      await runTransaction(db, async (tx) => {
        const userDoc = await tx.get(userRef);
        const reqDoc  = await tx.get(reqRef);

        if (!reqDoc.exists())                       throw new Error("El servicio ya no existe.");
        if (reqDoc.data().status !== "pendiente")   throw new Error("Este trabajo ya fue tomado por otro profesional.");
        if (reqDoc.data().acceptedById === user.uid) throw new Error("Ya postulaste a este servicio.");

        const balance    = userDoc.data()?.credits?.balance ?? 0;
        const newBalance = balance - creditCost;
        if (newBalance < 0) throw new Error("Saldo insuficiente. Recarga tus créditos.");

        /* Descontar créditos */
        tx.update(userRef, {
          "credits.balance":    newBalance,
          "credits.totalSpent": increment(creditCost),
        });

        /* Registrar transacción */
        tx.set(txRef, {
          userId:      user.uid,
          amount:      -creditCost,
          type:        "use",
          description: `Postulación: ${selectedJob.problemType}`,
          requestId:   selectedJob.id,
          createdAt:   serverTimestamp(),
        });

        /* Asignar trabajo */
        tx.update(reqRef, {
          acceptedById:    user.uid,
          professionalName:user.profile?.name || "Profesional",
          professionalPhone:user.profile?.phone || null,
          professionalRatingAvg: user.profile?.ratingStats?.totalReviews >= 3
            ? (user.profile.ratingStats.totalStars / user.profile.ratingStats.totalReviews)
            : null,
          status:          "asignado",
          acceptedAt:      serverTimestamp(),
          laborCost:       labor,
          materialsCost:   materials,
          materialsDetail: detail,
          proposedPrice:   labor + materials,
          proposedBy:      user.uid,
          proposalStatus:  "pendiente",
        });

        /* Inicializar chat */
        tx.set(doc(db, "chats", selectedJob.id), {
          createdAt:      serverTimestamp(),
          clientId:       reqDoc.data().clientId,
          professionalId: user.uid,
          lastMessage:    "Propuesta enviada",
          lastUpdate:     serverTimestamp(),
        }, { merge: true });
      });

      /* Mensaje de propuesta en el chat */
      await addDoc(collection(db, "chats", selectedJob.id, "messages"), {
        system:      true,
        type:        "proposal",
        text:        `💰 Cotización enviada`,
        details: {
          laborCost:       labor,
          materialsCost:   materials,
          materialsDetail: detail,
        },
        totalPrice:  labor + materials,
        createdAt:   serverTimestamp(),
      });

      /* Notificación al cliente */
      try {
        const reqSnap = await getDoc(doc(db, "requests", selectedJob.id));
        const clientId = reqSnap.data()?.clientId;
        if (clientId) {
          await addDoc(collection(db, "notifications"), {
            userId:    clientId,
            type:      "new_proposal",
            title:     "Nueva Propuesta Recibida",
            message:   `${user.profile?.name || "Un profesional"} envió una cotización para "${selectedJob.problemType}" por $${(labor + materials).toLocaleString("es-CL")}.`,
            requestId: selectedJob.id,
            read:      false,
            createdAt: serverTimestamp(),
          });
        }
      } catch {}

      setAvailable((prev) => prev.filter((r) => r.id !== selectedJob.id));
      setIsModalOpen(false);
      navigate(`/chat/${selectedJob.id}`);

    } catch (err) {
      setProposalError(err.message || "Error al procesar la postulación. Intenta nuevamente.");
    } finally {
      setProcessingId(null);
    }
  };

  /* ─── FILTRAR Y ENRIQUECER CON DISTANCIA ─── */
  const processedJobs = available
    .map((req) => ({
      ...req,
      distance: proLocation
        ? getDistanceKm(proLocation.lat, proLocation.lng, req.lat, req.lng)
        : null,
    }))
    .filter((req) => {
      if (maxDistance === "all") return true;
      if (req.distance === null) return true; // sin GPS → mostrar todo
      return req.distance <= Number(maxDistance);
    });

  if (!user) return null;

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] font-sans pb-32 overflow-x-hidden transition-colors duration-500">
      <div className="max-w-md mx-auto px-6 pt-10 text-left">

        {/* HEADER */}
        <header className="mb-8 flex flex-col gap-6 animate-reveal">
          <div className="flex justify-between items-center">
            <Link
              to="/prof/dashboard"
              className="w-12 h-12 rounded-2xl bg-[var(--card-light)] dark:bg-[var(--card-dark)] flex items-center justify-center shadow-soft border active:scale-90 transition-all"
            >
              <svg className="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"/>
              </svg>
            </Link>
            <button
              onClick={loadInitial}
              className="w-12 h-12 rounded-2xl bg-[var(--card-light)] dark:bg-[var(--card-dark)] flex items-center justify-center border shadow-soft active:rotate-180 transition-transform duration-700"
              title="Actualizar"
            >
              <svg className={`w-5 h-5 ${loading ? "animate-spin" : "opacity-40"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
          </div>

          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase italic leading-none">
              Bolsa <span className="opacity-20 italic">de</span> Trabajo
            </h1>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mt-2 italic">
              {userRubros.length > 1 ? `${userRubros.length} especialidades` : userRubro} · {processedJobs.length} disponible{processedJobs.length !== 1 ? "s" : ""}
            </p>
          </div>
        </header>

        {/* BANNER BLOQUEADO */}
        {isBlocked && (
          <div className="mb-6 p-5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-[2rem] text-center animate-reveal">
            <p className="text-[9px] font-black uppercase text-red-600 dark:text-red-400 tracking-widest leading-relaxed">
              🚫 Tu cuenta está suspendida. No puedes postular a servicios hasta que el equipo de soporte levante la restricción.
            </p>
          </div>
        )}

        {/* BANNER STRIKES */}
        {!isBlocked && reputationPoints > 0 && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-[2rem] text-center">
            <p className="text-[8px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-widest">
              ⚠️ Tienes {reputationPoints} strike{reputationPoints !== 1 ? "s" : ""}. Al llegar a 3 tu cuenta será suspendida.
            </p>
          </div>
        )}

        {/* ERROR DE QUERY */}
        {queryError && (
          <div className="p-6 bg-red-50 dark:bg-red-950/20 border border-red-300 dark:border-red-700/50 rounded-[2rem] text-red-600 dark:text-red-400 text-[9px] font-black uppercase tracking-widest text-center mb-8 animate-shake leading-relaxed">
            {queryError}
          </div>
        )}

        {/* FILTROS GPS */}
        <div className="mb-8 animate-reveal" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-center gap-3 mb-3 px-1">
            <span className="text-[9px] font-black uppercase tracking-widest opacity-40 italic">
              Distancia
            </span>
            {locationError ? (
              <span className="text-[8px] text-amber-600 font-bold uppercase tracking-widest bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 rounded-lg">
                📵 GPS inactivo
              </span>
            ) : proLocation ? (
              <span className="text-[8px] text-emerald-600 font-bold uppercase tracking-widest bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-lg">
                📍 GPS activo
              </span>
            ) : (
              <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-widest">
                Obteniendo ubicación...
              </span>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {[
              { id: "all", label: "Todos" },
              { id: "5",   label: "< 5 km" },
              { id: "10",  label: "< 10 km" },
              { id: "20",  label: "< 20 km" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setMaxDistance(f.id)}
                disabled={f.id !== "all" && locationError}
                className={`shrink-0 px-5 py-2.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all italic border
                  ${maxDistance === f.id
                    ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white shadow-lg"
                    : "bg-transparent border-[var(--border-light)] dark:border-[var(--border-dark)] text-zinc-500 hover:border-black dark:hover:border-white"}
                  disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* LISTA */}
        {loading ? (
          <div className="py-24 flex flex-col items-center opacity-20">
            <div className="w-8 h-8 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-[9px] font-black uppercase tracking-widest italic">Cargando trabajos...</p>
          </div>
        ) : processedJobs.length === 0 && !queryError ? (
          <div className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] rounded-[3rem] p-16 text-center border animate-reveal italic">
            <span className="text-6xl block mb-6 opacity-10">📡</span>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-4">
              {maxDistance !== "all" ? "Sin pedidos en ese radio" : "Sin pedidos disponibles"}
            </p>
            {maxDistance !== "all" && (
              <button
                onClick={() => setMaxDistance("all")}
                className="text-[9px] font-black uppercase tracking-widest underline opacity-50"
              >
                Ver todos los pedidos
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8 animate-reveal" style={{ animationDelay: "0.15s" }}>
            {processedJobs.map((req) => (
              <JobCard
                key={req.id}
                req={req}
                onPostulate={openProposalModal}
                onPreview={setPreviewUrl}
                isBlocked={isBlocked}
              />
            ))}

            {hasMore && (
              <button
                onClick={fetchMore}
                disabled={loadingMore}
                className="w-full py-6 border border-[var(--border-light)] dark:border-[var(--border-dark)] rounded-[2rem] text-[10px] font-black uppercase tracking-[0.3em] opacity-50 active:scale-95 transition-all hover:opacity-80 disabled:opacity-20"
              >
                {loadingMore ? "Cargando..." : "Ver más servicios"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════
          MODAL PROPUESTA
      ═══════════════════════════════════════ */}
      {isModalOpen && selectedJob && (
        <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-end justify-center p-4 animate-fade-in">
          <div
            className="bg-white dark:bg-black rounded-[3.5rem] w-full max-w-sm shadow-2xl p-10 animate-slide-up border dark:border-zinc-800 overflow-y-auto max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto mb-8 opacity-30" />

            <header className="text-center mb-8">
              <h2 className="text-2xl font-black uppercase italic leading-none mb-2">
                Tu <span className="opacity-20">Cotización</span>
              </h2>
              <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest italic">
                Desglose transparente para el cliente
              </p>
            </header>

            {/* Resumen del trabajo */}
            <div className="p-5 bg-zinc-50 dark:bg-zinc-900 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 mb-8 text-left">
              <p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest mb-1">Trabajo</p>
              <p className="text-sm font-black uppercase italic">{selectedJob.problemType}</p>
              {selectedJob.description && (
                <p className="text-[9px] text-zinc-500 mt-2 leading-relaxed line-clamp-2">
                  "{selectedJob.description}"
                </p>
              )}
            </div>

            {proposalError && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-700/30 text-red-600 dark:text-red-400 rounded-[2rem] text-[9px] font-black uppercase tracking-widest animate-shake italic text-center leading-relaxed">
                ⚠️ {proposalError}
              </div>
            )}

            <div className="space-y-6">
              {/* Costos */}
              <div className="grid grid-cols-2 gap-4 text-left">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1 leading-none block">
                    Mano de obra *
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-zinc-300 text-xs select-none">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="input-base !bg-zinc-100 dark:!bg-zinc-900 !pl-8 font-black italic text-lg"
                      value={formatCLP(proposal.laborCost)}
                      onChange={(e) =>
                        setProposal({ ...proposal, laborCost: e.target.value.replace(/\D/g, "") })
                      }
                      placeholder="0"
                      maxLength={10}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1 leading-none block">
                    Materiales
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-zinc-300 text-xs select-none">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="input-base !bg-zinc-100 dark:!bg-zinc-900 !pl-8 font-black italic text-lg"
                      value={formatCLP(proposal.materialsCost)}
                      onChange={(e) =>
                        setProposal({ ...proposal, materialsCost: e.target.value.replace(/\D/g, "") })
                      }
                      placeholder="0"
                      maxLength={10}
                    />
                  </div>
                </div>
              </div>

              {/* Detalle técnico */}
              <div className="text-left space-y-2">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-none">
                    Detalle técnico *
                  </label>
                  <span className={`text-[8px] font-black ${
                    proposal.materialsDetail.trim().length >= MIN_DETAIL
                      ? "text-emerald-500"
                      : "text-zinc-300"
                  }`}>
                    {proposal.materialsDetail.trim().length}/{MIN_DETAIL}
                  </span>
                </div>
                <textarea
                  rows={4}
                  className="input-base !bg-zinc-100 dark:!bg-zinc-900 resize-none italic font-medium text-sm"
                  value={proposal.materialsDetail}
                  onChange={(e) =>
                    setProposal({ ...proposal, materialsDetail: e.target.value })
                  }
                  placeholder="Ej: Incluye revisión completa, repuestos originales y garantía de 3 meses..."
                  maxLength={500}
                />
              </div>

              {/* Total */}
              <div className="p-6 bg-zinc-50 dark:bg-zinc-900/50 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 italic">Total cliente</span>
                  <span className="text-2xl font-black tracking-tighter italic dark:text-white">
                    ${(Number(proposal.laborCost || 0) + Number(proposal.materialsCost || 0)).toLocaleString("es-CL")}
                  </span>
                </div>
              </div>

              {/* Costo en créditos */}
              <div className="p-4 bg-zinc-900 dark:bg-zinc-100 rounded-[2rem] flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-300 dark:text-zinc-600">
                  Costo de postulación
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black text-white dark:text-black italic">
                    {selectedJob.urgency === "urgente" ? 6 : 4}
                  </span>
                  <span className="text-xl">💎</span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  onClick={handleProposalSubmit}
                  disabled={!!processingId}
                  className="btn-primary w-full py-6 !rounded-[2.5rem] shadow-2xl italic disabled:opacity-30 active:scale-95 transition-all"
                >
                  Revisar y Enviar Propuesta →
                </button>
                <button
                  onClick={() => { setIsModalOpen(false); setProposalError(""); }}
                  className="w-full py-2 text-[10px] font-black uppercase tracking-widest opacity-30 italic"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          MODAL CONFIRMACIÓN (2 pasos antes de cobrar créditos)
      ═══════════════════════════════════════ */}
      {isConfirmOpen && selectedJob && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-8 animate-fade-in">
          <div className="bg-white dark:bg-black rounded-[4rem] p-12 w-full max-w-sm text-center shadow-2xl border dark:border-zinc-800 animate-bounce-in">
            <div className="text-5xl mb-6">📤</div>
            <h3 className="text-2xl font-black uppercase italic mb-3 dark:text-white leading-none">
              Confirmar Envío
            </h3>
            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-6 leading-relaxed">
              Al confirmar se descontarán{" "}
              <span className="text-black dark:text-white font-black">
                {selectedJob.urgency === "urgente" ? 6 : 4} 💎
              </span>{" "}
              de tu saldo y se enviará tu propuesta al cliente.
            </p>
            {/* Resumen de la propuesta */}
            <div className="p-5 bg-zinc-50 dark:bg-zinc-900 rounded-[2rem] mb-8 text-left space-y-2 border border-zinc-100 dark:border-zinc-800">
              <div className="flex justify-between">
                <span className="text-[8px] uppercase tracking-widest text-zinc-400 font-black">Mano de obra</span>
                <span className="text-[10px] font-black">${Number(proposal.laborCost).toLocaleString("es-CL")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[8px] uppercase tracking-widest text-zinc-400 font-black">Materiales</span>
                <span className="text-[10px] font-black">${Number(proposal.materialsCost || 0).toLocaleString("es-CL")}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-100 dark:border-zinc-800 pt-2 mt-2">
                <span className="text-[8px] uppercase tracking-widest text-zinc-400 font-black">Total cliente</span>
                <span className="text-sm font-black italic">
                  ${(Number(proposal.laborCost) + Number(proposal.materialsCost || 0)).toLocaleString("es-CL")}
                </span>
              </div>
            </div>
            <button
              onClick={sendProposal}
              disabled={!!processingId}
              className="btn-primary w-full py-6 !rounded-[2rem] shadow-2xl mb-3 disabled:opacity-30"
            >
              {processingId ? "Enviando..." : "Confirmar y Enviar"}
            </button>
            <button
              onClick={() => setIsConfirmOpen(false)}
              className="w-full py-2 text-[9px] font-black uppercase tracking-widest opacity-30 italic"
            >
              Volver a editar
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          MODAL CRÉDITOS INSUFICIENTES
      ═══════════════════════════════════════ */}
      {isCreditModalOpen && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-md flex items-end justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-black rounded-[3.5rem] w-full max-w-sm p-12 text-center shadow-2xl border dark:border-zinc-800 animate-slide-up">
            <div className="text-6xl mb-6 italic">💎</div>
            <h3 className="text-2xl font-black uppercase italic mb-4 dark:text-white leading-none">
              Créditos Insuficientes
            </h3>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-4 leading-relaxed px-4 italic">
              Necesitas{" "}
              <span className="text-black dark:text-white font-black">{neededCredits} 💎</span>{" "}
              para postular a este servicio.
            </p>
            <p className="text-[9px] text-zinc-400 mb-10 leading-relaxed px-4">
              Los créditos garantizan que solo profesionales serios postulen a cada trabajo.
            </p>
            <button
              onClick={() => { setIsCreditModalOpen(false); navigate("/comprar-creditos"); }}
              className="btn-primary w-full py-6 !rounded-[2rem] shadow-2xl mb-3"
            >
              Recargar Créditos
            </button>
            <button
              onClick={() => setIsCreditModalOpen(false)}
              className="w-full py-2 text-[9px] font-black uppercase tracking-widest opacity-30 italic"
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {/* ZOOM IMAGEN */}
      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          className="fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-6 animate-fade-in"
        >
          <img
            src={previewUrl}
            className="max-w-full max-h-[80vh] rounded-[2rem] shadow-2xl object-contain animate-reveal"
            alt="evidencia"
          />
          <button
            className="absolute top-8 right-8 w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white font-black text-xl"
            onClick={() => setPreviewUrl(null)}
          >
            ×
          </button>
        </div>
      )}

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes reveal { from { opacity:0; transform:translateY(15px); } to { opacity:1; transform:translateY(0); } }
        .animate-reveal { animation: reveal 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
        .animate-slide-up { animation: slideUp 0.5s cubic-bezier(0.16,1,0.3,1); }
        @keyframes slideUp { from { transform:translateY(100%); } to { transform:translateY(0); } }
        .animate-bounce-in { animation: bounceIn 0.4s cubic-bezier(0.16,1,0.3,1); }
        @keyframes bounceIn { from { transform:scale(0.93); opacity:0; } to { transform:scale(1); opacity:1; } }
        .animate-fade-in { animation: fadeIn 0.35s ease-out; }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        .animate-shake { animation: shake 0.35s ease-in-out; }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TARJETA DE TRABAJO
───────────────────────────────────────────── */
function JobCard({ req, onPostulate, onPreview, isBlocked }) {
  const isUrgente = req.urgency === "urgente";

  const scheduleLabel = () => {
    if (!req.scheduleType || req.scheduleType === "lo_antes_posible") return "⚡ Lo antes posible";
    if (req.scheduledDate) {
      const d = new Date(req.scheduledDate);
      return `📅 ${d.toLocaleDateString("es-CL", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return "📅 Programado";
  };

  const distanceLabel = (dist) => {
    if (dist === null) return null;
    if (dist < 1)    return `${Math.round(dist * 1000)} m de ti`;
    return `${dist.toFixed(1)} km de ti`;
  };

  const distLbl = distanceLabel(req.distance);

  return (
    <article className={`
      bg-[var(--card-light)] dark:bg-[var(--card-dark)] border rounded-[3rem] p-8 shadow-soft
      relative overflow-hidden transition-all active:scale-[0.98]
      ${isUrgente
        ? "border-black dark:border-white ring-1 ring-black/5"
        : "border-[var(--border-light)] dark:border-[var(--border-dark)]"}
    `}>

      {/* URGENTE — franja superior */}
      {isUrgente && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-black dark:bg-white rounded-t-[3rem]" />
      )}

      {/* HEADER */}
      <div className="flex justify-between items-start mb-8 text-left">
        <div className="overflow-hidden flex-1 mr-4">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-2xl font-black uppercase truncate italic leading-none">{req.problemType}</h2>
            {isUrgente && <span className="text-lg animate-bounce shrink-0">🔥</span>}
          </div>
          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest italic opacity-40">
            {getTimeAgo(req.createdAt)}
          </p>
        </div>
        <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border shrink-0 ${
          isUrgente
            ? "bg-black text-white dark:bg-white dark:text-black border-transparent shadow-lg"
            : "bg-transparent text-zinc-400 border-zinc-200 dark:border-zinc-700"
        }`}>
          {isUrgente ? "Urgente" : "Normal"}
        </span>
      </div>

      <div className="space-y-6">

        {/* CLIENTE */}
        <div className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-black text-white dark:bg-white dark:text-black flex items-center justify-center font-black italic text-lg shadow-md">
              {req.clientSnapshot?.name?.charAt(0) || "C"}
            </div>
            <div>
              <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-0.5 leading-none">Solicitante</p>
              <p className="text-sm font-black uppercase italic truncate w-32 leading-none">
                {req.clientSnapshot?.name || "Cliente"}
              </p>
              {req.clientSnapshot?.ratingAvg > 0 && (
                <p className="text-[8px] font-black text-amber-500 mt-1">
                  ★ {req.clientSnapshot.ratingAvg.toFixed(1)}
                </p>
              )}
            </div>
          </div>
          <Link
            to={`/client-profile/${req.clientId}`}
            className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-black italic text-xs text-zinc-500 active:scale-90 transition-transform"
            title="Ver perfil del cliente"
          >
            i
          </Link>
        </div>

        {/* UBICACIÓN + AGENDA */}
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-left px-1">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-base shrink-0">📍</div>
            <div>
              <p className="text-sm font-black uppercase italic leading-none mb-1">
                {req.clientSnapshot?.comuna || req.commune || "Ubicación"}
              </p>
              {distLbl && (
                <p className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest italic">
                  {distLbl}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 text-left px-1">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-base shrink-0">⏰</div>
            <p className="text-sm font-black text-blue-600 dark:text-blue-400 uppercase italic leading-none">
              {scheduleLabel()}
            </p>
          </div>
        </div>

        {/* DESCRIPCIÓN */}
        {req.description && (
          <div className="p-5 bg-white dark:bg-zinc-900/50 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 text-left italic">
            <p className="text-[9px] font-black uppercase text-zinc-400 tracking-widest mb-2">Descripción</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium leading-relaxed line-clamp-3">
              "{req.description}"
            </p>
          </div>
        )}

        {/* FOTOS + CRÉDITOS */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2">
            {req.photoUrls?.slice(0, 3).map((url, i) => (
              <button
                key={i}
                onClick={() => onPreview(url)}
                className="w-14 h-14 rounded-[1.25rem] overflow-hidden border border-zinc-200 dark:border-zinc-800 shrink-0 shadow-sm active:scale-90 transition-all"
              >
                <img src={url} className="w-full h-full object-cover" alt="" />
              </button>
            ))}
            {(!req.photoUrls || req.photoUrls.length === 0) && (
              <div className="w-14 h-14 rounded-[1.25rem] bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-lg opacity-30">
                📷
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Costo</p>
            <div className="flex items-center justify-end gap-1.5">
              <p className="text-3xl font-black dark:text-white tracking-tighter italic">
                {isUrgente ? 6 : 4}
              </p>
              <span className="text-xl">💎</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => onPostulate(req)}
          disabled={isBlocked}
          className="btn-primary w-full py-6 !rounded-[2.2rem] shadow-2xl italic uppercase text-[11px] tracking-widest active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isBlocked ? "Cuenta suspendida" : "Postular a este Servicio"}
        </button>
      </div>
    </article>
  );
}