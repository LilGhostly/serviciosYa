import { useNavigate } from "react-router-dom";

/* ─────────────────────────────────────────────
   DATOS
───────────────────────────────────────────── */
const VALUES = [
  {
    icon:  "🛡️",
    title: "Seguridad primero",
    desc:  "Verificamos la identidad de cada profesional con documento y biometría antes de publicar su perfil. Sin verificación, no hay operación.",
  },
  {
    icon:  "⚡",
    title: "Sin intermediarios",
    desc:  "Conectamos a las partes directamente. Sin comisiones sobre el trabajo, sin datos ocultos, sin sorpresas en el precio final.",
  },
  {
    icon:  "⭐",
    title: "Calidad con reputación real",
    desc:  "Cada servicio genera una reseña verificada. Los profesionales crecen por mérito, no por publicidad. Los clientes eligen con datos reales.",
  },
  {
    icon:  "🤝",
    title: "Dignidad del oficio",
    desc:  "Creemos que un gasfíter, un electricista o un carpintero merece las mismas herramientas digitales que cualquier profesional de cuello blanco.",
  },
];

const STATS = [
  { value: "+12.000", label: "Servicios realizados" },
  { value: "4.9 ★",  label: "Calificación promedio" },
  { value: "+900",   label: "Profesionales activos" },
];

const TEAM_VALUES = [
  "Honestidad radical",
  "Seguridad sin concesiones",
  "Diseño que respeta al usuario",
  "Comunidad sobre crecimiento",
];

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function SobreNosotros() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] font-sans pb-32 overflow-x-hidden transition-colors duration-500">

      {/* NAV */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-[var(--border-light)] dark:border-[var(--border-dark)] px-6 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="w-11 h-11 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center active:scale-90 transition-all border border-zinc-200 dark:border-zinc-800"
          >
            <svg className="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span className="text-[9px] font-black uppercase tracking-[0.4em] opacity-30 italic">
            Sobre Nosotros
          </span>
          <div className="w-11" />
        </div>
      </nav>

      <main className="max-w-md mx-auto px-6 pt-10 text-left">

        {/* HERO */}
        <section className="mb-14 animate-reveal">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-black dark:bg-white rounded-[2rem] mb-8 shadow-2xl rotate-3 transition-transform hover:rotate-0">
            <span className="text-white dark:text-black font-black text-2xl italic">S</span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter uppercase leading-none italic mb-4 dark:text-white">
            Nacimos para<br/>
            <span className="opacity-20 italic">cambiar el oficio.</span>
          </h1>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-xs italic">
            ServiciosYa conecta a clientes con profesionales de oficios verificados en Chile. Sin intermediarios, con seguridad real y reputación honesta.
          </p>
        </section>

        {/* MISIÓN */}
        <section className="mb-14 animate-reveal" style={{ animationDelay: "0.06s" }}>
          <div className="p-8 bg-[var(--card-light)] dark:bg-[var(--card-dark)] rounded-[3rem] border border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft">
            <p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest mb-4 italic">Nuestra misión</p>
            <p className="text-lg font-black italic tracking-tight leading-snug dark:text-white">
              "Eliminar la incertidumbre de contratar un servicio técnico y dignificar el trabajo de quienes hacen funcionar los hogares de Chile."
            </p>
          </div>
        </section>

        {/* VALORES */}
        <section className="mb-14 animate-reveal" style={{ animationDelay: "0.1s" }}>
          <p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest mb-6 ml-1 italic">
            Lo que nos define
          </p>
          <div className="space-y-4">
            {VALUES.map((v, i) => (
              <div
                key={i}
                className="flex items-start gap-5 p-7 bg-[var(--card-light)] dark:bg-[var(--card-dark)] rounded-[2.5rem] border border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft"
              >
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-2xl shrink-0">
                  {v.icon}
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight italic dark:text-white mb-2 leading-none">
                    {v.title}
                  </h3>
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 leading-relaxed italic">
                    {v.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* STATS */}
        <section className="mb-14 animate-reveal" style={{ animationDelay: "0.15s" }}>
          <div className="bg-zinc-900 dark:bg-white rounded-[3rem] p-8 shadow-2xl">
            <p className="text-[8px] font-black uppercase text-zinc-500 tracking-[0.4em] mb-8 text-center italic">
              Nuestro impacto
            </p>
            <div className="grid grid-cols-3 divide-x divide-white/10 dark:divide-zinc-200">
              {STATS.map(({ value, label }) => (
                <div key={label} className="flex flex-col items-center px-4 text-center">
                  <span className="text-2xl font-black text-white dark:text-zinc-900 tracking-tighter italic leading-none mb-1">
                    {value}
                  </span>
                  <span className="text-[7px] font-bold text-white/40 dark:text-zinc-500 uppercase tracking-widest leading-tight">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRINCIPIOS DEL EQUIPO */}
        <section className="mb-14 animate-reveal" style={{ animationDelay: "0.2s" }}>
          <p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest mb-5 ml-1 italic">
            Principios del equipo
          </p>
          <div className="space-y-3">
            {TEAM_VALUES.map((v, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-5 bg-[var(--card-light)] dark:bg-[var(--card-dark)] rounded-[2rem] border border-[var(--border-light)] dark:border-[var(--border-dark)]"
              >
                <span className="w-6 h-6 rounded-full bg-black dark:bg-white flex items-center justify-center text-white dark:text-black font-black text-[9px] shrink-0 italic">
                  {i + 1}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest italic dark:text-zinc-300">
                  {v}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* FOOTER */}
        <section className="pb-6 text-center animate-reveal" style={{ animationDelay: "0.25s" }}>
          <div className="h-px bg-zinc-100 dark:bg-zinc-800 mb-8 opacity-50" />
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-xl bg-black dark:bg-white flex items-center justify-center">
              <span className="text-white dark:text-black font-black text-xs italic">S</span>
            </div>
            <span className="font-black text-sm tracking-tighter uppercase dark:text-white">
              ServiciosYa
            </span>
          </div>
          <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest italic">
            Hecho con ❤️ en Santiago · © {new Date().getFullYear()} ServiciosYa SpA
          </p>
        </section>
      </main>

      <style>{`
        @keyframes reveal { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .animate-reveal { animation: reveal 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
      `}</style>
    </div>
  );
}