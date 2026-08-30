import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { db } from "../firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { RUBROS_LABELS } from "../data/categories";

/* ─────────────────────────────────────────────
   DATOS GEOGRÁFICOS COMPLETOS
───────────────────────────────────────────── */
const COMUNAS_POR_REGION = {
  "Arica y Parinacota": ["Arica", "Camarones", "Putre", "General Lagos"],
  "Tarapacá": ["Iquique", "Alto Hospicio", "Pozo Almonte", "Camiña", "Colchane", "Huara", "Pica"],
  "Antofagasta": ["Antofagasta", "Mejillones", "Sierra Gorda", "Taltal", "Calama", "Ollagüe", "San Pedro de Atacama", "Tocopilla", "María Elena"],
  "Atacama": ["Copiapó", "Caldera", "Tierra Amarilla", "Chañaral", "Diego de Almagro", "Vallenar", "Alto del Carmen", "Freirina", "Huasco"],
  "Coquimbo": ["La Serena", "Coquimbo", "Andacollo", "La Higuera", "Paiguano", "Vicuña", "Illapel", "Canela", "Los Vilos", "Salamanca", "Ovalle", "Combarbalá", "Monte Patria", "Punitaqui", "Río Hurtado"],
  "Valparaíso": ["Valparaíso", "Casablanca", "Concón", "Juan Fernández", "Puchuncaví", "Quintero", "Viña del Mar", "Isla de Pascua", "Los Andes", "Calle Larga", "Rinconada", "San Esteban", "La Ligua", "Cabildo", "Papudo", "Petorca", "Zapallar", "Quillota", "Calera", "Hijuelas", "La Cruz", "Nogales", "San Antonio", "Algarrobo", "Cartagena", "El Quisco", "El Tabo", "Santo Domingo", "San Felipe", "Catemu", "Llaillay", "Panquehue", "Putaendo", "Santa María", "Quilpué", "Limache", "Olmué", "Villa Alemana"],
  "Metropolitana": ["Santiago", "Cerrillos", "Cerro Navia", "Conchalí", "El Bosque", "Estación Central", "Huechuraba", "Independencia", "La Cisterna", "La Florida", "La Granja", "La Pintana", "La Reina", "Las Condes", "Lo Barnechea", "Lo Espejo", "Lo Prado", "Macul", "Maipú", "Ñuñoa", "Pedro Aguirre Cerda", "Peñalolén", "Providencia", "Pudahuel", "Quilicura", "Quinta Normal", "Recoleta", "Renca", "San Joaquín", "San Miguel", "San Ramón", "Vitacura", "Puente Alto", "Pirque", "San José de Maipo", "Colina", "Lampa", "Tiltil", "San Bernardo", "Buin", "Calera de Tango", "Paine", "Melipilla", "Alhué", "Curacaví", "María Pinto", "San Pedro", "Talagante", "El Monte", "Isla de Maipo", "Padre Hurtado", "Peñaflor"],
  "O'Higgins": ["Rancagua", "Codegua", "Coinco", "Coltauco", "Doñihue", "Graneros", "Las Cabras", "Machalí", "Malloa", "Mostazal", "Olivar", "Peumo", "Pichidegua", "Quinta de Tilcoco", "Rengo", "Requínoa", "San Vicente", "Pichilemu", "La Estrella", "Litueche", "Marchihue", "Navidad", "Paredones", "San Fernando", "Chépica", "Chimbarongo", "Lolol", "Nancagua", "Palmilla", "Peralillo", "Placilla", "Pumanque", "Santa Cruz"],
  "Maule": ["Talca", "Constitución", "Curepto", "Empedrado", "Maule", "Pelarco", "Pencahue", "Río Claro", "San Clemente", "San Rafael", "Cauquenes", "Chanco", "Pelluhue", "Curicó", "Hualañé", "Licantén", "Molina", "Rauco", "Romeral", "Sagrada Familia", "Teno", "Vichuquén", "Linares", "Colbún", "Longaví", "Parral", "Retiro", "San Javier", "Villa Alegre", "Yerbas Buenas"],
  "Ñuble": ["Chillán", "Chillán Viejo", "Bulnes", "Cobquecura", "Coelemu", "Coihueco", "El Carmen", "Ninhue", "Ñiquén", "Pemuco", "Pinto", "Portezuelo", "Quillón", "Quirihue", "Ránquil", "San Carlos", "San Fabián", "San Ignacio", "San Nicolás", "Treguaco", "Yungay"],
  "Biobío": ["Concepción", "Coronel", "Chiguayante", "Florida", "Hualpén", "Hualqui", "Lota", "Penco", "San Pedro de la Paz", "Santa Juana", "Talcahuano", "Tomé", "Lebu", "Arauco", "Cañete", "Contulmo", "Curanilahue", "Los Álamos", "Tirúa", "Los Ángeles", "Antuco", "Cabrero", "Laja", "Mulchén", "Nacimiento", "Negrete", "Quilaco", "Quilleco", "San Rosendo", "Santa Bárbara", "Tucapel", "Yumbel", "Alto Biobío"],
  "La Araucanía": ["Temuco", "Carahue", "Cunco", "Curarrehue", "Freire", "Galvarino", "Gorbea", "Lautaro", "Loncoche", "Melipeuco", "Nueva Imperial", "Padre Las Casas", "Perquenco", "Pitrufquén", "Pucón", "Saavedra", "Teodoro Schmidt", "Toltén", "Vilcún", "Villarrica", "Cholchol", "Angol", "Collipulli", "Ercilla", "Lonquimay", "Los Sauces", "Lumaco", "Purén", "Renaico", "Traiguén", "Victoria"],
  "Los Ríos": ["Valdivia", "Corral", "Lanco", "Los Lagos", "Máfil", "Mariquina", "Paillaco", "Panguipulli", "La Unión", "Futrono", "Lago Ranco", "Río Bueno"],
  "Los Lagos": ["Puerto Montt", "Calbuco", "Cochamó", "Fresia", "Frutillar", "Los Muermos", "Llanquihue", "Maullín", "Puerto Varas", "Castro", "Ancud", "Chonchi", "Curaco de Vélez", "Dalcahue", "Puqueldón", "Queilén", "Quemchi", "Quinchao", "Osorno", "Puerto Octay", "Purranque", "Puyehue", "Río Negro", "San Juan de la Costa", "San Pablo", "Chaitén", "Futaleufú", "Hualaihué", "Palena"],
  "Aysén": ["Coyhaique", "Lago Verde", "Aysén", "Cisnes", "Guaitecas", "Cochrane", "O'Higgins", "Tortel", "Chile Chico", "Río Ibáñez"],
  "Magallanes": ["Punta Arenas", "Laguna Blanca", "Río Verde", "San Gregorio", "Cabo de Hornos", "Antártica", "Porvenir", "Primavera", "Timaukel", "Natales", "Torres del Paine"],
};

