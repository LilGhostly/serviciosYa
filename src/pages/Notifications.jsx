import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { db } from "../firebase";
import {
  collection, query, where, orderBy,
  onSnapshot, doc, updateDoc, writeBatch, limit,
} from "firebase/firestore";

/* ─────────────────────────────────────────────
   CONFIGURACIÓN
───────────────────────────────────────────── */
const NOTIFICATION_ICONS = {
  strike:           { icon: "⚠️",  color: "text-red-500"    },
  security:         { icon: "🛡️",  color: "text-blue-600"   },
  finance:          { icon: "💎",  color: "text-purple-500" },
  new_proposal:     { icon: "📋",  color: "text-black dark:text-white" },
  proposal_accepted:{ icon: "✅",  color: "text-emerald-500"},
  proposal_rejected:{ icon: "↩️",  color: "text-zinc-500"   },
  job_approved:     { icon: "🏁",  color: "text-emerald-500"},
  service_canceled: { icon: "🚫",  color: "text-red-400"    },
  action_required:  { icon: "🔔",  color: "text-amber-500"  },
  new_review:       { icon: "⭐",  color: "text-amber-500"  },
  support:          { icon: "💬",  color: "text-zinc-500"   },
  system:           { icon: "📢",  color: "text-zinc-500"   },
};

const getNotifConfig = (type) =>
  NOTIFICATION_ICONS[type] || { icon: "✉️", color: "text-zinc-500" };

const formatNotifDate = (ts) => {
  if (!ts) return "";
  const d    = ts.toDate ? ts.toDate() : new Date(ts);
  const now  = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)    return "Ahora";
  if (diff < 3600)  return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
};

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function Notifications() {
  const { user }  = useUser();
  const navigate  = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [filter,        setFilter]        = useState("all"); // all | unread | important

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      /* Filtrar por userId en cliente también como defensa en profundidad */
      setNotifications(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((n) => n.userId === user.uid)
      );
      setLoading(false);
    }, (err) => {
      console.error("Error buzón:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  /* Marcar una como leída */
  const markAsRead = useCallback(async (id) => {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch (err) {
      console.error(err);
    }
  }, []);

  /* Marcar todas como leídas */
  const markAllAsRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read);
    if (!unread.length) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => batch.update(doc(db, "notifications", n.id), { read: true }));
      await batch.commit();
    } catch (err) {
      console.error(err);
    }
  }, [notifications]);

  /* Filtrado */
  const filtered = notifications.filter((n) => {
    if (filter === "unread")    return !n.read;
    if (filter === "important") return ["strike", "security", "action_required", "job_approved"].includes(n.type);
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (!user) return null;

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] font-sans pb-32 transition-colors duration-500 overflow-x-hidden text-left">

      {/* HEADER */}
      <header className="px-6 pt-10 pb-6 animate-reveal">
        <div className="max-w-md mx-auto">
          <div className="flex justify-between items-start mb-8">
            <button
              onClick={() => navigate(-1)}
              className="w-12 h-12 rounded-2xl bg-[var(--card-light)] dark:bg-[var(--card-dark)] flex items-center justify-center border border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft active:scale-90 transition-all"
            >
              <svg className="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[8px] font-black uppercase tracking-widest text-zinc-400 hover:text-black dark:hover:text-white transition-colors border-b border-transparent hover:border-current pb-0.5"
              >
                Marcar todo como leído
              </button>
            )}
          </div>

          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-4xl font-black uppercase tracking-tighter italic dark:text-white leading-none">
                Buzón
              </h1>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mt-2 italic">
                {unreadCount > 0
                  ? `${unreadCount} sin leer`
                  : "Todo al día"}
              </p>
            </div>
            {unreadCount > 0 && (
              <div className="w-10 h-10 bg-black dark:bg-white text-white dark:text-black rounded-2xl flex items-center justify-center font-black text-sm shadow-lg">
                {unreadCount > 9 ? "9+" : unreadCount}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* FILTROS */}
      <div className="px-6 mb-6">
        <div className="max-w-md mx-auto flex gap-3 overflow-x-auto no-scrollbar">
          {[
            { id: "all",       label: "Todas"      },
            { id: "unread",    label: "Sin leer"   },
            { id: "important", label: "Importantes"},
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 px-5 py-2.5 rounded-[1.5rem] text-[9px] font-black uppercase tracking-widest transition-all border italic
                ${filter === f.id
                  ? "bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-lg"
                  : "bg-transparent border-[var(--border-light)] dark:border-[var(--border-dark)] text-zinc-400"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* LISTA */}
      <main className="px-6 max-w-md mx-auto">
        {loading ? (
          <div className="py-24 flex flex-col items-center opacity-20">
            <div className="w-6 h-6 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-[9px] font-black uppercase tracking-widest italic">Cargando...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-32 text-center animate-reveal">
            <p className="text-5xl mb-6 opacity-10 italic">📭</p>
            <p className="text-[10px] font-black uppercase tracking-[0.5em] opacity-30 italic">
              {filter === "all" ? "Buzón vacío" : "Sin notificaciones en este filtro"}
            </p>
          </div>
        ) : (
          <div className="space-y-3 animate-reveal">
            {filtered.map((n, i) => (
              <NotifCard
                key={n.id}
                notif={n}
                index={i}
                onRead={() => !n.read && markAsRead(n.id)}
              />
            ))}
          </div>
        )}
      </main>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes reveal { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .animate-reveal { animation: reveal 0.7s cubic-bezier(0.16,1,0.3,1) forwards; }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TARJETA DE NOTIFICACIÓN
───────────────────────────────────────────── */
function NotifCard({ notif, index, onRead }) {
  const cfg = getNotifConfig(notif.type);

  return (
    <div
      onClick={onRead}
      className={`
        p-5 rounded-[2rem] border transition-all active:scale-[0.98] cursor-pointer
        animate-reveal
        ${notif.read
          ? "bg-transparent border-zinc-100 dark:border-zinc-800/50 opacity-40"
          : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 shadow-soft hover:border-black dark:hover:border-white"
        }
      `}
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
    >
      <div className="flex gap-4 items-start">
        {/* Icono */}
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0 ${
          notif.read
            ? "bg-zinc-100 dark:bg-zinc-800"
            : "bg-zinc-50 dark:bg-zinc-800 shadow-sm"
        }`}>
          <span>{cfg.icon}</span>
        </div>

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2 mb-1.5">
            <p className={`text-[9px] font-black uppercase tracking-widest leading-none ${
              notif.read ? "text-zinc-400" : cfg.color
            }`}>
              {notif.title}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[7px] font-bold text-zinc-300 dark:text-zinc-700 uppercase tracking-widest">
                {formatNotifDate(notif.createdAt)}
              </span>
              {!notif.read && (
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse shrink-0" />
              )}
            </div>
          </div>

          <p className={`text-xs font-bold leading-relaxed ${
            notif.read ? "opacity-60" : "dark:text-zinc-200"
          }`}>
            {notif.message}
          </p>

          {/* CTA si hay requestId */}
          {notif.requestId && !notif.read && (
            <Link
              to={`/chat/${notif.requestId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 mt-3 text-[8px] font-black uppercase tracking-widest text-black dark:text-white underline underline-offset-4 hover:opacity-70 transition-opacity"
            >
              Ver servicio →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}