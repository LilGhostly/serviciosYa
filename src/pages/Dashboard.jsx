/**
 * Dashboard.jsx — Rediseño visual
 * Mismo sistema de diseño que el resto de la app. Lógica de hooks,
 * seguridad y arquitectura de datos sin cambios respecto a la versión anterior.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { db } from "../firebase";
import { STRIKE_LIMIT } from "../lib/business";
import {
  collection, query, where, orderBy,
  limit, onSnapshot, doc,
} from "firebase/firestore";
import {
  Briefcase, Zap, CheckCircle2, Gem, Star, Search, CreditCard, Plus,
  Calendar, History, FolderOpen, Bell, User, BarChart3, Flame, Wrench,
  AlertTriangle, ShieldCheck, Mail, TrendingDown, Hourglass, Ban,
  ClipboardList, ChevronRight, Sparkles,
} from "lucide-react";

/* ─────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────── */
const STATUS_CFG = {
  pendiente:              { label: "Buscando",  tone: "neutral" },
  asignado:               { label: "Propuesta", tone: "brand"   },
  en_progreso:            { label: "En curso",  tone: "info"    },
  esperando_confirmacion: { label: "Revisar",   tone: "brass"   },
  completado:             { label: "Listo",     tone: "brand"   },
  cancelado_cliente:      { label: "Anulado",   tone: "danger"  },
  cancelado_profesional:  { label: "Cancelado", tone: "danger"  },
};

const TONE_STYLES = {
  neutral: { bg: "bg-black/5 dark:bg-white/10",   text: "text-[var(--muted)]",     dot: "bg-[var(--muted)]"     },
  brand:   { bg: "bg-[var(--brand-soft)]",        text: "text-[var(--brand)]",     dot: "bg-[var(--brand)]"     },
  info:    { bg: "bg-[var(--info-soft)]",         text: "text-[var(--info)]",      dot: "bg-[var(--info)]"      },
  brass:   { bg: "bg-[var(--brass-soft)]",        text: "text-[var(--brass)]",     dot: "bg-[var(--brass)]"     },
  danger:  { bg: "bg-red-50 dark:bg-red-950/30",  text: "text-[var(--danger)]",    dot: "bg-[var(--danger)]"    },
};

const ACTIVE_STATUSES = ["pendiente", "asignado", "en_progreso", "esperando_confirmacion"];
const ALL_STATUSES    = [...ACTIVE_STATUSES, "completado"];

const GREETING = () => {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
};

/* ─────────────────────────────────────────────
   HOOKS
───────────────────────────────────────────── */

/** Perfil en tiempo real con fallback seguro */
function useProfile(uid) {
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid), (snap) => {
      if (snap.exists()) setProfile(snap.data());
    }, (err) => console.error("[useProfile]", err));
  }, [uid]);
  return profile;
}

/** Items del dashboard con lógica de resumen */
function useDashboardItems(uid, isPro) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ total: 0, pending: 0, active: 0, completed: 0, urgents: 0 });

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const field = isPro ? "acceptedById" : "clientId";
    const q = query(
      collection(db, "requests"),
      where(field, "==", uid),
      where("status", "in", ALL_STATUSES),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const s = { total: 0, pending: 0, active: 0, completed: 0, urgents: 0 };
      list.forEach((i) => {
        s.total++;
        if (i.status === "pendiente") s.pending++;
        if (ACTIVE_STATUSES.includes(i.status)) s.active++;
        if (i.status === "completado") s.completed++;
        if (i.urgency === "urgente" && i.status !== "completado") s.urgents++;
      });
      setSummary(s);
      setItems(list);
      setLoading(false);
    }, (err) => { console.error("[useDashboardItems]", err); setLoading(false); });
  }, [uid, isPro]);

  return { items, loading, summary };
}