/*
 * El catálogo de rubros vive en src/data/categories.js (RUBROS_LABELS),
 * compartido con Solicitar.jsx, para que cualquier rubro que un cliente
 * pueda pedir también sea un rubro en el que un profesional se pueda
 * registrar. Antes esta lista era más corta y no incluía Belleza, Arte,
 * Bienestar, etc., dejando fuera profesionales que Solicitar.jsx sí
 * permitía contratar.
 */

const TOTAL_STEPS = 3;

const STEP_INFO = {
  1: {
    title: "Identidad",
    text: "Tu RUT será validado para garantizar la seguridad de la plataforma. Solo profesionales verificados pueden operar.",
    icon: "🪪",
  },
  2: {
    title: "Perfil Pro",
    text: "Dinos tu especialidad y zona de trabajo. Así te conectamos con clientes cercanos a ti.",
    icon: "📍",
  },
  3: {
    title: "Acceso Seguro",
    text: "Crea una contraseña robusta. Nunca la compartas con nadie, ni con el equipo de soporte.",
    icon: "🛡️",
  },
};

/* ─────────────────────────────────────────────
   UTILIDADES DE VALIDACIÓN
───────────────────────────────────────────── */
const validarRut = (rut) => {
  const clean = rut.replace(/[^0-9kK]/g, "");
  if (clean.length < 8 || clean.length > 9) return false;
  const cuerpo = clean.slice(0, -1);
  const dv = clean.slice(-1).toLowerCase();
  let suma = 0, multiplo = 2;
  for (let i = 1; i <= cuerpo.length; i++) {
    suma += multiplo * Number(cuerpo.charAt(cuerpo.length - i));
    multiplo = multiplo < 7 ? multiplo + 1 : 2;
  }
  const dvEsperado = ((11 - (suma % 11)) === 11 ? "0" : (11 - (suma % 11)) === 10 ? "k" : String(11 - (suma % 11)));
  return dv === dvEsperado;
};

