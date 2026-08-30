import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";

/* ─────────────────────────────────────────────
   CONFETI LIGERO — solo CSS, sin librerías
───────────────────────────────────────────── */
const CONFETTI_COLORS = [
  "bg-emerald-400", "bg-blue-500", "bg-amber-400",
  "bg-purple-500",  "bg-pink-400", "bg-zinc-900 dark:bg-white",
];

function Confetti() {
  const pieces = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left:  `${Math.random() * 100}%`,
    delay: `${(Math.random() * 1.2).toFixed(2)}s`,
    size:  Math.random() > 0.5 ? "w-2 h-2" : "w-1.5 h-3",
    rotate:`rotate-[${Math.floor(Math.random() * 360)}deg]`,
    dur:   `${(1.8 + Math.random() * 1.4).toFixed(2)}s`,
  }));

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden>
      {pieces.map((p) => (
        <div
          key={p.id}
          className={`absolute top-0 rounded-sm ${p.color} ${p.size} ${p.rotate} opacity-80 confetti-fall`}
          style={{
            left:              p.left,
            animationDelay:    p.delay,
            animationDuration: p.dur,
          }}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function VerificacionExitosa() {
  const { user }   = useUser();
  const navigate   = useNavigate();

  const [visible,   setVisible]   = useState(false);
  const [countdown, setCountdown] = useState(10);

  /* Determinar destino según rol */
  const dashboard = user?.role === "profesional"
    ? "/prof/dashboard"
    : "/cliente/dashboard";

  const billetera = user?.role === "profesional"
    ? "/prof/billetera"
    : "/mis-solicitudes";

  const billeteraLabel = user?.role === "profesional"
    ? "Ver mis Diamantes 💎"
    : "Ir a mis pedidos";

  /* Entrada con delay para que el confeti cargue primero */
  useEffect(() => {
    window.scrollTo(0, 0);
    const t = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(t);
  }, []);

  /* Contador regresivo de redirección automática */
  useEffect(() => {
    if (countdown <= 0) { navigate(dashboard); return; }
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown, dashboard, navigate]);

  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden transition-colors duration-500 font-sans">

      {/* CONFETI */}
      <Confetti />

      {/* CARD CENTRAL */}
      <div
        className={`relative z-10 w-full max-w-sm transition-all duration-700 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        {/* ICONO DE ÉXITO */}
        <div className="relative flex items-center justify-center mb-10">
          {/* Anillo animado */}
          <div className="absolute w-40 h-40 rounded-full border-4 border-emerald-400/20 animate-ping" />
          <div className="absolute w-32 h-32 rounded-full border-2 border-emerald-400/10 animate-ping" style={{ animationDelay: "0.3s" }} />

          {/* Círculo principal */}
          <div className="relative w-28 h-28 bg-emerald-500 rounded-full flex items-center justify-center shadow-[0_20px_60px_rgba(16,185,129,0.35)] z-10 animate-scale-up">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7"/>
            </svg>
          </div>

          {/* Badge de diamante */}
          <div
            className="absolute -top-1 -right-1 w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-2xl shadow-xl z-20 animate-bounce"
            style={{ animationDelay: "0.5s" }}
          >
            💎
          </div>
        </div>

        {/* TÍTULO */}
        <h1
          className="text-4xl font-black uppercase tracking-tighter dark:text-white leading-none mb-4 italic animate-reveal"
          style={{ animationDelay: "0.15s" }}
        >
          ¡Email<br/>
          <span className="text-emerald-500">Verificado!</span>
        </h1>

        {/* SUBTÍTULO */}
        <p
          className="text-zinc-500 dark:text-zinc-400 font-medium text-sm max-w-[260px] mx-auto leading-relaxed mb-4 animate-reveal"
          style={{ animationDelay: "0.22s" }}
        >
          Tu cuenta está activa.{" "}
          {user?.role === "profesional" ? (
            <>Hemos añadido <span className="font-black text-blue-600 dark:text-blue-400">10 Diamantes 💎</span> de bienvenida a tu billetera.</>
          ) : (
            <>Ya puedes empezar a solicitar servicios cerca de ti.</>
          )}
        </p>

        {/* PILL DE USUARIO */}
        {(user?.profile?.name || user?.name) && (
          <div
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full mb-8 animate-reveal"
            style={{ animationDelay: "0.28s" }}
          >
            <div className="w-5 h-5 rounded-full bg-black dark:bg-white flex items-center justify-center">
              <span className="text-white dark:text-black font-black text-[9px] leading-none">
                {(user.profile?.name || user.name).charAt(0)}
              </span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 italic">
              {(user.profile?.name || user.name).split(" ")[0]}
              {user.role === "profesional" ? " · Pro" : " · Cliente"}
            </span>
          </div>
        )}

        {/* CHECKLIST DE BENEFICIOS */}
        <div
          className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] rounded-[2.5rem] p-6 border border-[var(--border-light)] dark:border-[var(--border-dark)] mb-8 shadow-soft text-left animate-reveal"
          style={{ animationDelay: "0.32s" }}
        >
          <p className="text-[8px] font-black uppercase tracking-widest text-zinc-400 mb-4 italic text-center">
            Lo que desbloqueaste
          </p>
          <div className="space-y-3">
            {[
              { icon: "✅", text: "Cuenta verificada y activa" },
              user?.role === "profesional"
                ? { icon: "💎", text: "10 Diamantes de bienvenida acreditados" }
                : { icon: "🏠", text: "Acceso completo para solicitar servicios" },
              {
                icon: "🛡️",
                text: user?.role === "profesional"
                  ? "Puedes iniciar la verificación de identidad (Sello Azul)"
                  : "Sello de cliente verificado visible para profesionales",
              },
              {
                icon: "⚡",
                text: user?.role === "profesional"
                  ? "Listo para postular a trabajos en tu zona"
                  : "Listo para solicitar servicios cercanos",
              },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <span className="text-base shrink-0 leading-none mt-0.5">{icon}</span>
                <p className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 leading-snug italic">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* BOTONES */}
        <div
          className="space-y-3 animate-reveal"
          style={{ animationDelay: "0.38s" }}
        >
          <Link
            to={dashboard}
            className="block w-full py-6 bg-black dark:bg-white text-white dark:text-black rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all italic"
          >
            Ir al Panel de Control →
          </Link>
          <Link
            to={billetera}
            className="block w-full py-4 bg-[var(--card-light)] dark:bg-[var(--card-dark)] border border-[var(--border-light)] dark:border-[var(--border-dark)] text-zinc-500 dark:text-zinc-400 rounded-[2rem] text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all italic shadow-soft"
          >
            {billeteraLabel}
          </Link>
        </div>

        {/* CONTADOR DE REDIRECCIÓN */}
        <p
          className="mt-6 text-[8px] font-black uppercase tracking-widest text-zinc-300 dark:text-zinc-700 italic animate-reveal"
          style={{ animationDelay: "0.44s" }}
        >
          Redirigiendo automáticamente en {countdown}s...
        </p>
      </div>

      {/* FONDOS DECORATIVOS */}
      <div className="fixed top-[-15%] right-[-10%] w-[70%] h-[45%] bg-emerald-400/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[60%] h-[35%] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

      <style>{`
        @keyframes scale-up {
          from { transform:scale(0.7); opacity:0; }
          to   { transform:scale(1);   opacity:1; }
        }
        .animate-scale-up { animation: scale-up 0.7s cubic-bezier(0.16,1,0.3,1) forwards; }

        @keyframes reveal {
          from { opacity:0; transform:translateY(14px); }
          to   { opacity:1; transform:translateY(0);    }
        }
        .animate-reveal { animation: reveal 0.7s cubic-bezier(0.16,1,0.3,1) both; }

        @keyframes confettiFall {
          0%   { transform:translateY(-20px) rotate(0deg);   opacity:1; }
          100% { transform:translateY(100vh) rotate(720deg); opacity:0; }
        }
        .confetti-fall { animation: confettiFall linear forwards; }
      `}</style>
    </div>
  );
}