import { useNavigate } from "react-router-dom";

/* ─────────────────────────────────────────────
   DATOS
───────────────────────────────────────────── */
const SECTIONS = [
  {
    icon:    "🆔",
    title:   "Datos que recopilamos",
    content: "Recolectamos nombre completo, RUT, teléfono y correo electrónico para validar tu identidad dentro de la plataforma. No recopilamos más datos de los estrictamente necesarios para el servicio.",
  },
  {
    icon:    "👁️",
    title:   "Verificación biométrica (KYC)",
    content: "La verificación de identidad de los profesionales utiliza escaneo óptico de cédula y captura facial. Los datos biométricos no se almacenan como imagen: solo se guarda un hash criptográfico no reversible para validaciones futuras.",
  },
  {
    icon:    "📍",
    title:   "Geolocalización",
    content: "Tu ubicación GPS se solicita solo durante el uso activo de la app para calcular distancias y mostrarte servicios cercanos. No rastreamos tu posición en segundo plano. La ubicación exacta solo se comparte con la contraparte en el momento del servicio activo.",
  },
  {
    icon:    "🔐",
    title:   "Cifrado y seguridad",
    content: "Todas las comunicaciones entre tu dispositivo y nuestros servidores viajan mediante TLS 1.3. Los datos sensibles almacenados (como el RUT) están encriptados en reposo. ServiciosYa nunca vende, alquila ni comparte tu información con terceros.",
    highlight: true,
  },
  {
    icon:    "🤝",
    title:   "Compartición de datos",
    content: "Compartimos información mínima entre clientes y profesionales únicamente cuando un servicio es formalmente acordado. Antes de esa confirmación, ninguna de las partes puede ver datos de contacto de la otra.",
  },
  {
    icon:    "⚖️",
    title:   "Tus derechos (Ley N° 19.628)",
    content: "Tienes derecho a acceder, rectificar, cancelar y oponerte al tratamiento de tus datos personales. Para ejercer estos derechos, envía un ticket desde el Centro de Soporte con el asunto 'Derechos ARCO'. Procesamos tu solicitud en 5 días hábiles.",
  },
  {
    icon:    "🗑️",
    title:   "Retención y eliminación",
    content: "Conservamos tus datos mientras tu cuenta esté activa. Al eliminar tu cuenta, borramos toda información personal en un plazo máximo de 30 días, salvo obligaciones legales de retención (ej. transacciones financieras que exigen conservación por 5 años).",
  },
];

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function Privacidad() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] font-sans pb-32 transition-colors duration-500 overflow-x-hidden">

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
          <span className="text-[9px] font-black uppercase tracking-[0.4em] opacity-30 italic">Privacidad</span>
          <div className="w-11" />
        </div>
      </nav>

      <main className="max-w-md mx-auto px-6 pt-10 space-y-10 text-left">

        {/* HEADER */}
        <header className="animate-reveal">
          <div className="w-14 h-14 bg-blue-600 rounded-[2rem] flex items-center justify-center text-2xl mb-8 shadow-2xl shadow-blue-600/20 rotate-3 transition-transform hover:rotate-0">
            🛡️
          </div>
          <h1 className="text-4xl font-black tracking-tighter uppercase leading-none italic mb-4 dark:text-white">
            Política de <br/><span className="opacity-20 italic">Privacidad</span>
          </h1>
          <div className="flex items-center gap-3">
            <div className="w-8 h-1 bg-black dark:bg-white rounded-full" />
            <p className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.3em] italic">
              Vigente desde Feb 2026 · Chile
            </p>
          </div>
          <p className="text-[9px] text-zinc-500 font-medium leading-relaxed italic mt-4 max-w-[280px]">
            Tu información personal es un activo que protegemos con los más altos estándares de seguridad.
          </p>
        </header>

        {/* SECCIONES */}
        <div className="space-y-4 animate-reveal" style={{ animationDelay: "0.08s" }}>
          {SECTIONS.map((s, i) => (
            <PrivacyCard key={i} section={s} delay={`${0.05 * i}s`} />
          ))}
        </div>

        {/* CONTACTO LEGAL */}
        <div className="pb-4 animate-reveal" style={{ animationDelay: "0.3s" }}>
          <div className="p-10 bg-black dark:bg-white rounded-[3rem] text-center shadow-2xl">
            <p className="text-[8px] font-black uppercase tracking-[0.4em] mb-4 opacity-50 text-white dark:text-black italic">
              Consultas de Privacidad
            </p>
            <a
              href="mailto:privacidad@serviciosya.cl"
              className="text-sm font-black italic tracking-tighter underline underline-offset-8 text-white dark:text-black"
            >
              privacidad@serviciosya.cl
            </a>
            <p className="text-[7px] font-bold text-white/40 dark:text-black/40 uppercase tracking-widest mt-4">
              Respondemos en 5 días hábiles
            </p>
          </div>
          <p className="mt-6 text-center text-[7px] font-black text-zinc-400 uppercase tracking-[0.4em] italic">
            Conforme a Ley N° 19.628 · Chile
          </p>
        </div>
      </main>

      <style>{`
        @keyframes reveal { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .animate-reveal { animation: reveal 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TARJETA DE PRIVACIDAD
───────────────────────────────────────────── */
function PrivacyCard({ section, delay }) {
  return (
    <article
      className={`p-8 rounded-[3rem] border shadow-soft transition-all animate-reveal ${
        section.highlight
          ? "bg-blue-600 border-blue-600 text-white"
          : "bg-[var(--card-light)] dark:bg-[var(--card-dark)] border-[var(--border-light)] dark:border-[var(--border-dark)]"
      }`}
      style={{ animationDelay: delay }}
    >
      <div className="flex items-start gap-5">
        <div className={`text-2xl w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${
          section.highlight ? "bg-white/20" : "bg-zinc-100 dark:bg-zinc-800"
        }`}>
          {section.icon}
        </div>
        <div>
          <h3 className={`text-sm font-black uppercase tracking-tighter italic mb-2 leading-none ${
            section.highlight ? "text-white" : "dark:text-white"
          }`}>
            {section.title}
          </h3>
          <p className={`text-xs leading-relaxed font-medium italic ${
            section.highlight ? "text-white/80" : "text-zinc-500 dark:text-zinc-400"
          }`}>
            {section.content}
          </p>
        </div>
      </div>
    </article>
  );
}