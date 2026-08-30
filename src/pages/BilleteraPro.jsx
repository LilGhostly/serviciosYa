import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection, query, where, orderBy,
  limit, onSnapshot, doc,
} from "firebase/firestore";
import { useUser } from "../context/UserContext";

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const formatFullDate = (ts) => {
  if (!ts) return "Reciente";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });
};

const formatTime = (ts) => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
};

const TX_ICONS = {
  purchase: "🛍️",
  bonus:    "🎁",
  use:      "🛠️",
  refund:   "↩️",
};

const TX_LABELS = {
  purchase: "Adquisición",
  bonus:    "Incentivo",
  use:      "Consumo",
  refund:   "Reembolso",
};

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function BilleteraPro() {
  const { user }  = useUser();
  const navigate  = useNavigate();

  const [loading,      setLoading]      = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [liveCredits,  setLiveCredits]  = useState(0);
  const [totalSpent,   setTotalSpent]   = useState(0);
  const [totalEarned,  setTotalEarned]  = useState(0);
  const [selectedTx,   setSelectedTx]  = useState(null);
  const [filter,       setFilter]       = useState("all"); // all | in | out

  /* ─── Saldo en tiempo real ─── */
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const c = data.credits;
      if (typeof c === "object") {
        setLiveCredits(c.balance   ?? 0);
        setTotalSpent( c.totalSpent ?? 0);
        setTotalEarned(c.totalEarned ?? 0);
      } else {
        setLiveCredits(c ?? 0);
      }
    });
    return () => unsub();
  }, [user?.uid]);

  /* ─── Transacciones ─── */
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      /* Solo mostrar transacciones del usuario actual — defensa en profundidad */
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((t) => t.userId === user.uid);
      setTransactions(list);
      setLoading(false);
    }, (err) => {
      console.error("Billetera error:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  /* Filtrado */
  const filtered = transactions.filter((t) => {
    if (filter === "in")  return t.amount > 0;
    if (filter === "out") return t.amount < 0;
    return true;
  });

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] font-sans pb-32 transition-colors duration-500 text-left overflow-x-hidden">

      {/* HEADER — TARJETA DE SALDO */}
      <header className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] px-6 pt-14 pb-10 rounded-b-[4rem] border-b border-[var(--border-light)] dark:border-[var(--border-dark)] relative overflow-hidden shadow-soft">
        <div className="max-w-md mx-auto relative z-10">
          {/* Navegación */}
          <div className="flex justify-between items-center mb-10">
            <button
              onClick={() => navigate(-1)}
              className="w-12 h-12 rounded-2xl bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] flex items-center justify-center border border-[var(--border-light)] dark:border-[var(--border-dark)] active:scale-90 transition-all shadow-soft"
            >
              <svg className="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <h1 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400 italic">
              Billetera Pro
            </h1>
            <div className="w-12" />
          </div>

          {/* Saldo principal */}
          <div className="text-center mb-8">
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-zinc-400 mb-3 italic">
              Saldo disponible
            </p>
            <div className="relative inline-flex items-baseline gap-3 justify-center">
              <span className="text-8xl font-black tracking-tighter italic dark:text-white leading-none">
                {liveCredits}
              </span>
              <span className="text-4xl mb-2 animate-pulse">💎</span>
            </div>
          </div>

          {/* Mini stats */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="p-4 bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] rounded-2xl text-center border border-[var(--border-light)] dark:border-[var(--border-dark)]">
              <p className="text-[7px] font-black uppercase tracking-widest text-zinc-400 mb-1 italic">Gastados</p>
              <p className="text-base font-black italic dark:text-white leading-none">{totalSpent} 💎</p>
            </div>
            <div className="p-4 bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] rounded-2xl text-center border border-[var(--border-light)] dark:border-[var(--border-dark)]">
              <p className="text-[7px] font-black uppercase tracking-widest text-zinc-400 mb-1 italic">Recibidos</p>
              <p className="text-base font-black italic dark:text-white leading-none">{totalEarned} 💎</p>
            </div>
          </div>

          {/* CTA recargar */}
          <Link
            to="/comprar-creditos"
            className="flex items-center justify-center gap-3 w-full py-6 bg-black dark:bg-white text-white dark:text-black rounded-[2rem] text-[10px] font-black uppercase tracking-[0.3em] shadow-2xl active:scale-95 transition-all"
          >
            <span className="text-lg">💎</span>
            Recargar Billetera
          </Link>
        </div>
      </header>

      {/* MOVIMIENTOS */}
      <main className="max-w-md mx-auto px-6 pt-10">
        <div className="flex items-center justify-between mb-6 px-1">
          <h2 className="text-[9px] font-black uppercase tracking-[0.4em] text-zinc-400 italic">
            Movimientos
          </h2>
          <span className="text-[8px] font-black uppercase tracking-widest text-zinc-300 dark:text-zinc-700">
            {filtered.length} registros
          </span>
        </div>

        {/* Filtros */}
        <div className="flex gap-3 mb-8 overflow-x-auto no-scrollbar">
          {[
            { id: "all", label: "Todos"    },
            { id: "in",  label: "Entradas" },
            { id: "out", label: "Salidas"  },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-5 py-2.5 rounded-[1.5rem] text-[9px] font-black uppercase tracking-widest transition-all shrink-0 border italic
                ${filter === f.id
                  ? "bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-lg"
                  : "border-[var(--border-light)] dark:border-[var(--border-dark)] text-zinc-400"}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-32 opacity-20">
            <div className="w-8 h-8 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-[9px] font-black uppercase tracking-widest italic">Cargando...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] p-16 rounded-[3rem] text-center border border-[var(--border-light)] dark:border-[var(--border-dark)] animate-reveal">
            <p className="text-6xl mb-6 opacity-10">💎</p>
            <p className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.3em] italic">
              {filter === "all" ? "Sin transacciones aún" : "Sin movimientos en este filtro"}
            </p>
          </div>
        ) : (
          <div className="space-y-4 animate-reveal">
            {filtered.map((t) => (
              <TxCard key={t.id} tx={t} onClick={() => setSelectedTx(t)} />
            ))}
          </div>
        )}
      </main>

      {/* MODAL COMPROBANTE */}
      {selectedTx && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-fade-in"
          onClick={() => setSelectedTx(null)}
        >
          <div
            className="bg-white dark:bg-black w-full max-w-sm rounded-[3.5rem] p-10 shadow-2xl border dark:border-zinc-800 animate-bounce-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.3em] mb-1 italic">
                  Ref. Transacción
                </p>
                <p className="text-[9px] font-black dark:text-white uppercase tracking-widest italic opacity-40">
                  #{selectedTx.id.slice(0, 12).toUpperCase()}
                </p>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-500 font-black text-sm active:scale-90 transition-all"
              >
                ×
              </button>
            </div>

            {/* Monto */}
            <div className="text-center py-10 border-y border-dashed border-zinc-200 dark:border-zinc-800 mb-8">
              <div className={`text-6xl font-black italic tracking-tighter mb-2 ${
                selectedTx.amount > 0 ? "text-emerald-500" : "text-black dark:text-white"
              }`}>
                {selectedTx.amount > 0 ? `+${selectedTx.amount}` : selectedTx.amount}
              </div>
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-zinc-400 italic">Diamantes</p>
            </div>

            {/* Detalles */}
            <div className="space-y-4 mb-10">
              <DetailRow label="Operación"  value={selectedTx.description || "—"} />
              <DetailRow label="Fecha"      value={formatFullDate(selectedTx.createdAt)} />
              <DetailRow label="Hora"       value={formatTime(selectedTx.createdAt)} />
              <DetailRow label="Categoría"  value={TX_LABELS[selectedTx.type] || selectedTx.type || "—"} />
              {selectedTx.pricePaid != null && (
                <DetailRow
                  label="Pago realizado"
                  value={`$${Number(selectedTx.pricePaid).toLocaleString("es-CL")} CLP`}
                  highlight
                />
              )}
              {selectedTx.requestId && (
                <DetailRow label="ID Servicio" value={selectedTx.requestId.slice(0, 10) + "…"} />
              )}
            </div>

            <button
              onClick={() => setSelectedTx(null)}
              className="btn-primary w-full py-6 !rounded-[2rem]"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes reveal { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .animate-reveal { animation: reveal 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
        .animate-fade-in { animation: fadeIn 0.35s ease-out; }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        .animate-bounce-in { animation: bounceIn 0.4s cubic-bezier(0.16,1,0.3,1); }
        @keyframes bounceIn { from { transform:scale(0.93); opacity:0; } to { transform:scale(1); opacity:1; } }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTES
───────────────────────────────────────────── */
function TxCard({ tx, onClick }) {
  const isPositive = tx.amount > 0;
  return (
    <button
      onClick={onClick}
      className="w-full bg-[var(--card-light)] dark:bg-[var(--card-dark)] p-6 rounded-[2.5rem] flex items-center justify-between border border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft hover:border-black dark:hover:border-white transition-all active:scale-[0.98] group"
    >
      <div className="flex items-center gap-4">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl italic shadow-inner shrink-0 ${
          isPositive
            ? "bg-emerald-50 dark:bg-emerald-950/20"
            : "bg-zinc-100 dark:bg-zinc-900"
        }`}>
          {TX_ICONS[tx.type] || "💎"}
        </div>
        <div className="text-left min-w-0">
          <p className="text-xs font-black uppercase tracking-tight dark:text-white mb-1 italic truncate w-36">
            {tx.description || "Transacción"}
          </p>
          <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest leading-none">
            {formatFullDate(tx.createdAt)}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-lg font-black italic tracking-tighter ${
          isPositive ? "text-emerald-500" : "text-black dark:text-white"
        }`}>
          {isPositive ? `+${tx.amount}` : tx.amount}
        </p>
        <p className="text-[7px] font-black uppercase opacity-30 tracking-widest mt-0.5">💎</p>
      </div>
    </button>
  );
}

function DetailRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-[8px] font-black uppercase text-zinc-400 tracking-[0.3em] shrink-0">{label}</span>
      <span className={`text-[10px] font-black uppercase italic tracking-tight text-right break-all ${
        highlight ? "text-blue-600 dark:text-blue-400" : "text-black dark:text-zinc-200"
      }`}>
        {value}
      </span>
    </div>
  );
}