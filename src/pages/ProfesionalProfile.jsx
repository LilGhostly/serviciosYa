import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useUser } from "../context/UserContext";
import { getVerificationLevel, VERIFICATION_LEVELS, VERIFICATION_META, getMunicipalBadges } from "../lib/business";

/* ─────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────── */
const TAG_INFO = {
  puntual: { label: "Puntual",      icon: "⏱️" },
  limpio:  { label: "Limpio",       icon: "✨" },
  experto: { label: "Muy Pro",      icon: "👨‍🔧" },
  precio:  { label: "Precio Justo", icon: "💰" },
  amable:  { label: "Amable",       icon: "🤝" },
};

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function ProfesionalProfile() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { user }     = useUser();

  const [profesional, setProfesional] = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [notFound,    setNotFound]    = useState(false);

  useEffect(() => {
    if (!id) return;

    /* Seguridad: no exponer datos sensibles en perfiles públicos */
    const fetchPro = async () => {
      try {
        setLoading(true);
        const snap = await getDoc(doc(db, "users", id));
        if (!snap.exists()) { setNotFound(true); return; }

        const data = snap.data();

        /* Solo mostrar perfiles de profesionales */
        if (data.role && data.role !== "profesional") {
          setNotFound(true);
          return;
        }

        /* Filtrar campos sensibles — solo proyectar lo necesario */
        setProfesional({
          name:               data.profile?.name    || data.name    || "Profesional",
          rubro:              data.profile?.rubro   || data.rubro   || "",
          rubros:             Array.isArray(data.profile?.rubros) && data.profile.rubros.length
                                 ? data.profile.rubros
                                 : (data.profile?.rubro ? [data.profile.rubro] : []),
          comuna:             data.profile?.comuna  || data.comuna  || "",
          region:             data.profile?.region  || data.region  || "",
          experience:         data.profile?.experience || "1",
          bio:                data.profile?.bio     || "",
          photoUrl:           data.profile?.photoUrl || "",
          ratingStats:        data.ratingStats      || { totalStars: 0, totalReviews: 0, tags: {} },
          isIdentityVerified: data.isIdentityVerified === true,
          // BUG corregido: este campo nunca se proyectaba, así que el sello
          // municipal otorgado desde Admin.jsx jamás llegaba a mostrarse
          // acá, aunque sí quedaba guardado en Firestore.
          municipalVerification: data.municipalVerification || null,
          reputationPoints:   data.reputationPoints || 0,
          isBlocked:          data.isBlocked        || false,
          createdAt:          data.createdAt,
          /* NO exponer: rut, phone, email, credits, transactions */
        });
      } catch (err) {
        console.error("Error perfil profesional:", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPro();
  }, [id]);

  /* ─── LOADING ─── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* ─── NO ENCONTRADO ─── */
  if (notFound || !profesional) {
    return (
      <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-6xl mb-8 opacity-10 italic">👤</p>
        <p className="text-zinc-400 font-black uppercase tracking-[0.3em] text-[10px] italic mb-8">
          Perfil no disponible
        </p>
        <button
          onClick={() => navigate(-1)}
          className="text-black dark:text-white font-black uppercase text-[10px] tracking-widest underline underline-offset-8"
        >
          Regresar
        </button>
      </div>
    );
  }

  /* ─── PROFESIONAL BLOQUEADO ─── */
  if (profesional.isBlocked) {
    return (
      <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-6xl mb-8 opacity-10 italic">🚫</p>
        <p className="text-zinc-400 font-black uppercase tracking-[0.3em] text-[10px] italic mb-8">
          Este perfil ha sido suspendido
        </p>
        <button onClick={() => navigate(-1)} className="text-black dark:text-white font-black uppercase text-[10px] tracking-widest underline underline-offset-8">
          Regresar
        </button>
      </div>
    );
  }

  /* Cálculos */
  const stats      = profesional.ratingStats;
  const average    = stats.totalReviews >= 3
    ? (stats.totalStars / stats.totalReviews).toFixed(1)
    : null; // No mostrar rating hasta 3 reseñas para evitar sesgos
  const isVerified = profesional.isIdentityVerified;
  const verificationLevel = getVerificationLevel(profesional);
  const isMunicipal = verificationLevel === VERIFICATION_LEVELS.MUNICIPAL;
  const municipalBadges = isMunicipal ? getMunicipalBadges(profesional?.municipalVerification) : [];

  const activeTags = stats.tags
    ? Object.entries(stats.tags)
        .filter(([_, c]) => c > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : [];

  const joinDate = profesional.createdAt?.toDate
    ? profesional.createdAt.toDate().toLocaleDateString("es-CL", { month: "long", year: "numeric" })
    : null;

  const isOwnProfile = user?.uid === id;

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] font-sans pb-32 overflow-x-hidden transition-colors duration-500">

      {/* NAVBAR */}
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
            {isOwnProfile ? "Tu perfil público" : "Perfil Profesional"}
          </span>
          <div className="w-11" />
        </div>
      </nav>

      <main className="max-w-md mx-auto px-6 pt-10">

        {/* ── HERO ── */}
        <section className="text-center mb-14 animate-reveal">
          {/* Avatar */}
          <div className="relative inline-block mb-8">
            <div className="w-36 h-36 rounded-[3.5rem] bg-zinc-900 dark:bg-zinc-100 border-8 border-white dark:border-zinc-900 shadow-2xl overflow-hidden flex items-center justify-center">
              {profesional.photoUrl ? (
                <img
                  src={profesional.photoUrl}
                  className="w-full h-full object-cover"
                  alt={profesional.name}
                />
              ) : (
                <span className="text-5xl text-white dark:text-black font-black italic">
                  {profesional.name.charAt(0)}
                </span>
              )}
            </div>
            {isMunicipal ? (
              <div
                className="absolute -bottom-2 -right-2 bg-amber-500 text-white p-3 rounded-2xl shadow-2xl border-4 border-[var(--bg-light)] dark:border-[var(--bg-dark)] animate-reveal"
                style={{ animationDelay: "0.25s" }}
                title="Verificado por tu Municipalidad"
              >
                {/* Ícono tipo "institución" (landmark) */}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M4 21V10m16 11V10M4 10l8-6 8 6M6 10v6m4-6v6m4-6v6m4-6v6" />
                </svg>
              </div>
            ) : isVerified && (
              <div
                className="absolute -bottom-2 -right-2 bg-blue-600 text-white p-3 rounded-2xl shadow-2xl border-4 border-[var(--bg-light)] dark:border-[var(--bg-dark)] animate-reveal"
                style={{ animationDelay: "0.25s" }}
                title="Identidad verificada"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
            )}
          </div>

          {/* Nombre y rubro(s) */}
          <h1 className="text-4xl font-black tracking-tighter uppercase italic leading-none mb-3 dark:text-white">
            {profesional.name}
          </h1>
          {profesional.rubros?.length > 0 && (
            <p className="text-blue-600 dark:text-blue-400 font-black uppercase text-[10px] tracking-[0.4em] italic mb-3">
              {profesional.rubros.join(" · ")}
            </p>
          )}
          {profesional.comuna && (
            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest italic">
              📍 {profesional.comuna}{profesional.region ? `, ${profesional.region}` : ""}
            </p>
          )}

          {/* Alerta de strikes visibles */}
          {profesional.reputationPoints >= 2 && (
            <div className="mt-5 px-5 py-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-[2rem] inline-block">
              <p className="text-[8px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-widest">
                ⚠️ Este profesional tiene {profesional.reputationPoints} reporte{profesional.reputationPoints > 1 ? "s" : ""} de conducta
              </p>
            </div>
          )}
        </section>

        {/* ── MÉTRICAS ── */}
        <section className="grid grid-cols-2 gap-4 mb-12 animate-reveal" style={{ animationDelay: "0.08s" }}>
          <div className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] p-8 rounded-[3rem] border border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft text-left">
            <p className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.3em] mb-4 italic">Rating</p>
            {average ? (
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black tracking-tighter italic dark:text-white">{average}</span>
                <span className="text-amber-500 text-xl">★</span>
              </div>
            ) : (
              <div>
                <span className="text-2xl font-black italic text-zinc-300 dark:text-zinc-700">—</span>
                <p className="text-[7px] font-black text-zinc-400 uppercase tracking-widest mt-1 italic">
                  {stats.totalReviews > 0 ? `${stats.totalReviews} reseña${stats.totalReviews > 1 ? "s" : ""}` : "Sin reseñas"}
                </p>
              </div>
            )}
          </div>
          <div className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] p-8 rounded-[3rem] border border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft text-left">
            <p className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.3em] mb-4 italic">Trabajos</p>
            <span className="text-4xl font-black tracking-tighter italic dark:text-white">
              {stats.totalReviews}
            </span>
          </div>
        </section>

        {/* ── MEDALLERO ── */}
        {activeTags.length > 0 && (
          <section className="mb-12 animate-reveal" style={{ animationDelay: "0.16s" }}>
            <p className="text-[9px] font-black uppercase text-zinc-400 mb-6 tracking-[0.4em] text-center italic">
              Reconocimientos de clientes
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {activeTags.map(([tagId, count]) => {
                const info = TAG_INFO[tagId];
                if (!info) return null;
                return (
                  <div
                    key={tagId}
                    className="flex items-center gap-3 px-5 py-3 rounded-full border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm"
                  >
                    <span className="text-lg">{info.icon}</span>
                    <div className="text-left">
                      <p className="text-[8px] font-black uppercase tracking-widest leading-none text-zinc-400 mb-1 italic">
                        {info.label}
                      </p>
                      <p className="text-[10px] font-black italic leading-none dark:text-white">
                        {count} voto{count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── INFO PROFESIONAL ── */}
        <section className="animate-reveal" style={{ animationDelay: "0.24s" }}>
          <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-zinc-400 mb-5 pl-2 italic">
            Expediente profesional
          </h3>
          <div className="bg-[var(--card-light)] dark:bg-[var(--card-dark)] rounded-[3.5rem] p-10 border border-[var(--border-light)] dark:border-[var(--border-dark)] shadow-soft space-y-8">

            {profesional.comuna && (
              <ProfileItem
                label="Zona de trabajo"
                value={profesional.region
                  ? `${profesional.comuna}, ${profesional.region}`
                  : profesional.comuna}
                icon="📍"
              />
            )}

            <div className="h-px bg-zinc-100 dark:bg-zinc-800 opacity-50" />

            <ProfileItem
              label="Experiencia"
              value={`${profesional.experience} año${Number(profesional.experience) !== 1 ? "s" : ""} en el oficio`}
              icon="🛡️"
            />

            {joinDate && (
              <>
                <div className="h-px bg-zinc-100 dark:bg-zinc-800 opacity-50" />
                <ProfileItem
                  label="Miembro desde"
                  value={joinDate}
                  icon="📅"
                />
              </>
            )}

            {/* Verificación */}
            <div className="h-px bg-zinc-100 dark:bg-zinc-800 opacity-50" />
            <div className="flex items-center gap-5">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 ${
                isMunicipal
                  ? "bg-amber-50 dark:bg-amber-950/20"
                  : isVerified
                    ? "bg-blue-50 dark:bg-blue-950/20"
                    : "bg-zinc-50 dark:bg-zinc-900"
              }`}>
                {isMunicipal ? "🏛️" : isVerified ? "✅" : "⚪"}
              </div>
              <div>
                <p className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.3em] mb-1 italic">
                  Verificación
                </p>
                <p className={`text-sm font-black italic tracking-tight ${
                  isMunicipal
                    ? "text-amber-600 dark:text-amber-400"
                    : isVerified
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-zinc-400"
                }`}>
                  {VERIFICATION_META[verificationLevel].label}
                </p>
                {isMunicipal && (
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium italic mt-1 leading-snug max-w-[220px]">
                    {VERIFICATION_META[verificationLevel].description}
                    {profesional.municipalVerification?.comuna && (
                      <> — OMIL {profesional.municipalVerification.comuna}</>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Sub-sellos del pasaporte municipal ampliado (OMIL/BNE,
                Registro Civil, Migraciones) — ver docs/INNOVACION.md */}
            {isMunicipal && municipalBadges.length > 0 && (
              <div className="flex flex-col gap-2 pl-[68px] -mt-2">
                {municipalBadges.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
                    <span>{b.icon}</span>
                    <span className="font-medium italic">{b.label}</span>
                  </div>
                ))}
                {profesional.municipalVerification?.folio && (
                  <p className="text-[9px] font-mono text-zinc-400 mt-1">
                    Folio {profesional.municipalVerification.folio}
                  </p>
                )}
              </div>
            )}

            {/* Nivel de confianza (línea de progreso hacia el sello municipal) */}
            {!isMunicipal && (
              <>
                <div className="h-px bg-zinc-100 dark:bg-zinc-800 opacity-50" />
                <div className="bg-amber-50/60 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/30 rounded-[2rem] px-6 py-5">
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] text-amber-700 dark:text-amber-400 mb-1 italic">
                    Próximo nivel disponible
                  </p>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium leading-relaxed">
                    Este profesional aún no cuenta con el sello <strong>"Verificado por tu Municipalidad"</strong>,
                    otorgado por la OMIL de su comuna a quienes ya validaron su identidad y antecedentes
                    con el municipio.
                  </p>
                </div>
              </>
            )}

            {/* Biografía */}
            {profesional.bio && (
              <>
                <div className="h-px bg-zinc-100 dark:bg-zinc-800 opacity-50" />
                <div>
                  <p className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.4em] mb-4 italic">
                    Sobre mí
                  </p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 font-medium italic leading-relaxed">
                    "{profesional.bio}"
                  </p>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── AVISO DE SEGURIDAD ── */}
        <div className="mt-10 p-5 bg-zinc-50 dark:bg-zinc-900/50 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 text-center animate-reveal" style={{ animationDelay: "0.32s" }}>
          <p className="text-[7px] font-black uppercase tracking-widest text-zinc-400 leading-relaxed">
            🔒 Nunca realices pagos fuera de la plataforma ni compartas datos bancarios por el chat.
          </p>
        </div>

      </main>

      <style>{`
        @keyframes reveal { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        .animate-reveal { animation: reveal 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTES
───────────────────────────────────────────── */
function ProfileItem({ label, value, icon }) {
  return (
    <div className="flex items-center gap-5 text-left">
      <div className="w-12 h-12 rounded-2xl bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center text-xl shadow-inner shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[8px] font-black text-zinc-400 uppercase tracking-[0.3em] mb-1.5 leading-none italic">
          {label}
        </p>
        <p className="text-sm font-black dark:text-zinc-200 leading-none italic tracking-tighter truncate">
          {value}
        </p>
      </div>
    </div>
  );
}