const validateAge = (birthDate) => {
  if (!birthDate) return false;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 18 && age <= 80;
};

const calculatePasswordStrength = (pass) => {
  if (!pass) return 0;
  let score = 0;
  if (pass.length >= 6)  score += 20;
  if (pass.length >= 10) score += 20;
  if (/\d/.test(pass))              score += 20;
  if (/[A-Z]/.test(pass))           score += 20;
  if (/[^A-Za-z0-9]/.test(pass))    score += 20;
  return score;
};

const strengthLabel = (score) => {
  if (score <= 20) return { text: "Muy débil", color: "bg-red-500" };
  if (score <= 40) return { text: "Débil",     color: "bg-orange-400" };
  if (score <= 60) return { text: "Regular",   color: "bg-amber-400" };
  if (score <= 80) return { text: "Buena",     color: "bg-blue-500" };
  return              { text: "Fuerte",     color: "bg-emerald-500" };
};

/* Sanitiza texto libre para evitar inyección de HTML básica */
const sanitizeText = (val) => val.replace(/[<>]/g, "");

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function RegisterProfesionalWizard() {
  const navigate = useNavigate();
  const { register: registerUser } = useUser();

  const [step,             setStep]             = useState(1);
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState("");
  const [showPassword,     setShowPassword]     = useState(false);
  const [showConfirmPass,  setShowConfirmPass]  = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [termsAccepted,    setTermsAccepted]    = useState(false);

  const [rutError,      setRutError]      = useState("");
  const [emailError,    setEmailError]    = useState("");
  const [phoneError,    setPhoneError]    = useState("");
  const [isValidating,  setIsValidating]  = useState({ rut: false, email: false });

  const [form, setForm] = useState({
    name: "", rut: "", email: "", phone: "",
    birthDate: "", region: "", comuna: "",
    rubro: "", password: "", confirmPassword: "",
    role: "profesional",
  });

  const pwStrength = calculatePasswordStrength(form.password);
  const pwLabel    = strengthLabel(pwStrength);

  /* ─── VALIDACIÓN ÚNICA RUT ─── */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (form.rut.length >= 8) {
        if (!validarRut(form.rut)) {
          setRutError("RUT inválido. Verifica el dígito verificador.");
        } else {
          setIsValidating((p) => ({ ...p, rut: true }));
          const q = query(collection(db, "users"), where("profile.rut", "==", form.rut), limit(1));
          getDocs(q)
            .then((snap) => setRutError(snap.empty ? "" : "Este RUT ya está registrado en la plataforma."))
            .catch(() => setRutError(""))
            .finally(() => setIsValidating((p) => ({ ...p, rut: false })));
        }
      } else {
        setRutError("");
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [form.rut]);

  /* ─── VALIDACIÓN ÚNICA EMAIL ─── */
  useEffect(() => {
    const timer = setTimeout(() => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (form.email && emailRegex.test(form.email)) {
        setIsValidating((p) => ({ ...p, email: true }));
        const q = query(collection(db, "users"), where("email", "==", form.email.toLowerCase()), limit(1));
        getDocs(q)
          .then((snap) => setEmailError(snap.empty ? "" : "Este email ya tiene una cuenta asociada."))
          .catch(() => setEmailError(""))
          .finally(() => setIsValidating((p) => ({ ...p, email: false })));
      } else if (form.email && !emailRegex.test(form.email)) {
        setEmailError("Formato de email inválido.");
      } else {
        setEmailError("");
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [form.email]);

  /* ─── MANEJO DE CAMBIOS ─── */
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "phone") {
      const digits = value.replace(/\D/g, "").slice(0, 8);
      setPhoneError(digits.length > 0 && digits.length < 8 ? "Ingresa los 8 dígitos." : "");
      return setForm((f) => ({ ...f, phone: digits }));
    }
    if (name === "rut") {
      setRutError("");
      return setForm((f) => ({ ...f, rut: value.replace(/[^0-9kK]/g, "").toUpperCase().slice(0, 9) }));
    }
    if (name === "email") {
      setEmailError("");
      return setForm((f) => ({ ...f, email: value.trim().toLowerCase() }));
    }
    if (name === "region") {
      return setForm((f) => ({ ...f, region: value, comuna: "" }));
    }
    if (name === "name") {
      return setForm((f) => ({ ...f, name: sanitizeText(value) }));
    }
    setForm((f) => ({ ...f, [name]: value }));
  };

  /* ─── VALIDACIÓN POR PASO ─── */
  const validateCurrentStep = useCallback(() => {
    setError("");
    const { name, rut, email, phone, birthDate, region, comuna, rubro, password, confirmPassword } = form;

    if (step === 1) {
      const parts = name.trim().split(/\s+/);
      if (parts.length < 2 || parts.some((p) => p.length < 2))
        return setError("Ingresa tu nombre completo (nombre y apellido)."), false;
      if (!validarRut(rut) || rutError)
        return setError(rutError || "El RUT ingresado no es válido."), false;
      if (isValidating.rut)
        return setError("Espera mientras validamos tu RUT."), false;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email) || emailError)
        return setError(emailError || "Ingresa un email válido."), false;
      if (isValidating.email)
        return setError("Espera mientras validamos tu email."), false;
      if (phone.length !== 8 || phoneError)
        return setError("El número de WhatsApp debe tener 8 dígitos."), false;
      if (!birthDate)
        return setError("La fecha de nacimiento es obligatoria."), false;
      if (!validateAge(birthDate))
        return setError("Debes tener entre 18 y 80 años para registrarte como profesional."), false;
    }

    if (step === 2) {
      if (!region) return setError("Selecciona tu región de trabajo."), false;
      if (!comuna)  return setError("Selecciona tu comuna de trabajo."), false;
      if (!rubro)   return setError("Selecciona tu especialidad principal."), false;
    }

    if (step === 3) {
      if (!termsAccepted)
        return setError("Debes aceptar los Términos y Condiciones para continuar."), false;
      if (password.length < 8)
        return setError("La contraseña debe tener al menos 8 caracteres."), false;
      if (pwStrength < 40)
        return setError("La contraseña es muy débil. Agrega números, mayúsculas o símbolos."), false;
      if (password !== confirmPassword)
        return setError("Las contraseñas no coinciden. Verifica e intenta de nuevo."), false;
    }

    return true;
  }, [form, step, rutError, emailError, phoneError, isValidating, termsAccepted, pwStrength]);

  const nextStep = () => { if (validateCurrentStep()) setStep((s) => s + 1); };
  const prevStep = () => { setError(""); setStep((s) => s - 1); };

  /* ─── ENVÍO FINAL ─── */
  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!validateCurrentStep()) return;
    if (rutError || emailError) {
      setError("Corrige los errores antes de continuar.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const proData = {
        name:     form.name.trim(),
        rut:      form.rut.toUpperCase(),
        phone:    "+569" + form.phone,
        birthDate:form.birthDate,
        region:   form.region,
        comuna:   form.comuna,
        rubro:    form.rubro,
        // "rubros" es la lista real de especialidades del profesional.
        // Al registrarse solo pide una (la principal); las demás se agregan
        // después desde el Perfil, una vez que ya conoce la plataforma.
        rubros:   [form.rubro],
        createdAt: Date.now(),
        registeredFrom: "web",

        /* Verificación de identidad */
        isIdentityVerified: false,
        identityReviewStatus: "pending", // pending | approved | rejected

        /* Motor de calidad */
        ratingStats: {
          totalStars:   0,
          totalReviews: 0,
          tags:         {},
        },

        /* Motor de seguridad */
        reputationPoints: 0,
        isBlocked:        false,
        cancelCount:      0,
        penaltyUntil:     null,
        pinAttempts:      0,

        /* Sistema de créditos */
        credits: {
          balance:    10, // bienvenida
          totalSpent: 0,
        },

        /* Control de actividad */
        lastActiveAt: Date.now(),
        termsAcceptedAt: Date.now(),
        termsVersion: "1.0",
      };

      await registerUser(form.email.toLowerCase(), form.password, "profesional", proData);
      setShowSuccessModal(true);
    } catch (err) {
      /* Mensajes de error específicos de Firebase Auth */
      const code = err.code || "";
      if (code === "auth/email-already-in-use")
        setError("Este email ya tiene una cuenta registrada. Intenta iniciar sesión.");
      else if (code === "auth/weak-password")
        setError("La contraseña es demasiado débil. Elige una más segura.");
      else if (code === "auth/network-request-failed")
        setError("Sin conexión a internet. Verifica tu red e intenta nuevamente.");
      else
        setError("Ocurrió un error al crear la cuenta. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] flex items-center justify-center p-6 font-sans transition-colors duration-500 overflow-x-hidden text-left">

      {/* MODAL ÉXITO */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md p-6 animate-fade-in">
          <div className="bg-white dark:bg-black max-w-sm w-full p-12 rounded-[3.5rem] text-center shadow-2xl border dark:border-zinc-800 animate-bounce-in">
            <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/30 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">🎉</div>
            <h2 className="text-2xl font-black dark:text-white uppercase tracking-tighter mb-3 leading-none italic">¡Bienvenido Pro!</h2>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-2 font-black uppercase tracking-widest italic">Tu cuenta fue creada con éxito.</p>
            <p className="text-[9px] text-zinc-400 mb-10 leading-relaxed">
              Tu perfil está en revisión. Recibirás una notificación cuando sea verificado y puedas comenzar a trabajar.
            </p>
            <button onClick={() => navigate("/login")} className="btn-primary w-full py-6 italic">
              Ir al inicio de sesión
            </button>
          </div>
        </div>
      )}

      <div className={`w-full max-w-lg flex flex-col relative transition-all duration-300 ${showSuccessModal ? "opacity-0 scale-95 pointer-events-none" : ""}`}>

        {/* HEADER */}
        <div className="mb-10 flex justify-between items-end border-b border-[var(--border-light)] dark:border-[var(--border-dark)] pb-6">
          <div className="text-left">
            <h1 className="text-3xl font-black dark:text-white tracking-tighter uppercase leading-none italic">
              Registro <span className="text-zinc-400 italic">Pro</span>
            </h1>
            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-2 italic">
              Paso {step} de {TOTAL_STEPS} — {STEP_INFO[step].title}
            </p>
          </div>
          <button
            onClick={() => navigate("/")}
            className="text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-black dark:hover:text-white transition-all"
          >
            Cancelar
          </button>
        </div>

        {/* BARRA DE PROGRESO */}
        <div className="w-full h-[3px] bg-zinc-100 dark:bg-zinc-800 mb-10 rounded-full overflow-hidden">
          <div
            className="h-full bg-black dark:bg-white transition-all duration-700 rounded-full"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* ICONO + DESCRIPCIÓN DEL PASO */}
        <div className="flex items-start gap-4 mb-8">
          <span className="text-3xl opacity-40 italic shrink-0">{STEP_INFO[step].icon}</span>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight leading-relaxed">
            {STEP_INFO[step].text}
          </p>
        </div>

        {/* ERROR GLOBAL */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 rounded-2xl border-l-4 border-red-500 animate-shake">
            <p className="text-[9px] font-black uppercase text-red-600 dark:text-red-400 tracking-widest leading-relaxed">
              ⚠️ {error}
            </p>
          </div>
        )}

        {/* ── FORMULARIOS POR PASO ── */}
        <form onSubmit={(e) => e.preventDefault()} className="space-y-6 flex-1">

          {/* PASO 1: IDENTIDAD */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FieldGroup label="Nombre Completo" hint="Nombre y apellido real">
                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    className="input-base"
                    placeholder="Juan Pérez"
                    autoFocus
                    autoComplete="name"
                    maxLength={60}
                  />
                </FieldGroup>

                <FieldGroup label="RUT" loading={isValidating.rut} error={rutError}>
                  <input
                    name="rut"
                    value={form.rut}
                    onChange={handleChange}
                    className={`input-base uppercase ${rutError ? "border-red-300 dark:border-red-700" : ""}`}
                    placeholder="12345678K"
                    maxLength={9}
                    autoComplete="off"
                  />
                </FieldGroup>
              </div>

              <FieldGroup label="Email Profesional" loading={isValidating.email} error={emailError}>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className={`input-base ${emailError ? "border-red-300 dark:border-red-700" : ""}`}
                  placeholder="pro@ejemplo.com"
                  autoComplete="email"
                  inputMode="email"
                />
              </FieldGroup>

              <div className="grid grid-cols-2 gap-6">
                <FieldGroup label="WhatsApp" hint="8 dígitos sin el 9" error={phoneError}>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 font-black text-[10px] tracking-widest select-none">
                      +569
                    </span>
                    <input
                      type="tel"
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      className={`input-base !pl-16 ${phoneError ? "border-red-300 dark:border-red-700" : ""}`}
                      placeholder="12345678"
                      maxLength={8}
                      inputMode="numeric"
                      autoComplete="tel"
                    />
                  </div>
                </FieldGroup>

                <FieldGroup label="Fecha de Nacimiento" hint="Debes ser mayor de 18">
                  <input
                    type="date"
                    name="birthDate"
                    value={form.birthDate}
                    onChange={handleChange}
                    className="input-base date-input-pro"
                    max={new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().split("T")[0]}
                    min={new Date(Date.now() - 80 * 365.25 * 24 * 3600 * 1000).toISOString().split("T")[0]}
                  />
                </FieldGroup>
              </div>
            </div>
          )}

          {/* PASO 2: PERFIL PRO */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in-up">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FieldGroup label="Región de Trabajo">
                  <div className="relative">
                    <select
                      name="region"
                      value={form.region}
                      onChange={handleChange}
                      className="input-base appearance-none pr-10"
                    >
                      <option value="">Seleccionar región...</option>
                      {Object.keys(COMUNAS_POR_REGION).map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none text-xs">▾</span>
                  </div>
                </FieldGroup>

                <FieldGroup label="Comuna de Trabajo">
                  <div className="relative">
                    <select
                      name="comuna"
                      value={form.comuna}
                      onChange={handleChange}
                      disabled={!form.region}
                      className="input-base appearance-none pr-10 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <option value="">
                        {form.region ? "Seleccionar..." : "Primero elige región"}
                      </option>
                      {form.region && COMUNAS_POR_REGION[form.region].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none text-xs">▾</span>
                  </div>
                </FieldGroup>
              </div>

              <FieldGroup label="Especialidad Principal">
                <div className="relative">
                  <select
                    name="rubro"
                    value={form.rubro}
                    onChange={handleChange}
                    className="input-base appearance-none pr-10"
                  >
                    <option value="">¿Cuál es tu especialidad?</option>
                    {RUBROS_LABELS.slice().sort().map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <span className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none text-xs">▾</span>
                </div>
              </FieldGroup>

              {/* Aviso de verificación */}
              <div className="p-5 bg-amber-50 dark:bg-amber-950/20 rounded-[2rem] border border-amber-100 dark:border-amber-800/30 text-left">
                <p className="text-[8px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-widest mb-2">
                  🔍 Revisión de identidad
                </p>
                <p className="text-[9px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  Tu perfil será revisado por nuestro equipo antes de aparecer como disponible para los clientes.
                  Este proceso puede tomar hasta 48 horas hábiles.
                </p>
              </div>
            </div>
          )}

          {/* PASO 3: CONTRASEÑA + TÉRMINOS */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in-up">
              <FieldGroup label="Contraseña" hint="Mínimo 8 caracteres con números y mayúsculas">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    className="input-base pr-14"
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-xl"
                    aria-label="Mostrar contraseña"
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>
                {form.password.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="h-[3px] w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${pwLabel.color}`}
                        style={{ width: `${pwStrength}%` }}
                      />
                    </div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-zinc-400 text-right">
                      {pwLabel.text}
                    </p>
                  </div>
                )}
              </FieldGroup>

              <FieldGroup label="Repetir Contraseña">
                <div className="relative">
                  <input
                    type={showConfirmPass ? "text" : "password"}
                    name="confirmPassword"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    className={`input-base pr-14 ${
                      form.confirmPassword && form.password !== form.confirmPassword
                        ? "border-red-300 dark:border-red-700"
                        : form.confirmPassword && form.password === form.confirmPassword
                        ? "border-emerald-400 dark:border-emerald-600"
                        : ""
                    }`}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass((v) => !v)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-xl"
                    aria-label="Mostrar confirmación"
                  >
                    {showConfirmPass ? "🙈" : "👁️"}
                  </button>
                </div>
                {form.confirmPassword && form.password !== form.confirmPassword && (
                  <p className="text-[8px] font-black text-red-500 uppercase tracking-widest mt-1 ml-1">
                    Las contraseñas no coinciden
                  </p>
                )}
                {form.confirmPassword && form.password === form.confirmPassword && (
                  <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mt-1 ml-1">
                    ✓ Contraseñas coinciden
                  </p>
                )}
              </FieldGroup>

              {/* Términos y condiciones */}
              <button
                type="button"
                onClick={() => setTermsAccepted((v) => !v)}
                className={`w-full flex items-start gap-4 p-5 rounded-[2rem] border text-left transition-all active:scale-98 ${
                  termsAccepted
                    ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20"
                    : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30"
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center mt-0.5 transition-all ${
                  termsAccepted
                    ? "bg-emerald-500 border-emerald-500"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}>
                  {termsAccepted && <span className="text-white text-[10px] font-black leading-none">✓</span>}
                </div>
                <p className="text-[9px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-bold uppercase tracking-tight">
                  Acepto los{" "}
                  <span
                    className="underline text-black dark:text-white"
                    onClick={(e) => { e.stopPropagation(); window.open("/terminos", "_blank"); }}
                  >
                    Términos y Condiciones
                  </span>{" "}
                  y la{" "}
                  <span
                    className="underline text-black dark:text-white"
                    onClick={(e) => { e.stopPropagation(); window.open("/privacidad", "_blank"); }}
                  >
                    Política de Privacidad
                  </span>
                  . Entiendo que operar con datos falsos o conductas fraudulentas resulta en la suspensión permanente de mi cuenta.
                </p>
              </button>
            </div>
          )}
        </form>

        {/* ── NAVEGACIÓN ── */}
        <div className="mt-12 flex gap-4">
          {step > 1 && (
            <button
              type="button"
              onClick={prevStep}
              className="flex-1 py-6 text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-black dark:hover:text-white transition-all border border-transparent"
            >
              ← Atrás
            </button>
          )}
          <button
            type="button"
            onClick={step === TOTAL_STEPS ? handleSubmit : nextStep}
            disabled={loading || isValidating.rut || isValidating.email}
            className="btn-primary flex-[2] py-6 shadow-2xl italic disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading
              ? "Creando cuenta..."
              : isValidating.rut || isValidating.email
              ? "Validando..."
              : step === TOTAL_STEPS
              ? "Completar Registro"
              : "Continuar →"}
          </button>
        </div>

        {/* Link a login */}
        <p className="text-center mt-8 text-[9px] font-black uppercase tracking-widest text-zinc-300 dark:text-zinc-700">
          ¿Ya tienes cuenta?{" "}
          <button
            onClick={() => navigate("/login")}
            className="text-black dark:text-white underline"
          >
            Ingresar
          </button>
        </p>
      </div>

      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          25%      { transform: translateX(-5px); }
          75%      { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.35s ease-in-out; }
        @keyframes bounce-in {
          from { transform: scale(0.93); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
        .animate-bounce-in { animation: bounce-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-in { animation: fade-in 0.4s ease-out; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .date-input-pro::-webkit-calendar-picker-indicator {
          filter: invert(0.5); cursor: pointer;
        }
        .dark .date-input-pro { color-scheme: dark; }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FIELD GROUP REUTILIZABLE
───────────────────────────────────────────── */
function FieldGroup({ label, hint, children, error, loading }) {
  return (
    <div className="space-y-2 text-left">
      <div className="flex justify-between items-center px-1">
        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">{label}</label>
        <div className="flex items-center gap-2">
          {hint && <span className="text-[8px] text-zinc-300 dark:text-zinc-700 italic">{hint}</span>}
          {loading && (
            <div className="w-3 h-3 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>
      {children}
      {error && (
        <p className="text-[8px] font-black text-red-500 uppercase tracking-widest ml-1 animate-fade-in leading-relaxed">
          ⚠ {error}
        </p>
      )}
    </div>
  );
}