/** Pago pendiente (solo clientes) */
function usePaymentPending(uid, isPro) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (isPro || !uid) return;
    const q = query(
      collection(db, "requests"),
      where("clientId", "==", uid),
      where("status", "==", "esperando_pago"),
      limit(1)
    );
    return onSnapshot(q, (snap) => setPending(!snap.empty),
      (err) => console.error("[usePaymentPending]", err));
  }, [uid, isPro]);
  return pending;
}

/** Count-up animado */
function useCountUp(target, duration = 800) {
  const [val, setVal] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    const start = performance.now();
    const tick = (now) => {
      const p    = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(ease * target));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val;
}

/* ─────────────────────────────────────────────
   UTILS
───────────────────────────────────────────── */
function formatTimeAgo(ts) {
  if (!ts?.seconds) return "";
  const diff = Math.floor((Date.now() - ts.seconds * 1000) / 1000);
  if (diff < 60)    return "Ahora";
  if (diff < 3600)  return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  return new Date(ts.seconds * 1000).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

function safeCredits(c) {
  if (!c) return 0;
  return typeof c === "object" ? (c.balance ?? 0) : c;
}

/* ─────────────────────────────────────────────
   PANTALLAS DE ESTADO BLOQUEADO
───────────────────────────────────────────── */
function BlockWall({ cfg, onLogout }) {
  const Icon = cfg.icon;
  return (
    <div className="min-h-screen bg-[var(--paper)] dark:bg-[var(--paper-dark)] flex items-center justify-center p-8 text-center font-body text-[var(--ink)] dark:text-[var(--ink-dark)]">
      <div className="max-w-xs w-full animate-enter">
        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-7 ${cfg.iconBg}`}>
          <Icon className={`w-7 h-7 ${cfg.iconColor}`} strokeWidth={1.75} />
        </div>
        <h1 className="font-display text-2xl font-bold leading-tight mb-3">{cfg.title}</h1>
        <p className="text-sm text-[var(--muted)] mb-9 leading-relaxed">{cfg.desc}</p>
        <div className="space-y-2.5">
          {cfg.showContact && (
            <a href="mailto:soporte@serviciosya.cl"
              className="flex items-center justify-center gap-2 w-full py-3.5 bg-white dark:bg-[var(--card-dark)] border border-black/10 dark:border-white/10 rounded-2xl text-sm font-medium">
              <Mail className="w-4 h-4" /> Contactar soporte
            </a>
          )}
          <button onClick={onLogout}
            className="w-full py-3.5 bg-[var(--ink)] dark:bg-[var(--ink-dark)] text-[var(--paper)] dark:text-[var(--ink)] rounded-2xl text-sm font-semibold active:scale-[0.98] transition-transform">
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SKELETON
───────────────────────────────────────────── */
function Skeleton({ className }) {
  return <div className={`bg-black/5 dark:bg-white/10 rounded-2xl animate-pulse ${className}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="max-w-md mx-auto px-5 pt-8 pb-32 space-y-7">
      <div className="flex items-start justify-between mb-2">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="w-12 h-12 rounded-2xl" />
      </div>
      <Skeleton className="h-20 w-full rounded-3xl" />
      <div className="grid grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-3xl" />)}
      </div>
      <Skeleton className="h-28 w-full rounded-3xl" />
      <div className="space-y-2.5">
        {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function Dashboard() {
  const { user, logout } = useUser();
  const navigate         = useNavigate();
  const [mounted, setMounted] = useState(false);

  /* ── Guard de seguridad: sin usuario, fuera ── */
  useEffect(() => {
    if (user === null) navigate("/login", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  /* Bloquear renderizado si no hay usuario verificado */
  if (!user?.uid) return null;

  const role  = user.role || "cliente";
  const isPro = role === "profesional";

  /* ── Hooks de datos ── */
  const liveProfile     = useProfile(user.uid);
  const { items, loading, summary } = useDashboardItems(user.uid, isPro);
  const hasPaymentPending = usePaymentPending(user.uid, isPro);

  /* ── Datos derivados ── */
  const penaltyUntil  = liveProfile?.penaltyUntil?.toDate?.() || null;
  const isPenalty     = penaltyUntil && Date.now() < penaltyUntil.getTime();
  const isBlocked     = liveProfile?.isBlocked || false;
  const strikes       = liveProfile?.reputationPoints || 0;
  const totalReviews  = liveProfile?.ratingStats?.totalReviews || 0;
  const totalStars    = liveProfile?.ratingStats?.totalStars   || 0;
  const avgStars      = totalReviews >= 3 ? totalStars / totalReviews : null;
  const isLowQuality  = avgStars !== null && avgStars < 3.0;
  const isWarning     = avgStars !== null && avgStars >= 3.0 && avgStars < 3.5;
  const credits       = safeCredits(liveProfile?.credits);
  const isVerified    = liveProfile?.isIdentityVerified || false;

  const displayName = liveProfile?.profile?.name || liveProfile?.name || user.name || "Usuario";
  const firstName   = displayName.split(" ")[0];
  const photoUrl    = liveProfile?.profile?.photoUrl || "";

  /* ── Item activo ── */
  const activeItem  = items.find((i) => ACTIVE_STATUSES.includes(i.status));
  const recentItems = items.slice(0, 5);

  /* ── Logout seguro ── */
  const handleLogout = useCallback(async () => {
    try { await logout?.(); } catch {}
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  /* ── Block wall ── */
  const blockCfg = isLowQuality
    ? { icon: TrendingDown, iconBg: "bg-[var(--brass-soft)]", iconColor: "text-[var(--brass)]", title: "Calidad insuficiente",
        desc: `Tu calificación (${avgStars?.toFixed(1)} ★) está por debajo del mínimo requerido (3.0 ★).`,
        showContact: false }
    : isPenalty
    ? { icon: Hourglass, iconBg: "bg-[var(--brass-soft)]", iconColor: "text-[var(--brass)]", title: "Acceso suspendido",
        desc: `Tu cuenta está suspendida hasta el ${penaltyUntil?.toLocaleString("es-CL")}.`,
        showContact: true }
    : { icon: Ban, iconBg: "bg-red-50 dark:bg-red-950/30", iconColor: "text-[var(--danger)]", title: "Cuenta inhabilitada",
        desc: "Tu cuenta fue inhabilitada por múltiples reportes. Contacta al soporte.",
        showContact: true };

  if (isBlocked || isPenalty || isLowQuality) {
    return <BlockWall cfg={blockCfg} onLogout={handleLogout} />;
  }

  /* ── Banners ── */
  const banners = [
    hasPaymentPending && {
      key: "payment", tone: "brass",
      content: <>Pago Flash pendiente — <Link to="/mis-solicitudes" className="underline font-semibold">Finalizar</Link></>,
    },
    strikes >= 1 && strikes < STRIKE_LIMIT && {
      key: "strikes", tone: strikes >= 2 ? "danger" : "brass",
      content: `${strikes} strike${strikes > 1 ? "s" : ""} acumulado${strikes > 1 ? "s" : ""}. Al llegar a ${STRIKE_LIMIT} tu cuenta será suspendida.`,
    },
    isWarning && {
      key: "warning", tone: "brass",
      content: `Calificación ${avgStars?.toFixed(1)} ★ — cerca del límite mínimo (3.0 ★).`,
    },
    isPro && summary.urgents > 0 && {
      key: "urgents", tone: "ink",
      content: (
        <Link to="/servicios-disponibles" className="flex items-center justify-center gap-1.5">
          <Flame className="w-3.5 h-3.5" /> {summary.urgents} pedido{summary.urgents > 1 ? "s urgentes" : " urgente"} en tu zona — Ver ahora
        </Link>
      ),
    },
  ].filter(Boolean);

  const bannerTone = {
    brass:  "bg-[var(--brass)] text-white",
    danger: "bg-[var(--danger)] text-white",
    ink:    "bg-[var(--ink)] dark:bg-[var(--ink-dark)] text-[var(--paper)] dark:text-[var(--ink)]",
  };

  /* ── Quick links según rol ── */
  const quickLinks = isPro ? [
    { to: "/prof/trabajos",         icon: Calendar,   title: "Mi agenda",     desc: "Trabajos activos"    },
    { to: "/prof/billetera",        icon: Gem,        title: "Billetera",     desc: `${credits} créditos` },
    { to: "/analisis-rendimiento",  icon: BarChart3,  title: "Métricas pro",  desc: "Estadísticas"        },
    { to: "/historial-profesional", icon: History,    title: "Historial",     desc: "Todos mis trabajos"  },
  ] : [
    { to: "/mis-solicitudes", icon: FolderOpen, title: "Mis pedidos",    desc: "Historial completo" },
    { to: "/solicitar",       icon: Plus,        title: "Nuevo pedido",   desc: "Solicitar servicio" },
    { to: "/notificaciones",  icon: Bell,        title: "Notificaciones", desc: "Buzón de mensajes"  },
    { to: "/cliente/perfil",  icon: User,        title: "Mi perfil",      desc: "Datos y config."    },
  ];

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--paper)] dark:bg-[var(--paper-dark)] font-body text-[var(--ink)] dark:text-[var(--ink-dark)] pb-28 transition-colors duration-300">

      {/* BANNERS */}
      {banners.map((b) => (
        <div key={b.key} className={`${bannerTone[b.tone]} px-5 py-2.5 text-center relative z-50`} role="alert">
          <p className="text-xs font-medium leading-relaxed">{b.content}</p>
        </div>
      ))}

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <div className="max-w-md mx-auto px-5 pt-8 pb-10">

          {/* ── HEADER ── */}
          <header className={`mb-7 transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
            <div className="flex items-start justify-between mb-5 gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--muted)] mb-1">{GREETING()}</p>
                <h1 className="font-display text-4xl font-bold leading-none truncate">{firstName}</h1>
                <p className="text-xs text-[var(--muted)] mt-2 capitalize">
                  {isPro ? "Panel profesional" : "Panel cliente"} · {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "short" })}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1 shrink-0">
                {isPro && (
                  <Link to="/comprar-creditos" aria-label={`${credits} créditos — comprar más`}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-white dark:bg-[var(--card-dark)] rounded-2xl border border-black/8 dark:border-white/10 active:scale-95 transition-transform">
                    <Gem className="w-4 h-4 text-[var(--brass)]" />
                    <span className="text-sm font-semibold">{credits}</span>
                  </Link>
                )}
                <Link to={isPro ? "/prof/perfil" : "/cliente/perfil"} aria-label="Ir a mi perfil"
                  className="relative w-12 h-12 rounded-2xl bg-white dark:bg-[var(--card-dark)] border border-black/8 dark:border-white/10 flex items-center justify-center shadow-sm active:scale-95 transition-transform overflow-hidden">
                  {photoUrl
                    ? <img src={photoUrl} className="w-full h-full object-cover" alt={`Avatar de ${firstName}`} />
                    : <span className="font-display font-bold text-base">{firstName.charAt(0).toUpperCase()}</span>
                  }
                  {(summary.urgents > 0 || hasPaymentPending) && (
                    <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-[var(--danger)] rounded-full border-2 border-[var(--paper)] dark:border-[var(--paper-dark)]" aria-hidden="true" />
                  )}
                </Link>
              </div>
            </div>

            <AccountStatusCard isPro={isPro} isVerified={isVerified} strikes={strikes} />
          </header>

          {/* ── STATS ── */}
          <section className={`mb-6 transition-all duration-500 delay-75 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`} aria-label="Resumen de actividad">
            <SectionHeader title="Resumen" live />
            <div className="grid grid-cols-4 gap-2.5 mt-3">
              <StatCard label="Total"   value={summary.total}     icon={Briefcase}    tone="neutral" />
              <StatCard label="Activos" value={summary.active}    icon={Zap}          tone="info"    />
              <StatCard label="Listos"  value={summary.completed} icon={CheckCircle2} tone="brand"   />
              {isPro
                ? <StatCard label="Créditos" value={credits} icon={Gem} tone="brass" />
                : <StatCard label="Rating" value={avgStars !== null ? `${avgStars.toFixed(1)}★` : "—"} icon={Star} tone={isWarning ? "brass" : "brand"} isText />
              }
            </div>
          </section>

          {/* ── CTA PRINCIPAL ── */}
          <section className={`mb-6 transition-all duration-500 delay-100 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
            <MainCTA isPro={isPro} hasPaymentPending={hasPaymentPending} activeItem={activeItem} urgents={summary.urgents} />
          </section>

          {/* ── ACTIVIDAD RECIENTE ── */}
          {recentItems.length > 0 && (
            <section className={`mb-6 transition-all duration-500 delay-150 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
              <SectionHeader title="Actividad reciente" action={{ label: "Ver todo", to: isPro ? "/prof/trabajos" : "/mis-solicitudes" }} />
              <div className="space-y-2 mt-3">
                {recentItems.map((item) => (
                  <ActivityRow key={item.id} item={item} isPro={isPro} userId={user.uid} />
                ))}
              </div>
            </section>
          )}

          {/* ── ESTADO VACÍO ── */}
          {!loading && items.length === 0 && (
            <section className={`mb-6 transition-opacity duration-500 delay-150 ${mounted ? "opacity-100" : "opacity-0"}`}>
              <EmptyState isPro={isPro} />
            </section>
          )}

          {/* ── ACCESOS RÁPIDOS ── */}
          <section className={`mb-6 transition-all duration-500 delay-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
            <SectionHeader title="Accesos rápidos" />
            <div className="grid grid-cols-2 gap-2.5 mt-3">
              {quickLinks.map((item, i) => <QuickTile key={i} {...item} />)}
            </div>
          </section>

          {/* ── REPUTACIÓN PRO ── */}
          {isPro && (
            <section className={`mb-6 transition-all duration-500 delay-[250ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
              <SectionHeader title="Tu reputación" />
              <ReputationCard avgStars={avgStars} totalReviews={totalReviews} strikes={strikes} />
            </section>
          )}

          {/* ── RATING CLIENTE ── */}
          {!isPro && totalReviews >= 3 && avgStars !== null && (
            <section className={`mb-6 transition-all duration-500 delay-[250ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
              <SectionHeader title="Cómo te ven los profesionales" />
              <ClientRatingCard avgStars={avgStars} totalReviews={totalReviews} strikes={strikes} />
            </section>
          )}

          {/* ── CERRAR SESIÓN ── */}
          <div className={`transition-opacity duration-500 delay-[300ms] ${mounted ? "opacity-100" : "opacity-0"}`}>
            <button
              onClick={handleLogout}
              className="w-full py-3.5 rounded-2xl border border-black/8 dark:border-white/10 text-[var(--muted)] text-sm font-medium hover:border-red-200 dark:hover:border-red-900/40 hover:text-[var(--danger)] transition-colors active:scale-[0.98]"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTES
───────────────────────────────────────────── */

function SectionHeader({ title, live, action }) {
  return (
    <div className="flex items-center justify-between px-0.5">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</h2>
        {live && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse" aria-hidden="true" />
            <span className="text-xs text-[var(--muted)]">en vivo</span>
          </span>
        )}
      </div>
      {action && (
        <Link to={action.to} className="flex items-center gap-0.5 text-xs font-medium text-[var(--muted)]">
          {action.label} <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}

function AccountStatusCard({ isPro, isVerified, strikes }) {
  const ok = isPro ? isVerified : strikes === 0;
  const needsVerification = isPro && !isVerified;
  return (
    <div className={`p-5 rounded-3xl border ${
      needsVerification ? "bg-[var(--brand)] border-transparent" : "bg-white dark:bg-[var(--card-dark)] border-black/5 dark:border-white/10"
    }`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-xs mb-1.5 ${needsVerification ? "text-white/70" : "text-[var(--muted)]"}`}>
            {isPro ? "Estado de cuenta Pro" : "Estado de cuenta"}
          </p>
          <p className={`text-sm font-semibold truncate ${needsVerification ? "text-white" : ""}`}>
            {isPro
              ? isVerified ? "Identidad verificada" : "Identidad sin verificar"
              : strikes === 0 ? "Conducta impecable" : `${strikes} reporte${strikes > 1 ? "s" : ""} de conducta`}
          </p>
        </div>
        {needsVerification ? (
          <Link to="/prof/perfil"
            className="px-4 py-2.5 bg-white text-[var(--brand)] rounded-xl text-xs font-semibold active:scale-95 transition-transform shrink-0">
            Verificar
          </Link>
        ) : (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            ok ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "bg-[var(--brass-soft)] text-[var(--brass)]"
          }`}>
            {ok ? <ShieldCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </div>
        )}
      </div>
    </div>
  );
}

const STAT_TONE = {
  neutral: { bg: "bg-white dark:bg-[var(--card-dark)] border-black/5 dark:border-white/10", val: "" },
  info:    { bg: "bg-[var(--info-soft)] border-transparent",  val: "text-[var(--info)]"  },
  brand:   { bg: "bg-[var(--brand-soft)] border-transparent", val: "text-[var(--brand)]" },
  brass:   { bg: "bg-[var(--brass-soft)] border-transparent", val: "text-[var(--brass)]" },
};

function StatCard({ label, value, icon: Icon, tone, isText }) {
  const numVal   = typeof value === "number" ? value : 0;
  const animated = useCountUp(numVal, 900);
  const display  = isText ? value : animated;
  const s = STAT_TONE[tone] || STAT_TONE.neutral;

  return (
    <div className={`flex flex-col items-center justify-center py-4 px-2 rounded-3xl border ${s.bg}`}>
      <Icon className={`w-4 h-4 mb-2 ${s.val || "text-[var(--muted)]"}`} strokeWidth={1.75} />
      <span className={`font-display text-lg font-bold leading-none mb-1 ${s.val}`}>{display}</span>
      <span className="text-[10px] text-[var(--muted)] text-center leading-tight">{label}</span>
    </div>
  );
}

function MainCTA({ isPro, hasPaymentPending, activeItem, urgents }) {
  const cfg = (() => {
    if (isPro) return {
      to: "/servicios-disponibles", label: "Buscar trabajo",
      sublabel: urgents > 0 ? `${urgents} urgente${urgents > 1 ? "s" : ""} disponible${urgents > 1 ? "s" : ""}` : "Solicitudes en tu zona",
      tag: "Bolsa de trabajo", icon: Search,
    };
    if (hasPaymentPending) return {
      to: "/mis-solicitudes", label: "Pago pendiente",
      sublabel: "Completa el pago de tu pedido Flash",
      tag: "Acción requerida", icon: CreditCard,
    };
    if (activeItem) return {
      to: "/mis-solicitudes", label: activeItem.problemType || "Servicio activo",
      sublabel: `Estado: ${STATUS_CFG[activeItem.status]?.label || "—"}`,
      tag: "En curso", icon: Zap,
    };
    return {
      to: "/solicitar", label: "Solicitar servicio",
      sublabel: "Encuentra el profesional que necesitas",
      tag: "Nuevo servicio", icon: Plus,
    };
  })();
  const Icon = cfg.icon;

  return (
    <Link to={cfg.to} aria-label={cfg.label}
      className="group block w-full p-6 rounded-3xl bg-[var(--ink)] dark:bg-[var(--ink-dark)] text-[var(--paper)] dark:text-[var(--ink)] active:scale-[0.98] transition-transform relative overflow-hidden">
      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide opacity-50 mb-2">{cfg.tag}</p>
          <p className="font-display text-xl font-bold leading-tight truncate">{cfg.label}</p>
          <p className="text-xs opacity-60 mt-2">{cfg.sublabel}</p>
        </div>
        <div className="w-11 h-11 rounded-2xl bg-white/10 dark:bg-black/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
          <Icon className="w-5 h-5" strokeWidth={1.75} />
        </div>
      </div>
    </Link>
  );
}

function ActivityRow({ item, isPro, userId }) {
  const cfg  = STATUS_CFG[item.status] || STATUS_CFG.pendiente;
  const tone = TONE_STYLES[cfg.tone];
  const isUrgent    = item.urgency === "urgente";
  const isTerminal  = ["completado", "cancelado_cliente", "cancelado_profesional"].includes(item.status);
  const hasUnread   = item.unreadChat && item.lastMessageSenderId !== userId;
  const dest        = isPro ? `/chat/${item.id}` : "/mis-solicitudes";
  const timeAgo     = formatTimeAgo(item.createdAt);
  const comuna      = item.clientSnapshot?.comuna || item.commune || "";
  const highlight   = isUrgent && !isTerminal;
  const RowIcon     = highlight ? Flame : item.status === "completado" ? CheckCircle2 : Wrench;

  return (
    <Link to={dest} aria-label={`${item.problemType || "Servicio"} — ${cfg.label}`}
      className={`flex items-center gap-3.5 p-4 rounded-2xl border transition-transform active:scale-[0.98] ${
        highlight
          ? "bg-[var(--brand)] border-transparent"
          : "bg-white dark:bg-[var(--card-dark)] border-black/5 dark:border-white/10"
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
        highlight ? "bg-white/15" : "bg-black/[0.03] dark:bg-white/[0.06]"
      }`}>
        <RowIcon className={`w-4.5 h-4.5 ${highlight ? "text-white" : "text-[var(--brand)]"}`} strokeWidth={1.75} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-semibold truncate ${highlight ? "text-white" : ""}`}>
            {item.problemType || "Servicio"}
          </p>
          {hasUnread && <span className="w-2 h-2 rounded-full bg-[var(--danger)] shrink-0" aria-label="Mensaje sin leer" />}
        </div>
        <p className={`text-xs mt-0.5 ${highlight ? "text-white/60" : "text-[var(--muted)]"}`}>
          {timeAgo}{comuna ? ` · ${comuna}` : ""}
        </p>
      </div>

      <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium shrink-0 ${
        highlight ? "bg-white/15 text-white" : `${tone.bg} ${tone.text}`
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${highlight ? "bg-white" : tone.dot}`} />
        {cfg.label}
      </span>
    </Link>
  );
}

function EmptyState({ isPro }) {
  const Icon = isPro ? Briefcase : ClipboardList;
  return (
    <div className="text-center py-12">
      <div className="w-14 h-14 rounded-3xl bg-white dark:bg-[var(--card-dark)] border border-black/5 dark:border-white/10 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-6 h-6 text-[var(--muted)]" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium mb-1">Sin actividad todavía</p>
      <p className="text-xs text-[var(--muted)] mb-6">{isPro ? "Postula a tu primer trabajo." : "Solicita tu primer servicio."}</p>
      <Link to={isPro ? "/servicios-disponibles" : "/solicitar"}
        className="inline-block px-6 py-3 bg-[var(--ink)] dark:bg-[var(--ink-dark)] text-[var(--paper)] dark:text-[var(--ink)] rounded-2xl text-sm font-semibold active:scale-95 transition-transform">
        {isPro ? "Ver trabajos disponibles" : "Solicitar servicio"}
      </Link>
    </div>
  );
}

function QuickTile({ to, icon: Icon, title, desc }) {
  return (
    <Link to={to}
      className="flex flex-col p-4 rounded-2xl bg-white dark:bg-[var(--card-dark)] border border-black/5 dark:border-white/10 active:scale-[0.97] transition-transform"
    >
      <div className="w-9 h-9 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] flex items-center justify-center mb-3 shrink-0">
        <Icon className="w-4.5 h-4.5 text-[var(--brand)]" strokeWidth={1.75} />
      </div>
      <p className="text-sm font-semibold leading-tight mb-0.5">{title}</p>
      <p className="text-xs text-[var(--muted)] leading-tight truncate">{desc}</p>
    </Link>
  );
}

function ReputationCard({ avgStars, totalReviews, strikes }) {
  const pct = avgStars !== null ? Math.max(0, Math.min(100, ((avgStars - 3) / 2) * 100)) : 0;
  const barTone = avgStars === null ? "bg-[var(--muted)]" : avgStars >= 4.5 ? "bg-[var(--brand)]" : avgStars >= 3.5 ? "bg-[var(--info)]" : avgStars >= 3.0 ? "bg-[var(--brass)]" : "bg-[var(--danger)]";

  return (
    <div className="bg-white dark:bg-[var(--card-dark)] rounded-3xl p-5 border border-black/5 dark:border-white/10 mt-3">
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs text-[var(--muted)] mb-1.5">Calificación promedio</p>
          <p className="font-display text-3xl font-bold leading-none">
            {avgStars !== null ? `${avgStars.toFixed(1)} ★` : "—"}
          </p>
          <p className="text-xs text-[var(--muted)] mt-2">
            {totalReviews} evaluación{totalReviews !== 1 ? "es" : ""}
            {totalReviews < 3 ? " · mín. 3 para mostrar" : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--muted)] mb-1.5">Conducta</p>
          <p className={`font-display text-2xl font-bold leading-none ${strikes === 0 ? "text-[var(--brand)]" : strikes >= 2 ? "text-[var(--danger)]" : "text-[var(--brass)]"}`}>
            {strikes === 0 ? "OK" : `${strikes}/${STRIKE_LIMIT}`}
          </p>
          <p className="text-xs text-[var(--muted)] mt-2">{strikes === 0 ? "Sin reportes" : `strike${strikes > 1 ? "s" : ""}`}</p>
        </div>
      </div>

      {avgStars !== null && (
        <div className="mb-5" aria-label={`Calificación ${avgStars.toFixed(1)} de 5 estrellas`}>
          <div className="flex justify-between mb-1.5">
            <span className="text-xs text-[var(--muted)]">3.0 mínimo</span>
            <span className="text-xs text-[var(--muted)]">5.0 máximo</span>
          </div>
          <div className="h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ${barTone}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <Link to="/analisis-rendimiento"
        className="flex items-center justify-between p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] active:scale-[0.98] transition-transform">
        <span className="text-sm font-medium">Ver análisis completo</span>
        <ChevronRight className="w-4 h-4 text-[var(--muted)]" />
      </Link>
    </div>
  );
}

function ClientRatingCard({ avgStars, totalReviews, strikes }) {
  return (
    <div className="bg-white dark:bg-[var(--card-dark)] rounded-3xl p-5 border border-black/5 dark:border-white/10 flex items-center justify-between mt-3">
      <div>
        <p className="text-xs text-[var(--muted)] mb-1.5">Tu rating como cliente</p>
        <p className="font-display text-3xl font-bold leading-none">
          {avgStars !== null ? `${avgStars.toFixed(1)} ★` : "—"}
        </p>
        <p className="text-xs text-[var(--muted)] mt-2">
          {totalReviews} calificación{totalReviews !== 1 ? "es" : ""} recibidas
        </p>
      </div>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
        strikes === 0 ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "bg-[var(--brass-soft)] text-[var(--brass)]"
      }`}>
        {strikes === 0 ? <Sparkles className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
      </div>
    </div>
  );
}