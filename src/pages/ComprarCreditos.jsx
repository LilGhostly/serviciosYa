import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { useUser } from "../context/UserContext";

/* ─────────────────────────────────────────────
   DATOS
   NOTA: la URL de la función se arma a partir del proyecto de Firebase
   configurado en las variables de entorno (VITE_FIREBASE_PROJECT_ID), en
   vez de quedar hardcodeada a un proyecto específico. Así el mismo código
   funciona para cualquier proyecto de Firebase que cada equipo configure
   en su propio .env, sin tener que tocar este archivo.
───────────────────────────────────────────── */
const API_URL = `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net/comprarCreditosMP`;

const PAQUETES = [
  {
    id:          "p1",
    credits:     10,
    price:       5000,
    label:       "Inicial",
    tag:         null,
    desc:        "Para explorar la plataforma y postular a tus primeros trabajos.",
    postulations:"~2–3 trabajos",
    perUnit:     500,
    savings:     0,
    gradient:    "from-zinc-700 to-zinc-900",
    accent:      "zinc",
  },
  {
    id:          "p2",
    credits:     30,
    price:       12000,
    label:       "Profesional",
    tag:         "★ Más elegido",
    desc:        "El favorito de los pros activos. Ahorra $3.000 vs el pack básico.",
    postulations:"~7–8 trabajos",
    perUnit:     400,
    savings:     20,
    gradient:    "from-zinc-900 to-black",
    accent:      "black",
  },
  {
    id:          "p3",
    credits:     60,
    price:       20000,
    label:       "Premium",
    tag:         "💎 Mejor valor",
    desc:        "Máxima capacidad para alta demanda. Ahorra $10.000 vs el pack básico.",
    postulations:"~14–15 trabajos",
    perUnit:     333,
    savings:     33,
    gradient:    "from-blue-700 to-blue-900",
    accent:      "blue",
  },
];

const LOADING_STEPS = [
  { label: "Verificando tu sesión",        icon: "🔐" },
  { label: "Autenticando cuenta",          icon: "✅" },
  { label: "Conectando con Mercado Pago",  icon: "💳" },
  { label: "Redirigiendo al pago",         icon: "🚀" },
];

