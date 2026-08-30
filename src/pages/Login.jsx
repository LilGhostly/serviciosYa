import { useState, useEffect, useRef, useId } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";

/* ─────────────────────────────────────────────
   CONFIGURACIÓN ANTI FUERZA BRUTA (CLIENT-SIDE)
   Esto es un DISUASIVO de UX, no una protección real:
   cualquiera puede saltárselo abriendo una ventana de
   incógnito o borrando sessionStorage. La protección
   real debe vivir en el servidor (Firebase App Check,
   reglas de Identity Platform, o un backend propio que
   limite intentos por IP/cuenta). Se mantiene igual,
   solo se documenta el límite real de esta capa.
───────────────────────────────────────────── */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const LOCKOUT_MS = LOCKOUT_MINUTES * 60 * 1000;
const STORAGE_KEY = "sy_login_attempts";

function getLoginAttempts() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { count: 0, lockedUntil: null };
    return JSON.parse(raw);
  } catch {
    return { count: 0, lockedUntil: null };
  }
}

function saveLoginAttempts(data) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function resetLoginAttempts() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

function isLockedOut() {
  const { lockedUntil } = getLoginAttempts();
  if (!lockedUntil) return false;
  return Date.now() < lockedUntil;
}

function getLockoutRemainingMinutes() {
  const { lockedUntil } = getLoginAttempts();
  if (!lockedUntil) return 0;
  return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 60000));
}

