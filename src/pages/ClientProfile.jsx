import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useUser } from "../context/UserContext";

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function ClientProfile() {
  const { uid }   = useParams();
  const navigate  = useNavigate();
  const { user }  = useUser();

  const [clientData, setClientData] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [notFound,   setNotFound]   = useState(false);

  useEffect(() => {
    if (!uid) return;

    const fetchClient = async () => {
      try {
        setLoading(true);
        const snap = await getDoc(doc(db, "users", uid));

        if (!snap.exists()) { setNotFound(true); return; }

        const d = snap.data();

        /* Solo profesionales autenticados pueden ver perfiles de clientes */
        if (!user?.uid) { navigate("/login"); return; }
        if (user?.role !== "profesional") { navigate(-1); return; }

        /* Proyectar solo campos públicos — sin datos sensibles */
        setClientData({
          name:          d.profile?.name  || d.name  || "Cliente",
          comuna:        d.profile?.comuna || d.comuna || "",
          region:        d.profile?.region || d.region || "",
          photoUrl:      d.profile?.photoUrl || d.photoURL || "",
          ratingStats:   d.ratingStats    || { totalStars: 0, totalReviews: 0 },
          reputationPts: d.reputationPoints || 0,
          isBlocked:     d.isBlocked      || false,
          emailVerified: d.emailVerified  || false,
          createdAt:     d.createdAt,
          /* NO exponer: phone, email, address, rut, credits */
        });
      } catch (err) {
        console.error("Error perfil cliente:", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchClient();
  }, [uid, user, navigate]);

  /* ─── LOADING ─── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* ─── NO ENCONTRADO ─── */
  if (notFound || !clientData) {
    return (
      <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-6xl mb-8 opacity-10 italic">👤</p>
        <p className="text-zinc-400 font-black uppercase tracking-[0.3em] text-[10px] italic mb-8">
          Perfil no disponible
        </p>
        <button
          onClick={() => navigate(-1)}
          className="text-black dark:text-white font-black uppercase text-[10px] tracking-widest underline underline-offset-8"
        >
          Regresar
        </button>
      </div>
    );
  }

  /* Cálculos */
  const stats    = clientData.ratingStats;
  const average  = stats.totalReviews >= 3
    ? (stats.totalStars / stats.totalReviews).toFixed(1)
    : null;
  const joinDate = clientData.createdAt?.toDate
    ? clientData.createdAt.toDate().toLocaleDateString("es-CL", { month: "long", year: "numeric" })
    : null;
  const strikes  = clientData.reputationPts;

  const tierLabel = (() => {
    if (stats.totalReviews >= 10) return "Veterano";
    if (stats.totalReviews >= 3)  return "Recurrente";
    return "Nuevo";
  })();

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] font-sans pb-16 transition-colors duration-500 overflow-x-hidden">

      {/* HEADER CON AVATAR */}
      <div className="relative pt-20 pb-12 px-6 text-center bg-[var(--card-light)] dark:bg-[var(--card-dark)] rounded-b-[4rem] border-b border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft animate-reveal">

        <button
          onClick={() => navigate(-1)}
          className="absolute top-8 left-6 w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center active:scale-90 transition-all border border-zinc-200 dark:border-zinc-800"
        >
          <svg className="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Avatar */}
        <div className="relative inline-block mb-6">
          <div className="w-32 h-32 rounded-[2.5rem] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black flex items-center justify-center text-5xl font-black italic shadow-2xl border-8 border-white dark:border-zinc-900 overflow-hidden">
            {clientData.photoUrl ? (
              <img src={clientData.photoUrl} className="w-full h-full object-cover" alt="avatar" />
            ) : (
              clientData.name.charAt(0)
            )}
          </div>
          {clientData.emailVerified && (
            <div className="absolute -bottom-2 -right-2 bg-blue-600 text-white p-2 rounded-xl shadow-lg border-4 border-white dark:border-zinc-900">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
          )}
        </div>

        <h1 className="text-3xl font-black uppercase tracking-tighter italic leading-none mb-2 dark:text-white">
          {clientData.name}
        </h1>
        <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.3em] italic">
          Cliente · {tierLabel}
        </p>
        {clientData.comuna && (
          <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mt-1.5 italic">
            📍 {clientData.comuna}{clientData.region ? `, ${clientData.region}` : ""}
          </p>
        )}

        {/* Banner strikes */}
        {strikes >= 1 && (
          <div className={`mt-5 inline-block px-5 py-2 rounded-full text-[8px] font-black uppercase tracking-widest ${
            strikes >= 2
              ? "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400"
              : "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
          }`}>
            ⚠️ {strikes} reporte{strikes > 1 ? "s" : ""} de conducta
          </div>
        )}
      </div>

      <main className="max-w-md mx-auto px-6 pt-6 space-y-4">

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 animate-reveal" style={{ animationDelay: "0.08s" }}>
          <div className="bg-zinc-900 dark:bg-white p-6 rounded-[2.5rem] text-center shadow-xl">
            <span className="text-xl font-black italic block text-white dark:text-black leading-none mb-1">
              {average ?? "—"}
            </span>
            <span className="text-[7px] font-bold uppercase tracking-widest text-white/50 dark:text-black/50">
              Rating
            </span>
          </div>
          <div className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] p-6 rounded-[2.5rem] text-center border border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft">
            <span className="text-xl font-black italic block dark:text-white leading-none mb-1">
              {stats.totalReviews}
            </span>
            <span className="text-[7px] font-bold uppercase tracking-widest opacity-40">Pedidos</span>
          </div>
          <div className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] p-6 rounded-[2.5rem] text-center border border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft">
            <span className={`text-base font-black italic block leading-none mb-1 uppercase ${
              strikes === 0 ? "text-emerald-500" : strikes >= 2 ? "text-red-500" : "text-amber-500"
            }`}>
              {strikes === 0 ? "OK" : strikes}
            </span>
            <span className="text-[7px] font-bold uppercase tracking-widest opacity-40">
              {strikes === 0 ? "Conducta" : "Strike" + (strikes > 1 ? "s" : "")}
            </span>
          </div>
        </div>

        {/* DETALLES */}
        <div
          className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] rounded-[3rem] p-8 border border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft space-y-6 animate-reveal"
          style={{ animationDelay: "0.16s" }}
        >
          {clientData.comuna && (
            <InfoRow icon="📍" label="Zona frecuente" value={clientData.region
              ? `${clientData.comuna}, ${clientData.region}`
              : clientData.comuna}
            />
          )}
          <div className="h-px bg-zinc-100 dark:bg-zinc-800 opacity-50" />
          <InfoRow
            icon={clientData.emailVerified ? "✅" : "⚪"}
            label="Verificación"
            value={clientData.emailVerified ? "Cuenta verificada" : "Sin verificar"}
            highlight={clientData.emailVerified}
          />
          {joinDate && (
            <>
              <div className="h-px bg-zinc-100 dark:bg-zinc-800 opacity-50" />
              <InfoRow icon="📅" label="Miembro desde" value={joinDate} />
            </>
          )}
        </div>

        {/* SEGURIDAD */}
        <div
          className="p-5 bg-zinc-50 dark:bg-zinc-900/50 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 text-center animate-reveal"
          style={{ animationDelay: "0.24s" }}
        >
          <p className="text-[7px] font-black uppercase tracking-widest text-zinc-400 leading-relaxed mb-3">
            🔒 Nunca realices pagos fuera de la plataforma ni solicites datos bancarios por el chat.
          </p>
          <p className="text-[7px] font-bold text-zinc-300 dark:text-zinc-700 leading-relaxed">
            Si detectas comportamiento sospechoso, repórtalo desde la tarjeta del trabajo.
          </p>
        </div>
      </main>

      <style>{`
        .animate-reveal { animation: reveal 0.6s cubic-bezier(0.16,1,0.3,1) forwards; opacity:0; }
        @keyframes reveal { to { opacity:1; transform:translateY(0); } from { opacity:0; transform:translateY(16px); } }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTES
───────────────────────────────────────────── */
function InfoRow({ icon, label, value, highlight }) {
  return (
    <div className="flex items-center gap-5">
      <div className="w-11 h-11 rounded-2xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center text-xl shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest leading-none mb-1.5 italic">
          {label}
        </p>
        <p className={`text-sm font-bold italic truncate ${
          highlight ? "text-blue-600 dark:text-blue-400" : "dark:text-zinc-200"
        }`}>
          {value}
        </p>
      </div>
    </div>
  );
}