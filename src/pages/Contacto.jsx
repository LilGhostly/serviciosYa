import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection, addDoc, serverTimestamp,
  query, where, orderBy, onSnapshot,
  limit, getDocs, Timestamp,
} from "firebase/firestore";
import { useUser } from "../context/UserContext";

/* ─────────────────────────────────────────────
   CONFIGURACIÓN
───────────────────────────────────────────── */
const TOPICS = [
  { id: "bug",      label: "Error técnico (Bug)",           icon: "👾" },
  { id: "payment",  label: "Problema con Pagos / Diamantes", icon: "💰" },
  { id: "account",  label: "Gestión de cuenta",             icon: "👤" },
  { id: "security", label: "Seguridad o fraude",            icon: "🛡️" },
  { id: "feature",  label: "Sugerencia de mejora",          icon: "💡" },
  { id: "other",    label: "Otro asunto",                   icon: "⚙️" },
];

const MIN_MSG_LEN   = 20;
const MAX_MSG_LEN   = 1000;
const MAX_TICKETS_PER_DAY = 3; // anti-spam

const STATUS_LABELS = {
  abierto:     { label: "Abierto",     color: "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400" },
  en_revision: { label: "En revisión", color: "bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400"   },
  resuelto:    { label: "Resuelto",    color: "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400" },
  cerrado:     { label: "Cerrado",     color: "bg-zinc-100 dark:bg-zinc-900 text-zinc-500"                          },
};

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function Contacto() {
  const { user }  = useUser();
  const navigate  = useNavigate();

  const [loading,    setLoading]    = useState(false);
  const [sent,       setSent]       = useState(false);
  const [ticketId,   setTicketId]   = useState("");
  const [myTickets,  setMyTickets]  = useState([]);
  const [submitError,setSubmitError]= useState("");

  const [form, setForm] = useState({ topic: "", message: "" });
  const msgLen = form.message.trim().length;
  const isValid = form.topic && msgLen >= MIN_MSG_LEN;

  /* ─── Tickets del usuario ─── */
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, "tickets"),
      where("uid", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    return onSnapshot(q, (snap) => {
      setMyTickets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Error tickets:", err));
  }, [user?.uid]);

  /* ─── Verificar rate limit ─── */
  const checkRateLimit = useCallback(async () => {
    const since = Timestamp.fromDate(new Date(Date.now() - 24 * 3600 * 1000));
    const q = query(
      collection(db, "tickets"),
      where("uid", "==", user.uid),
      where("createdAt", ">=", since)
    );
    const snap = await getDocs(q);
    return snap.size >= MAX_TICKETS_PER_DAY;
  }, [user?.uid]);

  /* ─── Enviar ticket ─── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || loading || !user) return;
    setSubmitError("");

    /* Validación adicional */
    if (form.message.trim().length > MAX_MSG_LEN)
      return setSubmitError(`El mensaje no puede superar ${MAX_MSG_LEN} caracteres.`);

    try {
      setLoading(true);

      /* Anti-spam: verificar límite diario */
      const limited = await checkRateLimit();
      if (limited) {
        setSubmitError(`Límite alcanzado: máximo ${MAX_TICKETS_PER_DAY} tickets por día. Intenta mañana o revisa tus tickets anteriores.`);
        return;
      }

      const shortId = Math.random().toString(36).substring(2, 8).toUpperCase();

      await addDoc(collection(db, "tickets"), {
        ticketNumber: shortId,
        uid:          user.uid,
        email:        user.email   || "Sin email",
        role:         user.role    || "cliente",
        topic:        form.topic,
        message:      form.message.trim(),
        status:       "abierto",
        createdAt:    serverTimestamp(),
        /* NO guardar datos sensibles adicionales */
      });

      setTicketId(shortId);
      setSent(true);
      setForm({ topic: "", message: "" });

    } catch (err) {
      console.error("Error al crear ticket:", err);
      setSubmitError("No se pudo enviar el ticket. Verifica tu conexión e intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  const formatTicketDate = (ts) => {
    if (!ts?.toDate) return "";
    return ts.toDate().toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  };

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] font-sans pb-32 transition-colors duration-500 overflow-x-hidden text-left">

      {/* NAV */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-[var(--border-light)] dark:border-[var(--border-dark)] px-6 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center active:scale-90 transition-all border border-zinc-200 dark:border-zinc-800"
          >
            <svg className="w-4 h-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span className="text-[9px] font-black uppercase tracking-[0.4em] opacity-30 italic">Soporte Técnico</span>
          <div className="w-10" />
        </div>
      </nav>

      <main className="max-w-md mx-auto px-6 pt-10 space-y-10">

        {/* HEADER */}
        <header className="animate-reveal">
          <h1 className="text-3xl font-black tracking-tighter uppercase italic leading-none mb-3 dark:text-white">
            Centro de <span className="opacity-20 italic">Soporte</span>
          </h1>
          <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest leading-relaxed max-w-[260px] italic">
            Reporta errores o solicita ayuda. Respondemos en horario hábil (Lun–Vie 9–18h).
          </p>
        </header>

        {/* TICKETS ANTERIORES */}
        {myTickets.length > 0 && (
          <section className="animate-reveal" style={{ animationDelay: "0.08s" }}>
            <h3 className="text-[8px] font-black uppercase text-zinc-400 tracking-widest mb-4 ml-1 italic">
              Mis tickets ({myTickets.length})
            </h3>
            <div className="space-y-3">
              {myTickets.map((t) => {
                const statusCfg = STATUS_LABELS[t.status] || STATUS_LABELS.abierto;
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-4 bg-[var(--card-light)] dark:bg-[var(--card-dark)] rounded-[2rem] border border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-base shrink-0">
                        {TOPICS.find((tp) => tp.label === t.topic)?.icon || "📋"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase italic dark:text-white truncate leading-none mb-1">
                          #{t.ticketNumber}
                        </p>
                        <p className="text-[7px] font-bold text-zinc-400 uppercase tracking-widest truncate">
                          {t.topic} · {formatTicketDate(t.createdAt)}
                        </p>
                      </div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-full text-[7px] font-black uppercase tracking-widest shrink-0 ml-3 ${statusCfg.color}`}>
                      {statusCfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* FORMULARIO */}
        <section className="animate-reveal" style={{ animationDelay: "0.12s" }}>
          <h3 className="text-[8px] font-black uppercase text-zinc-400 tracking-widest mb-6 ml-1 italic">
            Nuevo ticket
          </h3>

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>

            {/* ERROR */}
            {submitError && (
              <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-[2rem] animate-shake">
                <p className="text-[9px] font-black uppercase text-red-600 dark:text-red-400 tracking-widest text-center leading-relaxed">
                  ⚠️ {submitError}
                </p>
              </div>
            )}

            {/* SELECTOR DE TEMA */}
            <div className="space-y-3">
              <label className="text-[8px] font-black uppercase text-zinc-400 tracking-[0.2em] ml-1 block italic">
                Categoría *
              </label>
              <div className="space-y-2">
                {TOPICS.map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, topic: topic.label }))}
                    className={`w-full flex items-center gap-4 p-4 rounded-[2rem] border text-left transition-all active:scale-[0.98] ${
                      form.topic === topic.label
                        ? "border-black dark:border-white bg-black dark:bg-white text-white dark:text-black shadow-lg"
                        : "border-[var(--border-light)] dark:border-[var(--border-dark)] bg-[var(--card-light)] dark:bg-[var(--card-dark)] text-zinc-500 hover:border-zinc-400"
                    }`}
                  >
                    <span className="text-xl shrink-0">{topic.icon}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest italic">{topic.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* MENSAJE */}
            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[8px] font-black uppercase text-zinc-400 tracking-[0.2em] italic">
                  Descripción del caso *
                </label>
                <span className={`text-[8px] font-black ${
                  msgLen < MIN_MSG_LEN
                    ? "text-zinc-300"
                    : msgLen > MAX_MSG_LEN * 0.9
                    ? "text-amber-500"
                    : "text-emerald-500"
                }`}>
                  {msgLen}/{MAX_MSG_LEN}
                </span>
              </div>
              <textarea
                value={form.message}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_MSG_LEN)
                    setForm((f) => ({ ...f, message: e.target.value }));
                }}
                rows={5}
                className="input-base !rounded-[2rem] resize-none italic font-medium leading-relaxed !bg-zinc-50 dark:!bg-zinc-900 border border-zinc-100 dark:border-zinc-800 w-full"
                placeholder={`Describe el error paso a paso o tu idea de mejora. Mínimo ${MIN_MSG_LEN} caracteres...`}
              />
              {msgLen > 0 && msgLen < MIN_MSG_LEN && (
                <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest ml-1 italic">
                  Faltan {MIN_MSG_LEN - msgLen} caracteres mínimos
                </p>
              )}
            </div>

            {/* SUBMIT */}
            <button
              type="submit"
              disabled={!isValid || loading}
              className={`w-full py-6 rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all italic flex items-center justify-center gap-3 shadow-xl ${
                isValid && !loading
                  ? "bg-black dark:bg-white text-white dark:text-black active:scale-95"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
              }`}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar ticket →"
              )}
            </button>

            <p className="text-[7px] font-bold text-zinc-300 dark:text-zinc-700 text-center leading-relaxed italic">
              Máximo {MAX_TICKETS_PER_DAY} tickets por día · Respuesta en horario hábil
            </p>
          </form>
        </section>
      </main>

      {/* MODAL ÉXITO */}
      {sent && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl animate-fade-in">
          <div className="bg-white dark:bg-black rounded-[4rem] p-12 w-full max-w-sm text-center border dark:border-zinc-800 shadow-2xl animate-bounce-in">
            <div className="text-5xl mb-6 italic">🛰️</div>
            <h3 className="text-2xl font-black uppercase italic mb-3 dark:text-white leading-none">
              Ticket #{ticketId}
            </h3>
            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-3 leading-relaxed">
              Tu reporte fue enviado al equipo de soporte.
            </p>
            <p className="text-[8px] text-zinc-400 mb-10 leading-relaxed italic">
              Puedes seguir el estado en tu lista de tickets. Respondemos en horario hábil, Lun–Vie 9–18h.
            </p>
            <button
              onClick={() => setSent(false)}
              className="btn-primary w-full py-6 !rounded-[2rem]"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes reveal { from{opacity:0;transform:translateY(15px)} to{opacity:1;transform:translateY(0)} }
        .animate-reveal { animation: reveal 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
        .animate-fade-in { animation: fadeIn 0.35s ease-out; }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .animate-bounce-in { animation: bounceIn 0.4s cubic-bezier(0.16,1,0.3,1); }
        @keyframes bounceIn { from{transform:scale(0.93);opacity:0} to{transform:scale(1);opacity:1} }
        .animate-shake { animation: shake 0.35s ease-in-out; }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
      `}</style>
    </div>
  );
}