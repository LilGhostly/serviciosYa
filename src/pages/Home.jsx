import { Link, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { useEffect, useState, useRef, useCallback } from "react";

/* ─────────────────────────────────────────────
   DATOS
   NOTA: STATS está hardcodeado. Idealmente debería
   venir de un endpoint (ej: GET /stats/home) cacheado
   por unos minutos/horas, para no mostrar números
   falsos o desactualizados a medida que creces.

   NOTA: ESPECIALIDADES es un texto de marketing (el
   marquee animado de la portada), por eso usa sustantivos
   ("Gasfitería") y no los nombres de oficio exactos del
   catálogo funcional (que sí viven en src/data/categories.js
   y se usan en Solicitar.jsx / RegisterProfesional.jsx).
   Se amplió para reflejar que la plataforma ya no es solo
   servicios del hogar, sino cualquier trabajo independiente.
───────────────────────────────────────────── */
const ESPECIALIDADES = [
  "Gasfitería", "Electricidad", "Pintura", "Carpintería",
  "Limpieza", "Jardinería", "Climatización", "Fletes",
  "Techumbre", "Pisos", "Albañilería", "Soldadura",
  "Cerrajería", "Fumigación", "Mudanzas",
  "Barbería", "Tatuajes", "Psicología", "Entrenamiento personal",
  "Clases particulares", "Fotografía", "Manicura", "Maquillaje",
];

const STATS = [
  { value: "+12.000", label: "Servicios realizados" },
  { value: "4.9★", label: "Calificación promedio" },
  { value: "+900", label: "Profesionales activos" },
  { value: "15 min", label: "Tiempo de respuesta" },
];

const STEPS_CLIENT = [
  { n: "01", title: "Publica tu pedido", desc: "Describe el problema, adjunta fotos y elige urgencia." },
  { n: "02", title: "Recibe propuestas", desc: "Profesionales verificados te envían presupuestos." },
  { n: "03", title: "Acepta y coordina", desc: "Elige al mejor, acuerda fecha y recibe el PIN de seguridad." },
  { n: "04", title: "Trabajo completado", desc: "Confirmas el término y calificas. Solo tú liberas el servicio." },
];

const STEPS_PRO = [
  { n: "01", title: "Crea tu perfil Pro", desc: "Registra tus especialidades. Verificamos tu identidad." },
  { n: "02", title: "Postula a trabajos", desc: "Ve solicitudes en tu zona y envía tu cotización." },
  { n: "03", title: "Valida con PIN", desc: "Al llegar, el cliente te da el PIN para iniciar." },
  { n: "04", title: "Cobra y crece", desc: "El cliente certifica y tu rating sube. Más trabajo." },
];

const SECURITY_ITEMS = [
  {
    icon: "🪪",
    title: "Identidad verificada",
    desc: "Cada profesional pasa por validación de RUT y revisión manual antes de aparecer disponible. Sin perfil verificado, sin trabajo.",
  },
  {
    icon: "🔐",
    title: "PIN de confirmación",
    desc: "Al iniciar un servicio el cliente entrega un PIN de 4 dígitos al profesional. Sin PIN, el trabajo no puede comenzar.",
  },
  {
    icon: "⭐",
    title: "Doble calificación",
    desc: "Clientes y profesionales se califican mutuamente al terminar. El historial es permanente y público.",
  },
  {
    icon: "🛡️",
    title: "Sistema de strikes",
    desc: "Cualquier conducta inapropiada genera strikes automáticos. A los 3 strikes, la cuenta queda suspendida definitivamente.",
  },
];

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function Home() {
  const { user } = useUser();
  const navigate = useNavigate();
  const role = user?.role || null;

  const [scrollY, setScrollY] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("cliente"); // "cliente" | "pro"
  const [redirecting, setRedirecting] = useState(false);
  const heroRef = useRef(null);
  const tickingRef = useRef(false);

  /* Redirect si ya está logueado.
     Se marca `redirecting` de inmediato para no montar
     todo el home (animaciones, marquee, listeners) un
     instante antes de navegar a otra ruta. */
  useEffect(() => {
    if (role === "cliente") {
      setRedirecting(true);
      navigate("/cliente/dashboard", { replace: true });
    } else if (role === "profesional") {
      setRedirecting(true);
      navigate("/prof/dashboard", { replace: true });
    }
  }, [role, navigate]);

  /* Scroll tracking, throttleado con requestAnimationFrame
     para no disparar un setState en cada pixel de scroll.
     `scrolled` (booleano para el nav) se separa de `scrollY`
     (número, usado solo para el parallax del hero) para
     evitar renders innecesarios del nav mientras se hace
     scroll dentro del hero. */
  const handleScroll = useCallback(() => {
    if (tickingRef.current) return;
    tickingRef.current = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      setScrollY(y);
      setScrolled((prev) => (prev !== y > 40 ? y > 40 : prev));
      tickingRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (redirecting) return;
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll, redirecting]);

  /* Entrada con delay */
  useEffect(() => {
    if (redirecting) return;
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, [redirecting]);

  /* Usuario logueado: no renderizamos el home completo,
     solo un loader mínimo mientras se redirige. */
  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-light)] dark:bg-[var(--bg-dark)]">
        <div
          className="w-8 h-8 rounded-full border-2 border-zinc-300 dark:border-zinc-700 border-t-black dark:border-t-white animate-spin motion-reduce:animate-none"
          role="status"
          aria-label="Redirigiendo"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] font-sans overflow-x-hidden transition-colors duration-500">

      {/* ══════════════════════════════════════
          NAVBAR
      ══════════════════════════════════════ */}
      <nav className={`fixed top-0 w-full z-[100] transition-all duration-500 ${
        scrolled
          ? "py-3 bg-[var(--bg-light)]/90 dark:bg-[var(--bg-dark)]/90 backdrop-blur-xl border-b border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-sm"
          : "py-5 bg-transparent"
      }`}>
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black dark:focus-visible:outline-white">
            <div className="w-9 h-9 rounded-xl bg-black dark:bg-white flex items-center justify-center shadow-lg">
              <span className="text-white dark:text-black font-black text-lg italic leading-none">S</span>
            </div>
            <span className="font-black text-base tracking-tighter uppercase dark:text-white leading-none">
              Servicios<span className="opacity-40">Ya</span>
            </span>
          </Link>

          {/* Acciones */}
          {!role && (
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                aria-label="Iniciar sesión"
                className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black dark:focus-visible:outline-white"
              >
                {/* Ícono visible siempre; texto se oculta solo en pantallas muy chicas */}
                <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
                </svg>
                <span className="hidden sm:inline">Iniciar sesión</span>
              </Link>
              <Link
                to="/registro"
                className="btn-primary !px-5 !py-2.5 !rounded-full !text-[9px] shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black dark:focus-visible:outline-white"
              >
                Comenzar gratis
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* ══════════════════════════════════════
          HERO
      ══════════════════════════════════════ */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16 overflow-hidden"
      >
        {/* Fondo de marquee — puramente decorativo */}
        <div className="absolute inset-0 z-0 pointer-events-none select-none overflow-hidden" aria-hidden="true">
          <div
            className="absolute inset-0 opacity-[0.055] dark:opacity-[0.07] motion-reduce:transform-none"
            style={{ transform: `translateY(${scrollY * 0.15}px)` }}
          >
            <div className="flex flex-col gap-0 -rotate-6 scale-110 py-8">
              {[0, 1, 2, 3, 4].map((row) => (
                <MarqueeRow
                  key={row}
                  items={row % 2 === 0 ? ESPECIALIDADES : [...ESPECIALIDADES].reverse()}
                  direction={row % 2 === 0 ? "left" : "right"}
                  speed={`${90 + row * 20}s`}
                  size={row % 3 === 0 ? "text-6xl md:text-8xl" : row % 3 === 1 ? "text-5xl md:text-7xl" : "text-4xl md:text-6xl"}
                />
              ))}
            </div>
          </div>
          {/* Viñeta suave */}
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-light)]/40 via-transparent to-[var(--bg-light)]/60 dark:from-[var(--bg-dark)]/40 dark:via-transparent dark:to-[var(--bg-dark)]/60" />
        </div>

        {/* Contenido hero */}
        <div className={`relative z-10 w-full max-w-4xl mx-auto text-center transition-all duration-1000 motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>

          {/* Pill badge */}
          <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white/60 dark:bg-black/40 backdrop-blur-sm mb-10">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none shrink-0" aria-hidden="true" />
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-600 dark:text-zinc-300">
              +900 profesionales verificados en Chile
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-[clamp(3.2rem,12vw,7.5rem)] font-black tracking-[-0.04em] leading-[0.88] mb-8 dark:text-white">
            EL EXPERTO
            <br />
            <span className="text-zinc-300 dark:text-zinc-700 italic">QUE NECESITAS.</span>
            <br />
            HOY.
          </h1>

          {/* Subtítulo */}
          <p className="text-sm md:text-base font-medium text-zinc-500 dark:text-zinc-400 max-w-sm md:max-w-md mx-auto leading-relaxed mb-12">
            Conectamos a clientes con profesionales independientes verificados, para cualquier tipo de trabajo. Sin intermediarios, con seguridad real en cada servicio.
          </p>

          {/* CTA DUAL */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4 max-w-sm sm:max-w-none mx-auto">
            <Link
              to="/registro"
              className="group relative flex flex-col items-center justify-center px-10 py-5 rounded-[2rem] bg-black dark:bg-white text-white dark:text-black font-black shadow-2xl active:scale-95 transition-all duration-200 overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black dark:focus-visible:outline-white"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] motion-reduce:hidden transition-transform duration-700 skew-x-12" />
              <span className="text-[8px] font-black uppercase tracking-[0.3em] opacity-50 mb-1">Necesito un</span>
              <span className="text-base tracking-tight leading-none">Servicio 🤝</span>
            </Link>

            <Link
              to="/registro-profesional"
              className="group flex flex-col items-center justify-center px-10 py-5 rounded-[2rem] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-black dark:text-white font-black shadow-lg active:scale-95 transition-all duration-200 hover:border-black dark:hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black dark:focus-visible:outline-white"
            >
              <span className="text-[8px] font-black uppercase tracking-[0.3em] opacity-40 mb-1">Soy</span>
              <span className="text-base tracking-tight leading-none">Profesional 🛠️</span>
            </Link>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap justify-center items-center gap-6 mt-14 opacity-35 dark:opacity-25">
            {["🛡️ Identidad verificada", "🔐 PIN de confirmación", "🏛️ Verificación municipal", "⭐ Reseñas reales", "⚡ Respuesta inmediata"].map((b) => (
              <span key={b} className="text-[9px] font-black uppercase tracking-[0.2em] dark:text-white">
                {b}
              </span>
            ))}
          </div>
        </div>

        {/* Flecha scroll — decorativa */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 opacity-30 animate-bounce motion-reduce:animate-none" aria-hidden="true">
          <div className="w-px h-12 bg-current dark:text-white" />
          <svg className="w-4 h-4 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* ══════════════════════════════════════
          STATS
      ══════════════════════════════════════ */}
      <section className="relative z-10 py-4 border-y border-[var(--border-light)] dark:border-[var(--border-dark)] bg-[var(--card-light)] dark:bg-[var(--card-dark)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[var(--border-light)] dark:divide-[var(--border-dark)]">
            {STATS.map(({ value, label }) => (
              <div key={label} className="px-6 py-8 text-center">
                <p className="text-3xl md:text-4xl font-black tracking-tighter dark:text-white leading-none mb-2 italic">
                  {value}
                </p>
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-400 leading-tight">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          CÓMO FUNCIONA
      ══════════════════════════════════════ */}
      <section className="relative z-10 py-24 md:py-36 px-6">
        <div className="max-w-5xl mx-auto">

          {/* Header sección */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.35em] text-zinc-400 mb-4 italic">
                El proceso
              </p>
              <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-none dark:text-white">
                ASÍ DE<br />
                <span className="text-zinc-300 dark:text-zinc-700 italic">SIMPLE.</span>
              </h2>
            </div>

            {/* Selector de tab */}
            <div role="tablist" aria-label="Cómo funciona según tu rol" className="flex p-1 rounded-[1.5rem] bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 self-start md:self-auto">
              {["cliente", "pro"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 rounded-[1.25rem] text-[9px] font-black uppercase tracking-widest transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:focus-visible:outline-white ${
                    activeTab === tab
                      ? "bg-black dark:bg-white text-white dark:text-black shadow-lg"
                      : "text-zinc-400 hover:text-black dark:hover:text-white"
                  }`}
                >
                  {tab === "cliente" ? "🏠 Clientes" : "🛠️ Profesionales"}
                </button>
              ))}
            </div>
          </div>

          {/* Pasos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6" role="tabpanel">
            {(activeTab === "cliente" ? STEPS_CLIENT : STEPS_PRO).map(({ n, title, desc }, i) => (
              <StepCard key={`${activeTab}-${n}`} n={n} title={title} desc={desc} delay={i * 80} />
            ))}
          </div>

          {/* CTA al final */}
          <div className="mt-16 text-center">
            <Link
              to={activeTab === "cliente" ? "/registro" : "/registro-profesional"}
              className="inline-flex items-center gap-3 btn-primary px-10 py-5 !rounded-[2rem] shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black dark:focus-visible:outline-white"
            >
              <span className="font-black text-sm tracking-tight">
                {activeTab === "cliente" ? "Solicitar mi primer servicio" : "Registrarme como Pro"}
              </span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <p className="text-[8px] font-black uppercase tracking-widest text-zinc-400 mt-4 italic">
              {activeTab === "cliente" ? "Gratis · Sin comisiones ocultas" : "Gratis · 10 créditos de bienvenida"}
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          SEGURIDAD — DIFERENCIAL CLAVE
      ══════════════════════════════════════ */}
      <section className="relative z-10 py-24 md:py-36 px-6 border-t border-[var(--border-light)] dark:border-[var(--border-dark)] bg-[var(--card-light)] dark:bg-[var(--card-dark)] overflow-hidden">

        {/* Decoración número grande — puramente decorativa */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 text-[20rem] font-black text-zinc-100 dark:text-zinc-900 opacity-100 select-none pointer-events-none leading-none italic -mr-16 hidden md:block" aria-hidden="true">
          🔐
        </div>

        <div className="max-w-5xl mx-auto relative z-10">
          <div className="max-w-xl">
            <p className="text-[9px] font-black uppercase tracking-[0.35em] text-zinc-400 mb-4 italic">
              Por qué elegirnos
            </p>
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-none dark:text-white mb-10">
              SEGURIDAD<br />
              <span className="text-zinc-300 dark:text-zinc-700 italic">EN CADA</span><br />
              PASO.
            </h2>

            <div className="space-y-6">
              {SECURITY_ITEMS.map(({ icon, title, desc }) => (
                <div key={title} className="flex items-start gap-5 group">
                  <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-xl shrink-0 shadow-sm group-hover:shadow-md transition-shadow" aria-hidden="true">
                    {icon}
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-tight dark:text-white mb-1">{title}</p>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          CTA FINAL
      ══════════════════════════════════════ */}
      <section className="relative z-10 py-24 md:py-40 px-6 overflow-hidden border-t border-[var(--border-light)] dark:border-[var(--border-dark)]">

        {/* Fondo marquee final — decorativo */}
        <div className="absolute inset-0 z-0 pointer-events-none select-none overflow-hidden opacity-[0.04] dark:opacity-[0.06]" aria-hidden="true">
          <MarqueeRow items={ESPECIALIDADES} direction="left" speed="60s" size="text-9xl" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <h2 className="text-5xl md:text-7xl font-black tracking-tighter leading-none dark:text-white mb-6 italic">
            ¿LISTO?
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-12 max-w-sm mx-auto leading-relaxed">
            Únete a la red de servicios más confiable de Chile. Gratis, seguro y sin intermediarios.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/registro"
              className="w-full sm:w-auto group relative flex flex-col items-center justify-center px-12 py-6 rounded-[2rem] bg-black dark:bg-white text-white dark:text-black font-black shadow-2xl active:scale-95 transition-all duration-200 overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black dark:focus-visible:outline-white"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] motion-reduce:hidden transition-transform duration-700 skew-x-12" />
              <span className="text-[8px] opacity-50 uppercase tracking-[0.3em] mb-1">Quiero un</span>
              <span className="text-lg tracking-tighter">Servicio 🏠</span>
            </Link>
            <Link
              to="/registro-profesional"
              className="w-full sm:w-auto flex flex-col items-center justify-center px-12 py-6 rounded-[2rem] border-2 border-black dark:border-white text-black dark:text-white font-black active:scale-95 transition-all duration-200 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black dark:focus-visible:outline-white"
            >
              <span className="text-[8px] opacity-40 uppercase tracking-[0.3em] mb-1">Soy</span>
              <span className="text-lg tracking-tighter">Profesional 🛠️</span>
            </Link>
          </div>

          <div className="flex items-center justify-center gap-4 mt-12 opacity-30">
            <div className="h-px w-16 bg-current dark:text-white" aria-hidden="true" />
            <p className="text-[8px] font-black uppercase tracking-[0.3em] dark:text-white">
              100% Chileno · 100% Seguro
            </p>
            <div className="h-px w-16 bg-current dark:text-white" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          FOOTER MÍNIMO
      ══════════════════════════════════════ */}
      <footer className="relative z-10 py-8 px-6 border-t border-[var(--border-light)] dark:border-[var(--border-dark)]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-black dark:bg-white flex items-center justify-center">
              <span className="text-white dark:text-black font-black text-xs italic">S</span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">ServiciosYa</span>
          </div>
          <div className="flex items-center gap-6">
            {[
              { label: "Términos", to: "/terminos" },
              { label: "Privacidad", to: "/privacidad" },
              { label: "Soporte", to: "/soporte" },
            ].map(({ label, to }) => (
              <Link
                key={label}
                to={to}
                className="text-[8px] font-black uppercase tracking-widest text-zinc-400 hover:text-black dark:hover:text-white transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:focus-visible:outline-white"
              >
                {label}
              </Link>
            ))}
          </div>
          <p className="text-[8px] text-zinc-300 dark:text-zinc-700 font-bold uppercase tracking-widest">
            © {new Date().getFullYear()} ServiciosYa
          </p>
        </div>
      </footer>

      <style>{`
        /* Marquee */
        @keyframes marquee         { from { transform: translateX(0); }    to { transform: translateX(-50%); } }
        @keyframes marquee-reverse { from { transform: translateX(-50%); } to { transform: translateX(0); }   }
        .animate-marquee         { animation: marquee linear infinite; }
        .animate-marquee-reverse { animation: marquee-reverse linear infinite; }

        /* Respeta la preferencia de "reducir movimiento" del sistema.
           Antes se ocultaba la scrollbar globalmente y se reproducían
           todas las animaciones sin excepción; ahora quienes activan
           esta preferencia (accesibilidad, mareo por movimiento, etc.)
           dejan de recibir el marquee, el bounce y el parallax. */
        @media (prefers-reduced-motion: reduce) {
          .animate-marquee,
          .animate-marquee-reverse {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTES
   (se mantienen en el mismo archivo a propósito,
   junto al resto del código existente del proyecto)
───────────────────────────────────────────── */
function MarqueeRow({ items, direction, speed, size }) {
  const cls = direction === "left" ? "animate-marquee" : "animate-marquee-reverse";
  return (
    <div className="flex whitespace-nowrap overflow-hidden py-2">
      <div className={`flex gap-12 pr-12 ${cls}`} style={{ animationDuration: speed }}>
        {[...items, ...items, ...items].map((item, i) => (
          <span key={i} className={`${size} font-black uppercase tracking-tighter italic dark:text-white text-black leading-none`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function StepCard({ n, title, desc, delay }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    // Si el usuario prefiere menos movimiento, se muestra directo sin animar.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setTimeout(() => setVisible(true), delay); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`group p-8 rounded-[2.5rem] bg-[var(--card-light)] dark:bg-[var(--card-dark)] border border-[var(--border-light)] dark:border-[var(--border-dark)] hover:border-black dark:hover:border-white transition-all duration-500 cursor-default ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
      style={{ transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1), border-color 0.3s` }}
    >
      <div className="flex items-start gap-6">
        {/* Número — parte de la secuencia real de pasos, no decorativo */}
        <span className="text-5xl font-black text-zinc-100 dark:text-zinc-800 italic leading-none shrink-0 group-hover:text-zinc-200 dark:group-hover:text-zinc-700 transition-colors">
          {n}
        </span>
        <div>
          <h3 className="text-base font-black uppercase tracking-tight dark:text-white mb-2 leading-tight">
            {title}
          </h3>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {desc}
          </p>
        </div>
      </div>
    </div>
  );
}