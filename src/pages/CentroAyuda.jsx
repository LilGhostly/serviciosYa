import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useUser } from "../context/UserContext";

/* ─────────────────────────────────────────────
   DATOS
───────────────────────────────────────────── */
const FAQS = [
  /* ── AMBOS ── */
  {
    id: 1, category: "cuenta", role: "both",
    question: "¿Cómo restablezco mi contraseña?",
    answer: "Desde la pantalla de inicio de sesión, presiona '¿Olvidaste tu contraseña?'. Recibirás un enlace seguro en el email registrado. El enlace expira en 1 hora por seguridad.",
  },
  {
    id: 2, category: "seguridad", role: "both",
    question: "¿Mis datos personales están protegidos?",
    answer: "Sí. Utilizamos cifrado SSL/TLS en todas las comunicaciones. Tu RUT, teléfono y dirección solo son visibles para la contraparte una vez que el servicio está formalmente confirmado. Nunca vendemos datos a terceros.",
  },
  {
    id: 3, category: "seguridad", role: "both",
    question: "¿Qué hago si detecto uso fraudulento de mi cuenta?",
    answer: "Cierra sesión inmediatamente desde todos los dispositivos y cambia tu contraseña. Luego contacta a soporte desde esta misma pantalla con el asunto 'Acceso no autorizado'. Nuestro equipo responde en menos de 2 horas hábiles.",
  },
  {
    id: 4, category: "cuenta", role: "both",
    question: "¿Cómo elimino mi cuenta definitivamente?",
    answer: "Puedes solicitar la eliminación completa de tus datos enviando un ticket desde Soporte con el asunto 'Eliminación de cuenta'. Procesamos la solicitud en 5 días hábiles conforme a la Ley N° 19.628 de protección de datos.",
  },

  /* ── PROFESIONALES ── */
  {
    id: 5, category: "cuenta", role: "profesional",
    question: "¿Cómo obtengo el Sello de Verificación Azul?",
    answer: "Desde tu perfil, presiona el escudo azul. El proceso escanea tu cédula de identidad chilena por ambos lados y captura una selfie biométrica. La verificación se completa en el momento. Sin ella, tu perfil no aparece disponible para los clientes.",
  },
  {
    id: 6, category: "pagos", role: "profesional",
    question: "¿Qué son los Diamantes y cómo los uso?",
    answer: "Los Diamantes son créditos internos que usas para postular a trabajos. Un trabajo Normal cuesta 4 💎 y uno Urgente cuesta 6 💎. Se descuentan al enviar tu propuesta, no al ser aceptado. Puedes recargarlos en tu Billetera.",
  },
  {
    id: 7, category: "pagos", role: "profesional",
    question: "¿Qué pasa si el cliente rechaza mi propuesta?",
    answer: "Los diamantes descontados por la postulación no son reembolsables cuando el cliente rechaza. Por eso recomendamos leer bien la descripción del trabajo antes de postular y enviar propuestas detalladas y competitivas.",
  },
  {
    id: 8, category: "servicios", role: "profesional",
    question: "¿Qué ocurre si el cliente no confirma el término del trabajo?",
    answer: "Si el cliente no confirma dentro de las 48 horas posteriores a que marcaste el trabajo como terminado, el sistema lo certifica automáticamente. Recibirás una notificación en tu buzón cuando eso ocurra.",
  },
  {
    id: 9, category: "seguridad", role: "profesional",
    question: "¿Qué es el sistema de strikes?",
    answer: "Cada reporte válido de un cliente suma puntos a tu registro de conducta. Al acumular 3 puntos, tu cuenta queda suspendida. Los strikes por conducta grave (acoso, suplantación) cuentan triple. Mantén siempre una actitud profesional.",
  },
  {
    id: 10, category: "servicios", role: "profesional",
    question: "¿Puedo cancelar un trabajo una vez iniciado?",
    answer: "Sí, pero cancelar un trabajo en estado 'En Curso' aplica una penalización automática en tu perfil. Si hay una razón de fuerza mayor, explícala con detalle al cerrar el servicio para que el equipo evalúe el caso.",
  },

  /* ── CLIENTES ── */
  {
    id: 11, category: "servicios", role: "cliente",
    question: "¿Cómo solicito un servicio?",
    answer: "Presiona el botón '+' en tu panel. Describe el problema, sube fotos de referencia y selecciona si es urgente o puedes programarlo. Los profesionales de tu zona recibirán la solicitud y te enviarán propuestas.",
  },
  {
    id: 12, category: "seguridad", role: "cliente",
    question: "¿Para qué sirve el PIN de seguridad?",
    answer: "El PIN de 4 dígitos es el control de acceso al inicio del servicio. Solo tú lo ves y solo tú se lo entregas al profesional al llegar. Sin ese PIN, el profesional no puede marcar el trabajo como iniciado. No lo compartas por chat ni teléfono.",
  },
  {
    id: 13, category: "pagos", role: "cliente",
    question: "¿Debo pagar a través de la app?",
    answer: "No. ServiciosYa no cobra comisión por el valor del trabajo. El pago se acuerda directamente con el profesional al finalizar el servicio, en efectivo o transferencia según lo convengan.",
  },
  {
    id: 14, category: "seguridad", role: "cliente",
    question: "¿Cómo sé que el profesional es confiable?",
    answer: "Revisa el Sello Azul (identidad verificada), el promedio de estrellas y las etiquetas que otros clientes le dejaron. Si el profesional tiene reportes de conducta visibles en su perfil, te recomendamos buscar otra opción.",
  },
  {
    id: 15, category: "servicios", role: "cliente",
    question: "¿Puedo cancelar un pedido después de aceptar una propuesta?",
    answer: "Sí, puedes cancelar antes de que el profesional llegue. Una vez que hayas validado el PIN y el trabajo esté 'En Curso', la cancelación debe coordinarse directamente con el profesional.",
  },
];

