import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection, query, where, orderBy,
  getDocs, limit, startAfter,
} from "firebase/firestore";
import { useUser } from "../context/UserContext";

const PAGE_SIZE = 15;

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function HistorialProfesional() {
  const { user }  = useUser();
  const navigate  = useNavigate();

  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [history,     setHistory]     = useState([]);
  const [filter,      setFilter]      = useState("todos");
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore,     setHasMore]     = useState(true);
  const [loadError,   setLoadError]   = useState("");

  /* ─── Stats derivadas ─── */
  const stats = useMemo(() => ({
    total:    history.length,
    exitosos: history.filter((h) => h.status === "completado").length,
    ingresos: history
      .filter((h) => h.status === "completado")
      .reduce((acc, h) => acc + (Number(h.proposedPrice) || 0), 0),
  }), [history]);

  /* ─── Carga inicial ─── */
  useEffect(() => {
    if (!user?.uid) return;
    fetchHistory();
  }, [user?.uid]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setLoadError("");
      const q = query(
        collection(db, "requests"),
        where("acceptedById", "==", user.uid),
        where("status", "in", ["completado", "cancelado_cliente", "cancelado_profesional"]),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setHistory(snap.docs.map((d) => normalizeItem(d)));
        setLastVisible(snap.docs[snap.docs.length - 1]);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } else {
        setHistory([]);
        setHasMore(false);
      }
    } catch (err) {
      console.error(err);
      setLoadError("No se pudo cargar el historial. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  const fetchMore = async () => {
    if (!lastVisible || loadingMore) return;
    try {
      setLoadingMore(true);
      const q = query(
        collection(db, "requests"),
        where("acceptedById", "==", user.uid),
        where("status", "in", ["completado", "cancelado_cliente", "cancelado_profesional"]),
        orderBy("createdAt", "desc"),
        startAfter(lastVisible),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setHistory((prev) => [...prev, ...snap.docs.map((d) => normalizeItem(d))]);
        setLastVisible(snap.docs[snap.docs.length - 1]);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  /* Normalizar item — fecha como Date para evitar llamadas repetidas */
  const normalizeItem = (d) => {
    const data = d.data();
    return {
      id:            d.id,
      ...data,
      createdAt:     data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    };
  };

  /* ─── Filtrado ─── */
  const filtered = useMemo(() => {
    if (filter === "completado") return history.filter((h) => h.status === "completado");
    if (filter === "cancelado")  return history.filter((h) => h.status.includes("cancelado"));
    return history;
  }, [history, filter]);

  if (!user) return null;

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] font-sans pb-32 overflow-x-hidden transition-colors duration-500 text-left">

      {/* HEADER STICKY */}
      <header className="bg-[var(--bg-light)]/80 dark:bg-[var(--bg-dark)]/80 backdrop-blur-xl border-b border-[var(--border-light)] dark:border-[var(--border-dark)] sticky top-0 z-40 px-6 py-8">
        <div className="max-w-md mx-auto">
          {/* Nav */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => navigate(-1)}
              className="w-12 h-12 rounded-2xl bg-[var(--card-light)] dark:bg-[var(--card-dark)] flex items-center justify-center shadow-soft border border-[var(--border-light)] dark:border-[var(--border-dark)] active:scale-90 transition-all"
            >
              <svg className="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <h1 className="text-sm font-black uppercase tracking-[0.3em] italic dark:text-white">
              Historial <span className="opacity-20">Pro</span>
            </h1>
            <div className="w-12" />
          </div>

          {/* Stats compactas */}
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
            <SmallStat label="Cargados"      value={stats.total}    />
            <SmallStat label="Completados"   value={stats.exitosos} highlight />
            <SmallStat
              label="Ingresos totales"
              value={`$${stats.ingresos.toLocaleString("es-CL")}`}
            />
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 pt-10">

        {/* FILTROS */}
        <div className="flex gap-3 mb-10 overflow-x-auto no-scrollbar pb-1">
          {[
            { id: "todos",      label: "Todos"      },
            { id: "completado", label: "Exitosos"   },
            { id: "cancelado",  label: "Cerrados"   },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-7 py-3 rounded-[2rem] text-[9px] font-black uppercase tracking-[0.2em] transition-all shrink-0 border italic
                ${filter === f.id
                  ? "bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-xl"
                  : "bg-transparent text-zinc-400 border-[var(--border-light)] dark:border-[var(--border-dark)]"}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ERROR */}
        {loadError && (
          <div className="mb-8 p-5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-[2rem] text-center">
            <p className="text-[9px] font-black uppercase text-red-600 dark:text-red-400 tracking-widest leading-relaxed">
              ⚠️ {loadError}
            </p>
            <button
              onClick={fetchHistory}
              className="mt-3 text-[8px] font-black uppercase tracking-widest underline text-red-500"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* LISTA */}
        {loading ? (
          <div className="flex flex-col items-center py-32 opacity-20">
            <div className="w-8 h-8 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin mb-6" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] italic">Consultando archivos...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] rounded-[3rem] p-16 text-center border border-[var(--border-light)] dark:border-[var(--border-dark)] animate-reveal">
            <span className="text-6xl block mb-8 opacity-10 italic">📜</span>
            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.3em] italic">
              {filter === "todos" ? "Sin registros previos" : "Sin registros en este filtro"}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {filtered.map((item, i) => (
              <HistoryCard key={item.id} item={item} index={i} />
            ))}

            {/* Cargar más — solo si estamos en "todos" para no romper la paginación */}
            {hasMore && filter === "todos" && (
              <button
                onClick={fetchMore}
                disabled={loadingMore}
                className="w-full py-6 mt-6 border border-[var(--border-light)] dark:border-[var(--border-dark)] rounded-[2rem] text-[10px] font-black uppercase tracking-[0.3em] opacity-40 hover:opacity-70 active:scale-95 transition-all disabled:opacity-20"
              >
                {loadingMore ? "Cargando..." : "Ver más registros"}
              </button>
            )}
          </div>
        )}
      </main>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes reveal { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .animate-reveal { animation: reveal 0.6s cubic-bezier(0.16,1,0.3,1) forwards; }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTES
───────────────────────────────────────────── */
function SmallStat({ label, value, highlight }) {
  return (
    <div className={`flex-shrink-0 px-6 py-4 rounded-[1.5rem] border transition-all min-w-[140px] text-left
      ${highlight
        ? "bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-lg"
        : "bg-[var(--card-light)] dark:bg-[var(--card-dark)] border-[var(--border-light)] dark:border-[var(--border-dark)]"}`}
    >
      <p className="text-[7px] font-black uppercase tracking-widest opacity-40 mb-2 leading-none italic">{label}</p>
      <p className="text-sm font-black italic tracking-tighter leading-none">{value}</p>
    </div>
  );
}

function HistoryCard({ item, index }) {
  const isSuccess = item.status === "completado";
  const isProCancel = item.status === "cancelado_profesional";

  const dateStr = item.createdAt instanceof Date
    ? item.createdAt.toLocaleDateString("es-CL", { day: "2-digit", month: "short" })
    : "—";

  return (
    <div
      className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] rounded-[2.5rem] p-6 border border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft flex items-center gap-5 animate-reveal active:scale-[0.98] transition-all"
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
    >
      {/* Icono */}
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl shrink-0 italic ${
        isSuccess
          ? "bg-emerald-50 dark:bg-emerald-950/20"
          : "bg-red-50 dark:bg-red-950/20 opacity-60"
      }`}>
        {isSuccess ? "💎" : isProCancel ? "🚪" : "✕"}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex justify-between items-start gap-2 mb-1.5">
          <p className="text-[11px] font-black uppercase tracking-tighter dark:text-white italic truncate">
            {item.problemType}
          </p>
          <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest shrink-0">
            {dateStr}
          </span>
        </div>
        <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest leading-none italic">
          {item.clientSnapshot?.comuna || item.commune || "Sin localidad"}
        </p>
        {isProCancel && item.cancelReason && (
          <p className="text-[7px] text-red-400 font-bold italic mt-1 leading-tight line-clamp-1">
            Motivo: {item.cancelReason}
          </p>
        )}
      </div>

      {/* Monto + estado */}
      <div className="text-right shrink-0">
        <p className="text-sm font-black italic tracking-tighter leading-none mb-2 dark:text-white">
          ${(Number(item.proposedPrice) || 0).toLocaleString("es-CL")}
        </p>
        <span className={`px-2.5 py-1 rounded-lg text-[7px] font-black uppercase tracking-widest border ${
          isSuccess
            ? "border-emerald-500/20 text-emerald-600 dark:text-emerald-400 bg-emerald-50/10"
            : "border-red-400/20 text-red-400 bg-red-50/10"
        }`}>
          {isSuccess ? "Completado" : isProCancel ? "Abandonado" : "Cancelado"}
        </span>
      </div>
    </div>
  );
}