/* ─────────────────────────────────────────────
   HOOK: CONTADOR ANIMADO
───────────────────────────────────────────── */
function useCountUp(target, duration = 800, trigger = true) {
  const [val, setVal] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    if (!trigger) return;
    if (target === 0) { setVal(0); return; }
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const from  = val;
    const tick  = (now) => {
      const p     = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + eased * (target - from)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, trigger]);
  return val;
}

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function ComprarCreditos() {
  const { user }   = useUser();
  const navigate   = useNavigate();

  const [selected,    setSelected]    = useState("p2");
  const [purchasing,  setPurchasing]  = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error,       setError]       = useState("");
  const [mounted,     setMounted]     = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  if (!user) return null;

  const pack = PAQUETES.find((p) => p.id === selected) || PAQUETES[1];

  const balance = (() => {
    const c = user.credits ?? user.profile?.credits;
    if (!c) return 0;
    return typeof c === "object" ? (c.balance ?? 0) : c;
  })();

  /* ─── COMPRA ─── */
  const handlePurchase = async () => {
    if (purchasing) return;
    setError("");
    setPurchasing(true);
    setLoadingStep(0);

    try {
      const cu = auth.currentUser;
      if (!cu) throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
      setLoadingStep(1);
      const token = await cu.getIdToken(true);
      setLoadingStep(2);

      const res = await fetch(API_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body:    JSON.stringify({
          packId: pack.id,
          price: pack.price,
          credits: pack.credits,
          label: pack.label,
          returnUrl: window.location.origin,
        }),
      });

      let data;
      try { data = await res.json(); } catch { throw new Error("Respuesta inválida del servidor."); }

      if (!res.ok) {
        if (res.status === 401) throw new Error("Sesión inválida. Cierra sesión y vuelve a entrar.");
        if (res.status === 400) throw new Error(data.error || "Datos del paquete incorrectos.");
        if (res.status >= 500)  throw new Error("Error en el servidor. Intenta en unos minutos.");
        throw new Error(data.error || "Error al procesar el pago.");
      }

      if (!data.init_point) throw new Error("No se recibió el enlace de pago.");
      setLoadingStep(3);
      await new Promise((r) => setTimeout(r, 500));
      window.location.href = data.init_point;

    } catch (err) {
      setError(err.message || "Error inesperado. Intenta nuevamente.");
      setPurchasing(false);
      setLoadingStep(0);
    }
  };

  /* ─────────────────────────────────────────────
     OVERLAY DE CARGA — PANTALLA COMPLETA PREMIUM
  ───────────────────────────────────────────── */
  if (purchasing) {
    return (
      <div className="fixed inset-0 z-[600] bg-zinc-950 flex flex-col items-center justify-center p-8">
        {/* Diamante animado */}
        <div className="relative mb-14">
          <div className="absolute inset-0 rounded-[2rem] bg-blue-500/20 animate-ping scale-125" />
          <div className="relative w-28 h-28 rounded-[2rem] bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-5xl shadow-[0_0_80px_rgba(59,130,246,0.4)]">
            💎
          </div>
        </div>

        {/* Steps */}
        <div className="w-full max-w-[260px] space-y-5 mb-10">
          {LOADING_STEPS.map((step, i) => {
            const done    = i < loadingStep;
            const current = i === loadingStep;
            return (
              <div
                key={i}
                className={`flex items-center gap-4 transition-all duration-600 ${done || current ? "opacity-100" : "opacity-20"}`}
              >
                {/* Indicador */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${
                  done    ? "bg-emerald-500"
                  : current? "border-2 border-blue-400 border-t-transparent animate-spin"
                  :          "border border-zinc-700"
                }`}>
                  {done && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <p className={`text-[10px] font-black uppercase tracking-widest italic ${done || current ? "text-white" : "text-zinc-600"}`}>
                    {step.label}
                  </p>
                </div>
                {current && (
                  <span className="ml-auto text-[9px] text-blue-400 font-black uppercase tracking-widest animate-pulse italic">
                    ...
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Línea de progreso */}
        <div className="w-full max-w-[260px] h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-700"
            style={{ width: `${(loadingStep / (LOADING_STEPS.length - 1)) * 100}%` }}
          />
        </div>

        <p className="mt-8 text-[7px] font-bold text-zinc-600 uppercase tracking-widest italic">
          No cierres esta ventana
        </p>
      </div>
    );
  }

  /* ─────────────────────────────────────────────
     RENDER PRINCIPAL
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] font-sans overflow-x-hidden transition-colors duration-500">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-40 bg-[var(--bg-light)]/90 dark:bg-[var(--bg-dark)]/90 backdrop-blur-xl border-b border-[var(--border-light)] dark:border-[var(--border-dark)] px-5 py-3.5">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-[var(--card-light)] dark:bg-[var(--card-dark)] flex items-center justify-center border border-[var(--border-light)] dark:border-[var(--border-dark)] active:scale-90 transition-all"
          >
            <svg className="w-4 h-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>

          <div className="text-center">
            <p className="text-[7px] font-black uppercase tracking-[0.4em] text-zinc-400 italic leading-none mb-0.5">Recargar</p>
            <p className="text-sm font-black uppercase tracking-tight italic dark:text-white leading-none">Diamantes Pro</p>
          </div>

          <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-zinc-900 dark:bg-zinc-800 border border-zinc-700 shadow-inner">
            <span className="text-sm leading-none">💎</span>
            <span className="text-sm font-black text-white leading-none">{balance}</span>
          </div>
        </div>
      </nav>

      <div className="max-w-md mx-auto px-5 pb-32">

        {/* ── HERO — TARJETA DE SALDO ── */}
        <section className={`mt-6 mb-8 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
          <div className="relative overflow-hidden rounded-[2.5rem] bg-zinc-950 border border-zinc-800 p-7">
            {/* Glows */}
            <div className="absolute -top-20 -right-20 w-56 h-56 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-600/10 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 flex items-end justify-between mb-7">
              <div>
                <p className="text-[7px] font-black uppercase tracking-[0.4em] text-zinc-500 mb-3 italic">
                  Tu saldo actual
                </p>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[3.5rem] font-black tracking-tighter text-white italic leading-none">
                    {balance}
                  </span>
                  <span className="text-2xl mb-0.5">💎</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[7px] font-black uppercase tracking-widest text-zinc-600 mb-1 italic">1 crédito</p>
                <p className="text-[8px] font-black text-zinc-500 italic">= 1 postulación</p>
              </div>
            </div>

            {/* Proyección con pack seleccionado */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-[7px] font-black uppercase tracking-widest text-zinc-600 italic">Saldo actual</span>
                <span className="text-[7px] font-black uppercase tracking-widest text-zinc-500 italic">
                  Tras recargar: {balance + pack.credits} 💎
                </span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full flex rounded-full overflow-hidden">
                  {/* Saldo actual */}
                  <div
                    className="h-full bg-zinc-600 transition-all duration-700 shrink-0"
                    style={{ width: `${balance > 0 ? Math.max(8, (balance / (balance + pack.credits)) * 100) : 0}%` }}
                  />
                  {/* Nuevos créditos */}
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-700"
                    style={{ width: `${(pack.credits / (balance + pack.credits)) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-zinc-600" />
                  <span className="text-[7px] font-bold text-zinc-600 italic uppercase tracking-widest">Actual ({balance})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[7px] font-bold text-zinc-600 italic uppercase tracking-widest">Nuevo (+{pack.credits})</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── ENCABEZADO ── */}
        <div className={`mb-5 transition-all duration-700 delay-75 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
          <h2 className="text-[2rem] font-black uppercase tracking-tighter italic leading-none dark:text-white mb-1.5">
            Elige tu impulso
          </h2>
          <p className="text-[8px] font-black uppercase tracking-widest text-zinc-400 italic">
            Sin suscripción · Sin vencimiento · Pago único
          </p>
        </div>

        {/* ── PAQUETES ── */}
        <section className={`mb-8 space-y-3 transition-all duration-700 delay-100 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
          {PAQUETES.map((p, i) => (
            <PackRow
              key={p.id}
              pack={p}
              isSelected={selected === p.id}
              onSelect={() => { setSelected(p.id); setError(""); }}
              balance={balance}
              index={i}
            />
          ))}
        </section>

        {/* ── RESUMEN DEL PEDIDO ── */}
        <section className={`mb-6 transition-all duration-700 delay-150 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
          <OrderSummary pack={pack} balance={balance} />
        </section>

        {/* ── ERROR ── */}
        {error && (
          <div className="mb-5 p-5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-[2rem] animate-shake">
            <p className="text-[9px] font-black uppercase text-red-600 dark:text-red-400 tracking-widest text-center leading-relaxed">
              ⚠️ {error}
            </p>
            <button onClick={() => setError("")} className="block mt-3 mx-auto text-[8px] font-black uppercase tracking-widest text-red-400 underline italic">
              Cerrar
            </button>
          </div>
        )}

        {/* ── BOTÓN DE COMPRA ── */}
        <section className={`mb-6 transition-all duration-700 delay-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
          <button
            onClick={handlePurchase}
            disabled={purchasing}
            className="group relative w-full overflow-hidden rounded-[2.5rem] bg-black dark:bg-white text-white dark:text-black shadow-2xl active:scale-[0.97] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {/* Shimmer hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/12 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700 skew-x-12 pointer-events-none" />

            {/* Gradiente de fondo sutil */}
            <div className={`absolute inset-0 opacity-30 pointer-events-none bg-gradient-to-br ${pack.gradient}`} />

            <div className="relative px-8 py-7 flex items-center justify-between">
              <div className="text-left">
                <p className="text-[7px] font-black uppercase tracking-[0.4em] opacity-40 mb-1.5 italic">
                  Pagar con Mercado Pago
                </p>
                <p className="text-[1.6rem] font-black italic tracking-tighter leading-none">
                  ${pack.price.toLocaleString("es-CL")}
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">CLP</span>
                </p>
                <p className="text-[8px] font-black uppercase tracking-widest opacity-40 mt-1 italic">
                  {pack.credits} diamantes → {balance + pack.credits} totales
                </p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/10 dark:bg-black/10 flex items-center justify-center text-3xl group-hover:scale-110 group-hover:rotate-12 transition-all duration-300 shrink-0">
                💎
              </div>
            </div>
          </button>

          {/* Nota de seguridad */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <svg className="w-3 h-3 text-zinc-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
            </svg>
            <p className="text-[7px] font-bold text-zinc-400 uppercase tracking-widest italic">
              Pago cifrado SSL · No guardamos tus datos de tarjeta
            </p>
          </div>
        </section>

        {/* ── GARANTÍAS ── */}
        <section className={`mb-8 transition-all duration-700 delay-[250ms] ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: "🔒", label: "Seguro",       desc: "SSL 256-bit" },
              { icon: "⚡", label: "Inmediato",     desc: "Al acreditar" },
              { icon: "♾️", label: "Sin caducidad", desc: "No vencen"   },
            ].map(({ icon, label, desc }) => (
              <div key={label} className="flex flex-col items-center text-center p-4 bg-[var(--card-light)] dark:bg-[var(--card-dark)] rounded-[2rem] border border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft">
                <span className="text-2xl mb-2.5 leading-none">{icon}</span>
                <p className="text-[8px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 italic leading-tight">{label}</p>
                <p className="text-[7px] text-zinc-400 dark:text-zinc-600 mt-0.5 italic">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Nota legal */}
        <p className="text-center text-[7px] font-bold text-zinc-300 dark:text-zinc-700 leading-relaxed italic pb-2">
          Los pagos son procesados por Mercado Pago Chile. ServiciosYa SpA no almacena datos financieros. Los créditos son unidades digitales internas sin valor monetario externo.
        </p>
      </div>

      <style>{`
        @keyframes reveal { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .animate-reveal { animation: reveal 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
        .animate-shake { animation: shake 0.35s ease-in-out; }
        ::-webkit-scrollbar { display:none; }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FILA DE PAQUETE (selector vertical con expansión)
───────────────────────────────────────────── */
function PackRow({ pack, isSelected, onSelect, balance, index }) {
  const newBalance  = balance + pack.credits;
  const animCredits = useCountUp(pack.credits, 700, isSelected);

  /* Paletas de color por paquete */
  const theme = {
    zinc: {
      ring:     "border-zinc-400 dark:border-zinc-500",
      idle:     "border-[var(--border-light)] dark:border-[var(--border-dark)]",
      bg:       "bg-[var(--card-light)] dark:bg-[var(--card-dark)]",
      selBg:    "bg-zinc-900 dark:bg-zinc-100",
      num:      "text-white dark:text-zinc-900",
      tagBg:    "bg-zinc-700 text-zinc-100 dark:bg-zinc-800 dark:text-zinc-300",
      savBg:    "bg-zinc-700/40 text-zinc-300",
      per:      "text-zinc-300 dark:text-zinc-600",
      desc:     "text-zinc-400 dark:text-zinc-500",
      divider:  "bg-zinc-700 dark:bg-zinc-800",
      check:    "border-zinc-500 dark:border-zinc-600",
      chkFill:  "bg-zinc-100 dark:bg-zinc-900",
      chkIcon:  "text-zinc-900 dark:text-zinc-100",
      priceSel: "text-white dark:text-zinc-900",
      priceIdle:"dark:text-white",
      subSel:   "text-zinc-400 dark:text-zinc-500",
    },
    black: {
      ring:     "border-black dark:border-white",
      idle:     "border-[var(--border-light)] dark:border-[var(--border-dark)]",
      bg:       "bg-[var(--card-light)] dark:bg-[var(--card-dark)]",
      selBg:    "bg-black dark:bg-white",
      num:      "text-white dark:text-black",
      tagBg:    "bg-white/20 text-white dark:bg-black/20 dark:text-black",
      savBg:    "bg-white/15 text-white/80",
      per:      "text-white/60 dark:text-black/50",
      desc:     "text-white/60 dark:text-black/50",
      divider:  "bg-white/10 dark:bg-black/10",
      check:    "border-white/30 dark:border-black/30",
      chkFill:  "bg-white dark:bg-black",
      chkIcon:  "text-black dark:text-white",
      priceSel: "text-white dark:text-black",
      priceIdle:"dark:text-white",
      subSel:   "text-white/40 dark:text-black/40",
    },
    blue: {
      ring:     "border-blue-500",
      idle:     "border-[var(--border-light)] dark:border-[var(--border-dark)]",
      bg:       "bg-[var(--card-light)] dark:bg-[var(--card-dark)]",
      selBg:    "bg-blue-600",
      num:      "text-white",
      tagBg:    "bg-white/20 text-white",
      savBg:    "bg-white/20 text-white",
      per:      "text-blue-200",
      desc:     "text-blue-100/70",
      divider:  "bg-white/15",
      check:    "border-white/30",
      chkFill:  "bg-white",
      chkIcon:  "text-blue-600",
      priceSel: "text-white",
      priceIdle:"dark:text-white",
      subSel:   "text-blue-200/60",
    },
  };

  const t = theme[pack.accent] || theme.zinc;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-[2.5rem] border-2 transition-all duration-400 active:scale-[0.98] overflow-hidden ${
        isSelected ? `${t.selBg} ${t.ring} shadow-2xl` : `${t.bg} ${t.idle} hover:border-zinc-300 dark:hover:border-zinc-600`
      }`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="px-7 py-5">
        <div className="flex items-center gap-4">

          {/* Radio button */}
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300 ${
            isSelected ? `${t.chkFill} ${t.ring}` : `${t.check} bg-transparent`
          }`}>
            {isSelected && (
              <div className={`w-3 h-3 rounded-full ${pack.accent === "blue" ? "bg-blue-600" : pack.accent === "black" ? "bg-black dark:bg-white" : "bg-zinc-900 dark:bg-zinc-100"}`} />
            )}
          </div>

          {/* Número de créditos */}
          <div className="flex items-baseline gap-2 min-w-[90px]">
            <span className={`text-3xl font-black italic tracking-tighter leading-none transition-all duration-300 ${isSelected ? t.num : "dark:text-white"}`}>
              {isSelected ? animCredits : pack.credits}
            </span>
            <span className="text-lg leading-none">💎</span>
          </div>

          {/* Info central */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[9px] font-black uppercase tracking-widest italic ${isSelected ? t.num : "dark:text-white"}`}>
                {pack.label}
              </span>
              {pack.tag && (
                <span className={`px-2.5 py-1 rounded-full text-[6px] font-black uppercase tracking-widest shrink-0 ${isSelected ? t.tagBg : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"}`}>
                  {pack.tag}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[8px] font-black uppercase tracking-widest italic ${isSelected ? t.per : "text-emerald-600 dark:text-emerald-400"}`}>
                ${pack.perUnit}/💎
              </span>
              {pack.savings > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[6px] font-black uppercase tracking-widest ${isSelected ? t.savBg : "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"}`}>
                  -{pack.savings}%
                </span>
              )}
              <span className={`text-[7px] italic ${isSelected ? t.per : "text-zinc-400"}`}>
                {pack.postulations}
              </span>
            </div>
          </div>

          {/* Precio */}
          <div className="text-right shrink-0">
            <p className={`text-xl font-black italic tracking-tighter leading-none ${isSelected ? t.priceSel : t.priceIdle}`}>
              ${pack.price.toLocaleString("es-CL")}
            </p>
            <p className={`text-[7px] font-black uppercase tracking-widest mt-0.5 italic ${isSelected ? t.subSel : "text-zinc-400"}`}>
              CLP
            </p>
          </div>
        </div>

        {/* Descripción expandida */}
        <div className={`overflow-hidden transition-all duration-500 ${isSelected ? "max-h-32 opacity-100 mt-4" : "max-h-0 opacity-0 mt-0"}`}>
          <div className={`h-px mb-4 ${t.divider}`} />
          <div className="flex items-start justify-between gap-4">
            <p className={`text-[9px] font-medium leading-relaxed italic flex-1 ${t.desc}`}>
              {pack.desc}
            </p>
            <div className={`text-right shrink-0 ${t.per}`}>
              <p className="text-[7px] font-black uppercase tracking-widest italic mb-0.5">Nuevo total</p>
              <p className="text-base font-black italic leading-none">{balance + pack.credits} 💎</p>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────
   RESUMEN DEL PEDIDO
───────────────────────────────────────────── */
function OrderSummary({ pack, balance }) {
  const animTotal = useCountUp(balance + pack.credits, 800, true);

  return (
    <div className="rounded-[2.5rem] border border-[var(--border-light)] dark:border-[var(--border-dark)] overflow-hidden bg-[var(--card-light)] dark:bg-[var(--card-dark)] shadow-soft">

      {/* Cabecera */}
      <div className="px-7 py-4 border-b border-[var(--border-light)] dark:border-[var(--border-dark)] flex items-center justify-between">
        <p className="text-[8px] font-black uppercase tracking-[0.35em] text-zinc-400 italic">Resumen del pedido</p>
        <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 italic">{pack.label}</span>
      </div>

      {/* Filas */}
      <div className="px-7 py-5 space-y-3.5">
        <SummaryRow label={`Pack ${pack.label} (${pack.credits} 💎)`} value={`$${pack.price.toLocaleString("es-CL")}`} />
        <SummaryRow label="Saldo actual" value={`${balance} 💎`} muted />
        <SummaryRow label="Crédito/unidad" value={`$${pack.perUnit}/💎`} muted />
        {pack.savings > 0 && <SummaryRow label={`Ahorro vs. pack básico`} value={`-${pack.savings}%`} green />}
      </div>

      {/* Total */}
      <div className="px-7 py-5 bg-zinc-50 dark:bg-zinc-900/60 border-t border-[var(--border-light)] dark:border-[var(--border-dark)] flex items-center justify-between gap-4">
        <div>
          <p className="text-[7px] font-black uppercase tracking-widest text-zinc-400 italic mb-1">Saldo después de recargar</p>
          <div className="flex items-baseline gap-2">
            <span className="text-[1.75rem] font-black italic dark:text-white tracking-tighter leading-none">
              {animTotal}
            </span>
            <span className="text-lg">💎</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[7px] font-black uppercase tracking-widest text-zinc-400 italic mb-1">Total a pagar</p>
          <p className="text-xl font-black italic dark:text-white tracking-tighter leading-none">
            ${pack.price.toLocaleString("es-CL")} <span className="text-[8px] opacity-40">CLP</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, muted, green }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={`text-[9px] font-bold uppercase tracking-widest italic ${muted ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-600 dark:text-zinc-300"}`}>
        {label}
      </span>
      <span className={`text-[10px] font-black italic shrink-0 ${
        green ? "text-emerald-600 dark:text-emerald-400" :
        muted ? "text-zinc-400 dark:text-zinc-500" :
                "dark:text-white"
      }`}>
        {value}
      </span>
    </div>
  );
}