import { useNavigate, Link } from "react-router-dom";

/* ─────────────────────────────────────────────
   DATOS — Términos expandidos y legalmente sólidos
───────────────────────────────────────────── */
const TERMS = [
  {
    number: "01",
    title:  "Aceptación y elegibilidad",
    content:"Al crear una cuenta en ServiciosYa, declaras ser mayor de 18 años, tener capacidad legal para celebrar contratos según la legislación chilena y que todos los datos proporcionados son verídicos. La plataforma se reserva el derecho de suspender cuentas donde se detecte falsedad en la información.",
  },
  {
    number: "02",
    title:  "Naturaleza de la plataforma",
    content:"ServiciosYa actúa exclusivamente como intermediario tecnológico de conexión entre clientes y profesionales independientes. No somos parte del contrato de servicio entre las partes. La responsabilidad por la ejecución técnica, garantías, precios y calidad del trabajo recae íntegramente en el profesional contratado.",
  },
  {
    number: "03",
    title:  "Verificación de identidad",
    content:"Los profesionales deben completar el proceso KYC (verificación de identidad) mediante escaneo de cédula chilena y validación biométrica. Los clientes deben proporcionar RUT verídico. El uso de documentos falsos o datos de terceros constituye una violación grave que resulta en suspensión permanente y puede implicar acciones legales.",
  },
  {
    number: "04",
    title:  "Sistema de créditos (Diamantes)",
    content:"Los Diamantes Pro son unidades de acceso virtual sin valor monetario fuera de la plataforma. No son reembolsables salvo falla técnica imputable a ServiciosYa debidamente documentada. No expiran mientras la cuenta esté activa. La compra de créditos es una transacción de servicios digitales sujeta a las condiciones de la pasarela de pago utilizada (Mercado Pago).",
  },
  {
    number: "05",
    title:  "Conducta y uso aceptable",
    content:"Está estrictamente prohibido: usar la plataforma para actividades ilegales, acosar o amenazar a otros usuarios, publicar contenido falso o engañoso, operar fuera del servicio acordado para eludir el sistema, o intentar comprometer la seguridad de la plataforma. Las infracciones generan strikes y pueden resultar en suspensión permanente.",
  },
  {
    number: "06",
    title:  "Sistema de reputación y reportes",
    content:"Los reportes de conducta son revisados y pueden generar penalizaciones automáticas según su gravedad. Al acumular 3 puntos de reputación negativa, la cuenta queda suspendida. ServiciosYa se reserva el derecho de compartir información con autoridades en casos de conducta delictiva documentada.",
  },
  {
    number: "07",
    title:  "Privacidad y protección de datos",
    content:"El tratamiento de datos personales se rige por la Ley N° 19.628 de Protección de la Vida Privada de Chile. Para ejercer tus derechos de acceso, rectificación, cancelación u oposición, contacta a privacidad@serviciosya.cl. Consulta nuestra Política de Privacidad completa para mayor detalle.",
  },
  {
    number: "08",
    title:  "Modificación de términos",
    content:"ServiciosYa puede modificar estos Términos en cualquier momento. Los cambios se notificarán con al menos 15 días de anticipación mediante la aplicación. El uso continuado de la plataforma tras ese período implica la aceptación de las nuevas condiciones.",
  },
  {
    number: "09",
    title:  "Jurisdicción y ley aplicable",
    content:"Estos Términos se rigen por las leyes de la República de Chile. Cualquier disputa que no pueda resolverse mediante soporte interno se someterá a los Tribunales Ordinarios de Justicia de la ciudad de Santiago, Chile.",
  },
];

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function Terminos() {
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
          <span className="text-[9px] font-black uppercase tracking-[0.4em] opacity-30 italic">Legal</span>
          <div className="w-11" />
        </div>
      </nav>

      <main className="max-w-md mx-auto px-6 pt-10 space-y-10 text-left">

        {/* HEADER */}
        <header className="animate-reveal">
          <h1 className="text-4xl font-black tracking-tighter uppercase leading-none italic mb-4 dark:text-white">
            Términos <span className="opacity-20 italic">&</span><br/>Condiciones
          </h1>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-1 bg-black dark:bg-white rounded-full" />
            <p className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.3em] italic">
              Actualizado: Feb 2026 · Chile
            </p>
          </div>
          <p className="text-[9px] text-zinc-500 font-medium leading-relaxed italic max-w-[280px]">
            Al usar ServiciosYa aceptas los siguientes términos. Léelos con atención; regulan tu relación con la plataforma y con otros usuarios.
          </p>
        </header>

        {/* AVISO DESTACADO */}
        <div className="p-6 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-[2.5rem] animate-reveal" style={{ animationDelay: "0.05s" }}>
          <p className="text-[8px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-widest leading-relaxed">
            ⚠️ ServiciosYa NO cobra comisión por el valor del servicio. Nunca solicita pagos fuera de la plataforma ni a través del chat.
          </p>
        </div>

        {/* ARTÍCULOS LEGALES */}
        <div className="space-y-4 animate-reveal" style={{ animationDelay: "0.1s" }}>
          {TERMS.map((term, i) => (
            <TermCard key={i} term={term} delay={`${0.04 * i}s`} />
          ))}
        </div>

        {/* FOOTER LEGAL */}
        <div className="pb-4 animate-reveal" style={{ animationDelay: "0.4s" }}>
          <div className="p-8 bg-zinc-100 dark:bg-zinc-900 rounded-[3rem] border border-zinc-200 dark:border-zinc-800 shadow-soft">
            <p className="text-[8px] font-black uppercase text-zinc-400 tracking-[0.3em] mb-4 italic">
              ¿Tienes preguntas legales?
            </p>
            <Link
              to="/contacto"
              className="btn-primary w-full py-5 flex items-center justify-center gap-2 !rounded-[2rem]"
            >
              Contactar al equipo →
            </Link>
            <div className="flex justify-between items-center mt-6">
              <Link
                to="/privacidad"
                className="text-[8px] font-black uppercase tracking-widest text-zinc-400 hover:text-black dark:hover:text-white transition-colors underline underline-offset-4"
              >
                Política de Privacidad
              </Link>
              <span className="text-[7px] text-zinc-300 dark:text-zinc-700 font-bold uppercase tracking-widest italic">
                © {new Date().getFullYear()} ServiciosYa SpA
              </span>
            </div>
          </div>
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
   TARJETA LEGAL
───────────────────────────────────────────── */
function TermCard({ term, delay }) {
  return (
    <article
      className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] p-7 rounded-[2.5rem] border border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft animate-reveal"
      style={{ animationDelay: delay }}
    >
      <div className="flex items-baseline gap-4 mb-3">
        <span className="text-2xl font-black italic opacity-10 leading-none shrink-0">{term.number}</span>
        <h3 className="text-sm font-black uppercase tracking-tighter italic dark:text-white leading-tight">
          {term.title}
        </h3>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium italic pl-10">
        {term.content}
      </p>
    </article>
  );
}