const CATEGORIES = [
  { id: "all",       label: "Todas",     icon: "🔍" },
  { id: "cuenta",    label: "Cuenta",    icon: "👤" },
  { id: "pagos",     label: "Pagos",     icon: "💎" },
  { id: "seguridad", label: "Seguridad", icon: "🛡️" },
  { id: "servicios", label: "Flujo",     icon: "⚡" },
];

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function CentroAyuda() {
  const { user }  = useUser();
  const navigate  = useNavigate();

  const [searchTerm,      setSearchTerm]      = useState("");
  const [activeCategory,  setActiveCategory]  = useState("all");
  const [openId,          setOpenId]          = useState(null);

  const role = user?.role || "cliente";

  /* Filtrado memoizado */
  const filteredFaqs = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();
    return FAQS.filter((faq) => {
      const correctRole  = faq.role === "both" || faq.role === role;
      const matchCat     = activeCategory === "all" || faq.category === activeCategory;
      const matchSearch  = !search
        || faq.question.toLowerCase().includes(search)
        || faq.answer.toLowerCase().includes(search);
      return correctRole && matchCat && matchSearch;
    });
  }, [searchTerm, activeCategory, role]);

  const toggleItem = (id) => setOpenId(openId === id ? null : id);

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
          <span className="text-[9px] font-black uppercase tracking-[0.4em] opacity-30 italic">
            Centro de Ayuda · {role === "profesional" ? "Pro" : "Cliente"}
          </span>
          <div className="w-11" />
        </div>
      </nav>

      <main className="max-w-md mx-auto px-6 pt-10 space-y-8 text-left">

        {/* HEADER */}
        <header className="animate-reveal">
          <h1 className="text-4xl font-black tracking-tighter uppercase leading-none italic mb-2 dark:text-white">
            ¿En qué<br/><span className="opacity-20 italic">podemos ayudar?</span>
          </h1>
          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-3 italic">
            {filteredFaqs.length} respuesta{filteredFaqs.length !== 1 ? "s" : ""} disponibles
          </p>
        </header>

        {/* BUSCADOR */}
        <div className="relative animate-reveal" style={{ animationDelay: "0.05s" }}>
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none opacity-30">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setOpenId(null); }}
            placeholder="Buscar en las preguntas frecuentes..."
            className="input-base !rounded-[2rem] !py-5 !pl-14 !bg-zinc-50 dark:!bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-inner italic w-full"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute inset-y-0 right-5 flex items-center text-zinc-300 hover:text-zinc-500 transition-colors"
            >
              ×
            </button>
          )}
        </div>

        {/* CATEGORÍAS */}
        <section className="flex gap-3 overflow-x-auto no-scrollbar pb-1 animate-reveal" style={{ animationDelay: "0.1s" }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setOpenId(null); }}
              className={`flex items-center gap-2 px-5 py-3 rounded-full text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all border italic shrink-0
                ${activeCategory === cat.id
                  ? "bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-xl"
                  : "bg-transparent text-zinc-400 border-[var(--border-light)] dark:border-[var(--border-dark)] hover:border-zinc-400"}`}
            >
              <span>{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </section>

        {/* ACCORDION */}
        <section className="space-y-3 animate-reveal" style={{ animationDelay: "0.15s" }}>
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq) => (
              <AccordionItem
                key={faq.id}
                item={faq}
                isOpen={openId === faq.id}
                onClick={() => toggleItem(faq.id)}
                searchTerm={searchTerm}
              />
            ))
          ) : (
            <div className="text-center py-24 opacity-20 italic">
              <p className="text-4xl mb-6">🔍</p>
              <p className="text-[10px] font-black uppercase tracking-widest">Sin resultados para tu búsqueda</p>
            </div>
          )}
        </section>

        {/* CTA DE SOPORTE */}
        <div className="pb-6 animate-reveal" style={{ animationDelay: "0.2s" }}>
          <div className="p-10 bg-zinc-900 dark:bg-white rounded-[3.5rem] text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-4 right-6 opacity-5 text-8xl font-black italic select-none text-white dark:text-black pointer-events-none">?</div>
            <div className="text-4xl mb-4 relative z-10">💬</div>
            <p className="text-[9px] font-black uppercase text-zinc-500 mb-2 tracking-[0.3em] relative z-10 italic">
              ¿No encontraste tu respuesta?
            </p>
            <p className="text-[8px] text-zinc-600 mb-8 relative z-10 leading-relaxed">
              Nuestro equipo responde en horario hábil.
            </p>
            <Link
              to="/contacto"
              className="w-full py-5 bg-white dark:bg-black text-black dark:text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] inline-block relative z-10 shadow-xl active:scale-95 transition-all"
            >
              Contactar Soporte →
            </Link>
          </div>
        </div>
      </main>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes reveal { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .animate-reveal { animation: reveal 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   ACCORDION
───────────────────────────────────────────── */
function AccordionItem({ item, isOpen, onClick, searchTerm }) {
  /* Highlight de búsqueda */
  const highlight = (text) => {
    if (!searchTerm.trim()) return text;
    const parts = text.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === searchTerm.toLowerCase()
        ? <mark key={i} className="bg-amber-200 dark:bg-amber-700/50 text-current rounded px-0.5">{part}</mark>
        : part
    );
  };

  return (
    <div className={`rounded-[2.5rem] border transition-all duration-400 overflow-hidden
      ${isOpen
        ? "bg-zinc-50 dark:bg-zinc-900 border-black dark:border-white shadow-soft"
        : "bg-[var(--card-light)] dark:bg-[var(--card-dark)] border-[var(--border-light)] dark:border-[var(--border-dark)]"}`}
    >
      <button
        onClick={onClick}
        className="w-full px-7 py-5 flex justify-between items-center text-left gap-4"
        aria-expanded={isOpen}
      >
        <span className="text-xs font-black uppercase tracking-tight italic dark:text-white leading-snug flex-1">
          {highlight(item.question)}
        </span>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-400 shrink-0 ${
          isOpen
            ? "bg-black dark:bg-white text-white dark:text-black rotate-180"
            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
        }`}>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </button>

      <div className={`transition-all duration-400 ease-in-out ${isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"} overflow-hidden`}>
        <div className="px-7 pb-7">
          <div className="h-px bg-zinc-200 dark:bg-zinc-800 mb-5 opacity-50" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed italic">
            {highlight(item.answer)}
          </p>
        </div>
      </div>
    </div>
  );
}