/* ─────────────────────────────────────────────
   ÍCONOS (SVG en vez de emoji: consistentes en
   todos los sistemas operativos y accesibles)
───────────────────────────────────────────── */
function IconEye({ open }) {
  return open ? (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconSpinner() {
  return (
    <svg className="w-4 h-4 animate-spin motion-reduce:animate-none" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function Login() {
  const { login } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const auth = getAuth();
  const emailRef = useRef(null);
  const modalRef = useRef(null);

  const redirectTo = new URLSearchParams(location.search).get("redirect") || null;

  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(isLockedOut());
  const [lockMinutes, setLockMinutes] = useState(getLockoutRemainingMinutes());
  const [attempts, setAttempts] = useState(getLoginAttempts().count);

  /* --- Modal recuperación --- */
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState({ type: "", text: "" });
  const [resetCooldown, setResetCooldown] = useState(0); // segundos hasta poder reenviar

  const emailId = useId();
  const passwordId = useId();
  const resetEmailId = useId();
  const errorId = useId();

  /* ─── Countdown de bloqueo ─── */
  useEffect(() => {
    if (!locked) return;
    const interval = setInterval(() => {
      if (!isLockedOut()) {
        setLocked(false);
        setLockMinutes(0);
        resetLoginAttempts();
        setAttempts(0);
        clearInterval(interval);
      } else {
        setLockMinutes(getLockoutRemainingMinutes());
      }
    }, 10000); // revisa cada 10s
    return () => clearInterval(interval);
  }, [locked]);

  /* ─── Countdown de reenvío de email ─── */
  useEffect(() => {
    if (resetCooldown <= 0) return;
    const t = setInterval(() => setResetCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resetCooldown]);

  /* ─── Focus al email al montar ─── */
  useEffect(() => {
    if (emailRef.current) emailRef.current.focus();
  }, []);

  /* ─── Modal: cerrar con Escape + bloquear scroll del fondo ─── */
  useEffect(() => {
    if (!showResetModal) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setShowResetModal(false);
        setResetMsg({ type: "", text: "" });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Foco inicial dentro del modal
    modalRef.current?.querySelector("input")?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [showResetModal]);

  const handleChange = (e) => {
    setError("");
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  /* ─── SUBMIT LOGIN ─── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    /* Validaciones básicas del lado cliente */
    if (!form.email.trim()) return setError("Ingresa tu email.");
    if (!form.password) return setError("Ingresa tu contraseña.");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim()))
      return setError("El formato del email no es válido.");

    /* Verificar bloqueo client-side */
    if (isLockedOut()) {
      setLocked(true);
      setLockMinutes(getLockoutRemainingMinutes());
      return setError(`Demasiados intentos fallidos. Espera ${getLockoutRemainingMinutes()} min o recupera tu contraseña.`);
    }

    try {
      setLoading(true);
      const role = await login(form.email.trim().toLowerCase(), form.password);

      /* Login exitoso: limpiar intentos */
      resetLoginAttempts();
      setAttempts(0);

      if (redirectTo) return navigate(redirectTo, { replace: true });
      if (role === "cliente") return navigate("/cliente/dashboard");
      if (role === "profesional") return navigate("/prof/dashboard");
      if (role === "admin") return navigate("/admin");
      navigate("/");
    } catch (err) {
      /* Registrar intento fallido */
      const current = getLoginAttempts();
      const newCount = (current.count || 0) + 1;
      const newData = newCount >= MAX_ATTEMPTS
        ? { count: newCount, lockedUntil: Date.now() + LOCKOUT_MS }
        : { count: newCount, lockedUntil: null };
      saveLoginAttempts(newData);
      setAttempts(newCount);

      if (newCount >= MAX_ATTEMPTS) {
        setLocked(true);
        setLockMinutes(LOCKOUT_MINUTES);
        setError(`Cuenta bloqueada por ${LOCKOUT_MINUTES} minutos por demasiados intentos. Usa "¿Olvidaste tu contraseña?" para recuperar acceso.`);
        return;
      }

      const remaining = MAX_ATTEMPTS - newCount;

      /* Mensajes de error específicos y sin revelar si el email existe */
      const code = err.code || "";
      if (code === "auth/invalid-email")
        setError("El formato del email no es válido.");
      else if (code === "auth/user-disabled")
        setError("Esta cuenta ha sido deshabilitada. Contacta al soporte.");
      else if (code === "auth/too-many-requests")
        setError("Demasiados intentos. Firebase ha bloqueado el acceso temporalmente. Recupera tu contraseña.");
      else if (
        code === "auth/user-not-found" ||
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        /* Mensaje genérico: no revelamos si el email existe o no */
        setError(
          remaining > 0
            ? `Credenciales incorrectas. Te quedan ${remaining} intento${remaining !== 1 ? "s" : ""} antes del bloqueo.`
            : "Credenciales incorrectas."
        );
      } else if (code === "auth/network-request-failed")
        setError("Sin conexión a internet. Verifica tu red.");
      else setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  /* ─── RECUPERAR CONTRASEÑA ─── */
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetMsg({ type: "", text: "" });

    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!cleanEmail)
      return setResetMsg({ type: "error", text: "Ingresa tu email." });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail))
      return setResetMsg({ type: "error", text: "Formato de email inválido." });

    if (resetCooldown > 0)
      return setResetMsg({ type: "error", text: `Espera ${resetCooldown}s antes de reenviar.` });

    const genericSuccess = {
      type: "success",
      text: "Si el email está registrado, recibirás un enlace en tu correo. Revisa también la bandeja de spam.",
    };

    try {
      setResetLoading(true);
      await sendPasswordResetEmail(auth, cleanEmail, {
        url: window.location.origin + "/login",
        handleCodeInApp: false,
      });
      /* Mensaje neutro: no confirmar si el email existe (evita enumeración) */
      setResetMsg(genericSuccess);
      setResetCooldown(60);
      /* Al pedir el reset, se levanta el bloqueo local: el usuario ya
         demostró que puede recibir el correo del dueño de la cuenta.
         Esto no otorga acceso por sí solo — solo el enlace del correo lo hace. */
      resetLoginAttempts();
      setAttempts(0);
      setLocked(false);
      setTimeout(() => {
        setShowResetModal(false);
        setResetMsg({ type: "", text: "" });
        setResetEmail("");
      }, 6000);
    } catch (err) {
      /* auth/user-not-found no debe revelar que el email no existe:
         se responde igual que un envío exitoso. Solo se distingue
         un problema real de red, que sí conviene mostrar. */
      if (err.code === "auth/network-request-failed") {
        setResetMsg({ type: "error", text: "Sin conexión a internet. Verifica tu red e intenta de nuevo." });
      } else {
        setResetMsg(genericSuccess);
        setResetCooldown(60);
      }
    } finally {
      setResetLoading(false);
    }
  };

  const closeResetModal = () => {
    setShowResetModal(false);
    setResetMsg({ type: "", text: "" });
  };

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] transition-colors duration-500 font-sans relative overflow-x-hidden">

      {/* Elemento de marca de fondo: un candado gigante y muy tenue,
          en línea con el watermark de seguridad usado en el home. */}
      <div
        className="absolute inset-0 z-0 pointer-events-none select-none flex items-center justify-center overflow-hidden opacity-[0.035] dark:opacity-[0.05]"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-[70vw] h-[70vw] max-w-[640px] max-h-[640px] text-black dark:text-white -rotate-6">
          <path d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V11a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm-3 8V6a3 3 0 016 0v3H9zm3 4a2 2 0 012 2c0 .74-.4 1.39-1 1.73V19a1 1 0 11-2 0v-2.27a2 2 0 011-3.73z" />
        </svg>
      </div>

      {/* BOTÓN REGRESAR */}
      <Link
        to="/"
        className="group absolute top-8 left-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 hover:text-black dark:hover:text-white transition-colors z-10 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black dark:focus-visible:outline-white"
      >
        <svg className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" />
        </svg>
        Inicio
      </Link>

      <div className="w-full max-w-sm animate-fade-in-up motion-reduce:animate-none relative z-0">

        {/* LOGO */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-black dark:bg-white flex items-center justify-center shadow-xl">
            <span className="text-white dark:text-black font-black text-3xl italic">S</span>
          </div>
          <h1 className="text-xl font-black mt-6 tracking-tighter text-black dark:text-white uppercase italic">
            ServiciosYa
          </h1>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 mt-2">
            Accede a tu cuenta
          </p>
        </div>

        {/* CARD PRINCIPAL */}
        <div className="bg-white dark:bg-black p-8 sm:p-10 rounded-[2.5rem] shadow-2xl dark:shadow-none border border-zinc-100 dark:border-zinc-800 relative overflow-hidden">

          {/* BANNER DE BLOQUEO */}
          {locked && (
            <div className="mb-8 p-5 bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-200 dark:border-red-800/30 text-center animate-fade-in motion-reduce:animate-none" role="alert">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <p className="text-[9px] font-black uppercase text-red-600 dark:text-red-400 tracking-widest leading-relaxed">
                Acceso bloqueado
              </p>
              <p className="text-[8px] text-red-500 mt-2 leading-relaxed">
                {lockMinutes > 0
                  ? `Espera ${lockMinutes} minuto${lockMinutes !== 1 ? "s" : ""} o recupera tu contraseña.`
                  : "Puedes intentarlo nuevamente."}
              </p>
              <button
                type="button"
                onClick={() => { setShowResetModal(true); setResetEmail(form.email); }}
                className="mt-4 text-[8px] font-black uppercase tracking-widest text-red-600 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-600"
              >
                Recuperar contraseña →
              </button>
            </div>
          )}

          {/* ERROR GENERAL */}
          <div id={errorId} aria-live="polite" className="contents">
            {error && !locked && (
              <div className="mb-8 p-4 bg-red-50 dark:bg-red-950/20 rounded-2xl animate-shake motion-reduce:animate-none border-l-4 border-red-500" role="alert">
                <p className="text-[9px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest leading-relaxed">
                  {error}
                </p>
              </div>
            )}
          </div>

          {/* INDICADOR DE INTENTOS */}
          {attempts > 0 && attempts < MAX_ATTEMPTS && !locked && (
            <div className="mb-6">
              <div className="flex justify-center gap-1.5" aria-hidden="true">
                {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 w-6 rounded-full transition-colors duration-300 ${
                      i < attempts ? "bg-red-400" : "bg-zinc-100 dark:bg-zinc-800"
                    }`}
                  />
                ))}
              </div>
              <p className="text-center text-[8px] font-bold uppercase tracking-widest text-zinc-400 mt-2">
                {attempts} de {MAX_ATTEMPTS} intentos usados
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate aria-describedby={error ? errorId : undefined}>

            {/* CAMPO EMAIL */}
            <div className="text-left">
              <label htmlFor={emailId} className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 ml-2 mb-2 block">
                Email
              </label>
              <input
                id={emailId}
                ref={emailRef}
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="tu@correo.com"
                autoComplete="username"
                inputMode="email"
                disabled={locked}
                aria-invalid={!!error && !locked}
                className="input-base disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>

            {/* CAMPO CONTRASEÑA */}
            <div className="text-left">
              <div className="flex justify-between items-center mb-2 px-1">
                <label htmlFor={passwordId} className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => { setShowResetModal(true); setResetEmail(form.email); }}
                  className="text-[8px] font-black uppercase tracking-widest text-zinc-400 hover:text-black dark:hover:text-white transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:focus-visible:outline-white"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <input
                  id={passwordId}
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={locked}
                  aria-invalid={!!error && !locked}
                  className="input-base pr-14 disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={locked}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-zinc-400 hover:text-black dark:hover:text-white transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:focus-visible:outline-white"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={showPassword}
                >
                  <IconEye open={showPassword} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || locked}
              className="btn-primary w-full py-5 mt-2 italic disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
            >
              {loading && <IconSpinner />}
              {loading ? "Verificando..." : locked ? "Cuenta bloqueada" : "Acceder"}
            </button>
          </form>

          {/* SECCIÓN REGISTRO */}
          <div className="mt-10">
            <div className="relative flex items-center justify-center mb-7">
              <div className="w-full border-t border-zinc-100 dark:border-zinc-800" />
              <span className="absolute bg-white dark:bg-black px-4 text-[8px] font-black text-zinc-300 dark:text-zinc-700 uppercase tracking-[0.3em]">
                Cuentas nuevas
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Link
                to="/registro"
                className="flex flex-col items-center p-5 rounded-3xl bg-zinc-50 dark:bg-white/5 border border-transparent hover:border-black dark:hover:border-white transition-all group active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:focus-visible:outline-white"
              >
                <span className="text-2xl mb-1" aria-hidden="true">🏠</span>
                <span className="text-[9px] font-black uppercase text-zinc-500 group-hover:text-black dark:group-hover:text-white transition-colors">
                  Cliente
                </span>
              </Link>
              <Link
                to="/registro-profesional"
                className="flex flex-col items-center p-5 rounded-3xl bg-zinc-50 dark:bg-white/5 border border-transparent hover:border-black dark:hover:border-white transition-all group active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:focus-visible:outline-white"
              >
                <span className="text-2xl mb-1" aria-hidden="true">🛠️</span>
                <span className="text-[9px] font-black uppercase text-zinc-500 group-hover:text-black dark:group-hover:text-white transition-colors">
                  Profesional
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* NOTA DE SEGURIDAD */}
        <p className="text-center mt-6 text-[8px] font-bold text-zinc-300 dark:text-zinc-700 leading-relaxed px-4">
          <span aria-hidden="true">🔒</span> Nunca compartas tu contraseña ni tu PIN de confirmación con nadie, incluyendo al equipo de soporte.
        </p>
      </div>

      {/* ─── MODAL RECUPERACIÓN DE CONTRASEÑA ─── */}
      {showResetModal && (
        <div
          className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-4 animate-fade-in motion-reduce:animate-none"
          onClick={closeResetModal}
          role="presentation"
        >
          <div
            ref={modalRef}
            className="bg-white dark:bg-black rounded-[2.5rem] sm:rounded-[3rem] p-8 sm:p-10 w-full max-w-sm shadow-2xl border dark:border-zinc-800 animate-slide-up motion-reduce:animate-none"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${resetEmailId}-title`}
          >
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-zinc-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-7 h-7 text-black dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M15 7a2 2 0 012 2m4 0a6 6 0 11-12 0 6 6 0 0112 0zM3 21l6.75-6.75" />
                </svg>
              </div>
              <h2 id={`${resetEmailId}-title`} className="text-2xl font-black uppercase tracking-tighter dark:text-white leading-none mb-3 italic">
                Recuperar acceso
              </h2>
              <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest leading-relaxed">
                Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
              </p>
            </div>

            {resetMsg.text && (
              <div
                role="status"
                aria-live="polite"
                className={`mb-6 p-5 rounded-2xl text-[9px] font-black uppercase tracking-widest text-center border leading-relaxed ${
                  resetMsg.type === "success"
                    ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400"
                    : "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-800/30 text-red-600 dark:text-red-400"
                }`}
              >
                {resetMsg.text}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-6" noValidate>
              <div className="text-left">
                <label htmlFor={resetEmailId} className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 ml-1 mb-2 block">
                  Email registrado
                </label>
                <input
                  id={resetEmailId}
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="input-base"
                  inputMode="email"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeResetModal}
                  className="flex-1 py-4 text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-black dark:hover:text-white transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black dark:focus-visible:outline-white"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={resetLoading || resetCooldown > 0}
                  className="btn-primary flex-[2] py-4 italic disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {resetLoading && <IconSpinner />}
                  {resetLoading
                    ? "Enviando..."
                    : resetCooldown > 0
                    ? `Reenviar en ${resetCooldown}s`
                    : "Enviar enlace"}
                </button>
              </div>
            </form>

            <p className="text-center mt-6 text-[8px] text-zinc-300 dark:text-zinc-700 leading-relaxed">
              Revisa también tu carpeta de spam o correo no deseado.
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

        @keyframes shake {
          0%,100% { transform: translateX(0); }
          25%      { transform: translateX(-5px); }
          75%      { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.35s ease-in-out; }

        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1); }

        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.4s ease-out; }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in-up, .animate-shake, .animate-slide-up, .animate-fade-in {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}