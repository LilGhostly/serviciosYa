import { useState, useEffect, useRef, useMemo } from "react";
import Webcam from "react-webcam";
import { createWorker } from "tesseract.js";
import { useUser } from "../context/UserContext";
import { getAuth, sendEmailVerification, signOut } from "firebase/auth";
import {
  doc, updateDoc, increment, onSnapshot,
  getDoc, runTransaction, collection,
  serverTimestamp, query, where, limit,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { compressImageToDataUrl } from "../lib/imageCompression";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell, Wallet, Pencil, ShieldCheck, Shield, FileText, HelpCircle,
  BarChart3, History, Mail, LogOut, X, Check, Camera, RotateCcw,
  ChevronRight, AlertTriangle, Loader2, Gem, User, ScanLine, RefreshCw,
  Briefcase, Plus,
} from "lucide-react";
import { RUBROS } from "../data/categories";

/* ─────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────── */
const MAX_NAME_LEN  = 60;
const MAX_BIO_LEN   = 300;
/* Tope de especialidades simultáneas: mantiene el perfil enfocado y
   además sirve de "gancho" natural para un futuro modelo de pago (ver
   docs/INNOVACION.md — sección Multi-rubro) sin tener que rediseñar nada
   si más adelante se decide cobrar por especialidades extra. */
const MAX_RUBROS    = 4;

/* Campos que cuentan para el medidor de perfil.
   Identidad verificada pesa más porque es lo que más confianza genera. */
function computeReadiness(form, isVerified, emailVerified) {
  const checks = [
    !!form.name,
    !!form.phone,
    !!form.bio,
    !!(form.rubro || form.rubros?.length),
    !!form.comuna,
    emailVerified,
  ];
  const filled = checks.filter(Boolean).length;
  const baseScore = (filled / checks.length) * 70;
  const idScore = isVerified ? 30 : 0;
  return Math.round(baseScore + idScore);
}

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function PerfilProfesional() {
  const { user }  = useUser();
  const auth      = getAuth();
  const webcamRef = useRef(null);
  const navigate  = useNavigate();

  /* ── UI ── */
  const [loading,           setLoading]           = useState(false);
  const [loadingEmail,      setLoadingEmail]      = useState(false);
  const [showEditModal,     setShowEditModal]     = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [editError,         setEditError]         = useState("");
  const [emailMsg,          setEmailMsg]          = useState({ type: "", text: "" });
  const [emailCooldown,     setEmailCooldown]     = useState(0);
  const [unreadCount,       setUnreadCount]       = useState(0);

  /* ── KYC ── */
  const [isVerified,    setIsVerified]    = useState(false);
  const [showKYC,       setShowKYC]       = useState(false);
  const [kycStep,       setKycStep]       = useState(1);
  const [isScanning,    setIsScanning]    = useState(false);
  const [scanStatus,    setScanStatus]    = useState("Alinea el carnet dentro del marco");
  const [scanAttempts,  setScanAttempts]  = useState(0);
  const [detectedSerie, setDetectedSerie] = useState("");
  const [kycError,      setKycError]      = useState("");
  const [kycProgress,   setKycProgress]   = useState(0);
  const [cameraDenied,  setCameraDenied]  = useState(false);

  /* ── Bono email ── */
  const [claimingBonus, setClaimingBonus] = useState(false);

  /* ── Datos ── */
  const [liveStats,  setLiveStats]  = useState({ totalStars: 0, totalReviews: 0 });
  const [liveCredits,setLiveCredits]= useState(0);
  const [perfilForm, setPerfilForm] = useState({
    name: "", phone: "", comuna: "", region: "",
    rut: "", rubros: [], experience: "1",
    bio: "", photoUrl: "", rubro: "",
  });

  /* ─── 1. Escucha Firestore ─── */
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setIsVerified(d.isIdentityVerified === true);
      setLiveStats(d.ratingStats || { totalStars: 0, totalReviews: 0 });

      const c = d.credits;
      setLiveCredits(typeof c === "object" ? (c.balance ?? 0) : (c ?? 0));

      const profile = d.profile || d;
      setPerfilForm({
        name:       profile.name        || d.name        || "",
        phone:      profile.phone       || d.phone       || "",
        comuna:     profile.comuna      || d.comuna      || "",
        region:     profile.region      || d.region      || "",
        rut:        profile.rut         || d.rut         || "",
        rubros:     Array.isArray(profile.rubros) ? profile.rubros : [],
        rubro:      profile.rubro       || d.rubro       || "",
        experience: profile.experience  || "1",
        bio:        profile.bio         || "",
        photoUrl:   profile.photoUrl    || "",
      });
    });
    return () => unsub();
  }, [user?.uid]);

  /* ─── 2. Escucha notificaciones no leídas ─── */
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      where("read", "==", false),
      limit(10)
    );
    return onSnapshot(q, (snap) => setUnreadCount(snap.size));
  }, [user?.uid]);

  /* ─── 3. Bono de verificación de email ─── */
  useEffect(() => {
    if (!user?.uid) return;
    const interval = setInterval(async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      try {
        await currentUser.reload();
        if (!currentUser.emailVerified) return;

        const userRef  = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return;

        const data = userSnap.data();
        if (data.verificationBonusClaimed === true) {
          clearInterval(interval);
          return;
        }

        const txRef = doc(collection(db, "transactions"));
        await runTransaction(db, async (tx) => {
          const fresh = await tx.get(userRef);
          if (fresh.data()?.verificationBonusClaimed === true) return;
          tx.update(userRef, {
            verificationBonusClaimed:  true,
            emailVerified:             true,
            "credits.balance":         increment(5),
            "credits.totalEarned":     increment(5),
          });
          tx.set(txRef, {
            userId:      user.uid,
            amount:      5,
            type:        "bonus",
            description: "Bono: Email verificado",
            createdAt:   serverTimestamp(),
            status:      "completed",
          });
        });

        setClaimingBonus(true);
        clearInterval(interval);
        setTimeout(() => setClaimingBonus(false), 3800);
      } catch (err) {
        console.error("Error bono email:", err);
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [user?.uid, auth]);

  /* ─── 4. KYC — scan continuo ─── */
  useEffect(() => {
    let interval;
    if (isScanning && (kycStep === 2 || kycStep === 4)) {
      interval = setInterval(performSecurityScan, 2500);
    }
    return () => clearInterval(interval);
  }, [isScanning, kycStep]);

  /* ─── 5. Cooldown de reenvío de email ─── */
  useEffect(() => {
    if (emailCooldown <= 0) return;
    const t = setInterval(() => setEmailCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [emailCooldown]);

  /* ── KYC: escaneo OCR ── */
  const performSecurityScan = async () => {
    if (!webcamRef.current) return;
    const imgSrc = webcamRef.current.getScreenshot({ width: 800, height: 600 });
    if (!imgSrc) return;

    try {
      const worker = await createWorker("spa");
      const { data: { text } } = await worker.recognize(imgSrc);
      await worker.terminate();

      const onlyDigits = text.replace(/\D/g, "");

      if (kycStep === 2) {
        const rutDigits = String(perfilForm.rut).replace(/\D/g, "");
        if (!rutDigits || onlyDigits.includes(rutDigits)) {
          const serieMatch = onlyDigits.match(/(\d{9})/);
          if (serieMatch) setDetectedSerie(serieMatch[0]);
          setIsScanning(false);
          setScanStatus("¡Frente capturado!");
          setTimeout(() => setKycStep(3), 600);
        } else {
          setScanAttempts((a) => a + 1);
        }
      } else if (kycStep === 4) {
        if (detectedSerie && onlyDigits.includes(detectedSerie)) {
          setIsScanning(false);
          setScanStatus("¡Reverso validado!");
          setTimeout(() => setKycStep(5), 600);
        } else {
          setScanAttempts((a) => a + 1);
        }
      }
    } catch (err) {
      console.error("OCR error:", err);
    }
  };

  /* ── KYC: captura manual (respaldo si el escaneo automático no reconoce el documento) ── */
  const handleManualCapture = () => {
    setIsScanning(false);
    if (kycStep === 2) {
      setScanStatus("Frente registrado manualmente");
      setTimeout(() => setKycStep(3), 400);
    } else if (kycStep === 4) {
      setScanStatus("Reverso registrado manualmente");
      setTimeout(() => setKycStep(5), 400);
    }
  };

  const startStep = (step, label) => {
    setKycStep(step);
    setIsScanning(true);
    setScanAttempts(0);
    setScanStatus(label);
  };

  /* ── KYC: selfie ── */
  const handleSelfieCapture = async () => {
    const imgSrc = webcamRef.current?.getScreenshot();
    if (!imgSrc) { setKycError("No se pudo capturar la imagen. Intenta nuevamente."); setKycStep(6); return; }
    setKycStep(7);
    setKycProgress(0);

    const interval = setInterval(() => {
      setKycProgress((p) => {
        if (p >= 100) { clearInterval(interval); return 100; }
        return p + 10;
      });
    }, 200);

    try {
      await finishVerification(imgSrc);
    } finally {
      clearInterval(interval);
    }
  };

  const finishVerification = async (imgSrc) => {
    try {
      // La foto de verificación se comprime y se guarda como Base64 en el
      // propio documento de Firestore (en vez de Storage), pero a la Cloud
      // Function le seguimos mandando la imagen sin comprimir tanto, para
      // no perder precisión en la validación de identidad.
      const dataUrl = await compressImageToDataUrl(imgSrc, {
        maxDimension: 700,
        maxBytes: 300 * 1024,
      });

      // La identidad NO se marca como verificada desde el cliente: se
      // envía la selfie a la Cloud Function `validateIdentityIA`, que es
      // la única con permiso para escribir `isIdentityVerified` en
      // Firestore (ver firestore.rules → PROTECTED_USER_FIELDS). Esto
      // evita que cualquiera pueda autodeclararse verificado sin pasar
      // por la validación real (en producción) o simulada (en modo demo).
      const rut = user?.profile?.rut;
      if (!rut) {
        throw new Error("No se encontró tu RUT en el perfil para validar la identidad.");
      }

      const validateIdentity = httpsCallable(functions, "validateIdentityIA");
      const { data } = await validateIdentity({ imageBase64: imgSrc.split(",")[1] || imgSrc, expectedRut: rut });

      if (!data?.isValid) {
        setKycError(data?.message || "No pudimos verificar tu identidad con la foto enviada. Intenta nuevamente con mejor luz.");
        setKycStep(6);
        return;
      }

      await updateDoc(doc(db, "users", user.uid), { "profile.photoUrl": dataUrl });
      setIsVerified(true);
      setKycStep(8);
    } catch (err) {
      console.error("KYC error:", err);
      setKycError(err.message || "Error al finalizar la verificación. Intenta nuevamente.");
      setKycStep(6);
    }
  };

  /* ── Especialidades (multi-rubro) ──
     "rubro" se mantiene como especialidad principal (la que se pidió al
     registrarse); "rubros" es el array completo que usa el resto del
     sistema (feed de trabajos disponibles, perfil público, analíticas). */
  const toggleRubro = (label) => {
    setPerfilForm((f) => {
      const current = f.rubros?.length ? f.rubros : (f.rubro ? [f.rubro] : []);
      const isPrimary = label === f.rubro;
      if (current.includes(label)) {
        if (isPrimary) return f; // la especialidad principal no se puede quitar desde acá
        return { ...f, rubros: current.filter((r) => r !== label) };
      }
      if (current.length >= MAX_RUBROS) return f;
      return { ...f, rubros: [...current, label] };
    });
  };

  /* ── Guardar perfil ── */
  const handleSaveProfile = async () => {
    setEditError("");
    const name  = perfilForm.name.trim();
    const phone = perfilForm.phone.trim();
    const bio   = perfilForm.bio.trim();

    if (!name || name.split(/\s+/).length < 2)
      return setEditError("Ingresa tu nombre completo (nombre y apellido).");
    if (name.length > MAX_NAME_LEN)
      return setEditError(`El nombre no puede superar ${MAX_NAME_LEN} caracteres.`);
    if (bio.length > MAX_BIO_LEN)
      return setEditError(`La biografía no puede superar ${MAX_BIO_LEN} caracteres.`);

    const rubros = perfilForm.rubros?.length ? perfilForm.rubros : [perfilForm.rubro].filter(Boolean);

    try {
      setLoading(true);
      await updateDoc(doc(db, "users", user.uid), {
        "profile.name":       name,
        "profile.phone":      phone,
        "profile.experience": perfilForm.experience,
        "profile.bio":        bio,
        "profile.rubros":     rubros,
      });
      setShowEditModal(false);
    } catch {
      setEditError("Error al guardar. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Verificar email ── */
  const handleVerifyEmail = async () => {
    if (emailCooldown > 0) return;
    setLoadingEmail(true);
    setEmailMsg({ type: "", text: "" });
    try {
      await sendEmailVerification(auth.currentUser, {
        url: window.location.origin + "/login",
        handleCodeInApp: false,
      });
      setEmailMsg({ type: "success", text: "Te enviamos un correo. Revisa tu bandeja de entrada." });
      setEmailCooldown(60);
    } catch (err) {
      const code = err.code || "";
      if (code === "auth/too-many-requests")
        setEmailMsg({ type: "error", text: "Demasiados intentos. Espera unos minutos y vuelve a intentar." });
      else
        setEmailMsg({ type: "error", text: "No pudimos enviar el correo. Intenta más tarde." });
    } finally {
      setLoadingEmail(false);
    }
  };

  /* ── Cerrar sesión ── */
  const confirmLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (err) {
      console.error(err);
    }
  };

  /* Helpers */
  const avg = liveStats.totalReviews > 0
    ? (liveStats.totalStars / liveStats.totalReviews).toFixed(1)
    : null;
  const isEmailVerified = auth.currentUser?.emailVerified || false;
  const readiness = useMemo(
    () => computeReadiness(perfilForm, isVerified, isEmailVerified),
    [perfilForm, isVerified, isEmailVerified]
  );

  if (!user) return null;

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--paper)] dark:bg-[var(--paper-dark)] pb-28 font-body text-[var(--ink)] dark:text-[var(--ink-dark)] transition-colors duration-300">

      {/* BONO EMAIL */}
      {claimingBonus && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6" role="alert">
          <div className="bg-white dark:bg-[var(--card-dark)] p-8 rounded-3xl shadow-2xl animate-pop text-center w-full max-w-xs border border-black/5 dark:border-white/10">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[var(--brass-soft)] flex items-center justify-center">
              <Gem className="w-7 h-7 text-[var(--brass)]" strokeWidth={2} />
            </div>
            <h2 className="font-display text-xl font-bold mb-1">+5 créditos</h2>
            <p className="text-sm text-[var(--muted)] leading-snug">
              Por verificar tu correo electrónico.
            </p>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="px-5 pt-8 pb-6">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <ProfileGauge
              percent={readiness}
              verified={isVerified}
              photoUrl={perfilForm.photoUrl}
              initial={perfilForm.name?.charAt(0) || "P"}
            />
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold leading-tight truncate">
                {perfilForm.name || "Tu perfil"}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 text-[var(--muted)] text-sm">
                {avg ? (
                  <>
                    <span className="font-semibold text-[var(--ink)] dark:text-[var(--ink-dark)]">★ {avg}</span>
                    <span>·</span>
                    <span>{liveStats.totalReviews} reseña{liveStats.totalReviews !== 1 ? "s" : ""}</span>
                  </>
                ) : (
                  <span>Sin reseñas todavía</span>
                )}
              </div>
              {(perfilForm.rubros?.length || perfilForm.rubro) && (
                <p className="text-xs font-medium text-[var(--brand)] dark:text-[var(--brand-light)] mt-1 truncate">
                  {(perfilForm.rubros?.length ? perfilForm.rubros : [perfilForm.rubro]).join(" · ")}
                </p>
              )}
            </div>
          </div>

          <Link
            to="/notificaciones"
            className="relative shrink-0 w-11 h-11 rounded-2xl bg-white dark:bg-[var(--card-dark)] border border-black/5 dark:border-white/10 flex items-center justify-center shadow-sm active:scale-95 transition-transform"
            aria-label="Notificaciones"
          >
            <Bell className="w-5 h-5" strokeWidth={2} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[var(--danger)] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[var(--paper)] dark:border-[var(--paper-dark)]">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        </div>

        {/* Banner verificación */}
        {!isVerified && (
          <button
            onClick={() => { setShowKYC(true); setKycStep(1); setKycError(""); setCameraDenied(false); }}
            className="w-full mt-5 p-4 bg-[var(--brand)] rounded-2xl flex items-center gap-3 text-left active:scale-[0.98] transition-transform shadow-sm"
          >
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Shield className="w-4.5 h-4.5 text-white" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold leading-tight">Verifica tu identidad</p>
              <p className="text-white/70 text-xs mt-0.5 leading-snug">Genera más confianza y desbloquea tu perfil completo</p>
            </div>
            <ChevronRight className="w-4 h-4 text-white/60 shrink-0" />
          </button>
        )}
      </header>

      <main className="max-w-md mx-auto px-5 space-y-6">

        {/* ACCIONES RÁPIDAS */}
        <div className="grid grid-cols-3 gap-3">
          <QuickAction to="/prof/billetera" icon={Wallet} label="Billetera" trailing={`${liveCredits}`} />
          <QuickAction onClick={() => { setShowEditModal(true); setEditError(""); }} icon={Pencil} label="Editar perfil" />
          <QuickAction to="/analisis-rendimiento" icon={BarChart3} label="Estadísticas" />
        </div>

        {/* RENDIMIENTO */}
        <div className="bg-white dark:bg-[var(--card-dark)] rounded-3xl p-5 border border-black/5 dark:border-white/10">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Calificación</p>
            <span className="font-display text-lg font-bold">{avg ?? "—"} ★</span>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  avg && Number(avg) >= i ? "bg-[var(--brand)]" : "bg-black/5 dark:bg-white/10"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-[var(--muted)] mt-3">
            {liveStats.totalReviews} evaluación{liveStats.totalReviews !== 1 ? "es" : ""} de clientes
          </p>
        </div>

        {/* MENÚ */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] px-1">Mi cuenta</h3>
          <div className="bg-white dark:bg-[var(--card-dark)] rounded-3xl border border-black/5 dark:border-white/10 overflow-hidden">
            <MenuOption to="/historial-profesional" icon={History} text="Historial de servicios" />
            <MenuOption to="/analisis-rendimiento"  icon={BarChart3} text="Análisis y estadísticas" />
            <MenuOption to="/ayuda"                 icon={HelpCircle} text="Centro de ayuda" />
            <MenuOption to="/terminos"              icon={FileText} text="Legal y privacidad" last={isEmailVerified} />

            {!isEmailVerified && (
              <button
                onClick={handleVerifyEmail}
                disabled={loadingEmail || emailCooldown > 0}
                className="w-full flex items-center gap-3.5 p-4 hover:bg-[var(--brass-soft)] transition-colors disabled:opacity-50"
              >
                <span className="w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--brass-soft)] text-[var(--brass)] shrink-0">
                  {loadingEmail ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Mail className="w-4.5 h-4.5" />}
                </span>
                <span className="text-sm font-medium text-[var(--brass)] flex-1 text-left">
                  {loadingEmail
                    ? "Enviando…"
                    : emailCooldown > 0
                    ? `Reenviar en ${emailCooldown}s`
                    : "Verificar correo · +5 créditos"}
                </span>
                <ChevronRight className="w-4 h-4 text-[var(--brass)]/50" />
              </button>
            )}
          </div>

          {emailMsg.text && (
            <div
              role="status"
              className={`p-3.5 rounded-2xl text-sm font-medium leading-snug ${
                emailMsg.type === "success"
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "bg-red-50 dark:bg-red-950/30 text-[var(--danger)]"
              }`}
            >
              {emailMsg.text}
            </div>
          )}
        </section>

        {/* IDENTIDAD REGISTRADA */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Identidad registrada</h3>
            {!isVerified && <span className="text-xs text-[var(--muted)]">Sin verificar</span>}
          </div>
          <div className="bg-white dark:bg-[var(--card-dark)] rounded-3xl p-5 border border-black/5 dark:border-white/10 space-y-3.5">
            {[
              { label: "RUT",          value: perfilForm.rut, mono: true },
              { label: "Teléfono",     value: perfilForm.phone, mono: true },
              { label: "Especialidad", value: perfilForm.rubro || perfilForm.rubros?.join(", ") },
              { label: "Zona",         value: perfilForm.comuna ? `${perfilForm.comuna}, ${perfilForm.region}` : perfilForm.region },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex justify-between items-center gap-4">
                <span className="text-sm text-[var(--muted)]">{label}</span>
                <span className={`text-sm font-medium truncate max-w-[60%] text-right ${mono ? "font-mono" : ""}`}>
                  {value || "—"}
                </span>
              </div>
            ))}
            <p className="text-xs text-[var(--muted)] leading-snug pt-2 border-t border-black/5 dark:border-white/10">
              Estos datos quedan fijos una vez verificada tu identidad. Si necesitas corregir alguno, escribe al Centro de ayuda.
            </p>
          </div>
        </section>

        {/* CERRAR SESIÓN */}
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full py-3.5 flex items-center justify-center gap-2 text-[var(--danger)] font-medium text-sm rounded-2xl active:bg-red-50 dark:active:bg-red-950/20 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </main>

      {/* ══════════════════════════════════════
          MODAL EDICIÓN — bottom sheet
      ══════════════════════════════════════ */}
      {showEditModal && (
        <Sheet onClose={() => { setShowEditModal(false); setEditError(""); }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-lg font-bold">Editar perfil</h2>
            <button
              onClick={() => { setShowEditModal(false); setEditError(""); }}
              aria-label="Cerrar"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-5">
            {editError && (
              <div className="p-3.5 bg-red-50 dark:bg-red-950/30 rounded-2xl flex items-start gap-2.5 animate-shake">
                <AlertTriangle className="w-4 h-4 text-[var(--danger)] shrink-0 mt-0.5" />
                <p className="text-sm text-[var(--danger)] leading-snug">{editError}</p>
              </div>
            )}

            <EditField
              label="Nombre completo"
              hint={`${perfilForm.name.length}/${MAX_NAME_LEN}`}
              value={perfilForm.name}
              onChange={(v) => setPerfilForm((f) => ({ ...f, name: v }))}
              maxLength={MAX_NAME_LEN}
              placeholder="Juan Pérez"
            />
            <EditField
              label="Teléfono"
              value={perfilForm.phone}
              onChange={(v) => setPerfilForm((f) => ({ ...f, phone: v }))}
              type="tel"
              placeholder="+56 9 1234 5678"
            />

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-[var(--muted)]">Biografía</label>
                <span className={`text-xs ${perfilForm.bio.length > MAX_BIO_LEN * 0.9 ? "text-[var(--brass)]" : "text-[var(--muted)]"}`}>
                  {perfilForm.bio.length}/{MAX_BIO_LEN}
                </span>
              </div>
              <textarea
                value={perfilForm.bio}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_BIO_LEN)
                    setPerfilForm((f) => ({ ...f, bio: e.target.value }));
                }}
                rows={4}
                className="w-full rounded-2xl border border-black/10 dark:border-white/15 bg-[var(--paper)] dark:bg-[var(--paper-dark)] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent"
                placeholder="Cuenta tu experiencia y especialidades…"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-[var(--muted)] flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" /> Mis especialidades
                </label>
                <span className="text-xs text-[var(--muted)]">
                  {(perfilForm.rubros?.length || (perfilForm.rubro ? 1 : 0))}/{MAX_RUBROS}
                </span>
              </div>
              <p className="text-xs text-[var(--muted)] leading-relaxed -mt-1">
                Recibirás avisos de trabajos disponibles en cada rubro que agregues.
                Tu especialidad principal (<strong>{perfilForm.rubro}</strong>) no se puede quitar desde aquí.
              </p>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                {RUBROS.filter((r) => r.label !== "Otro").map((r) => {
                  const active    = (perfilForm.rubros?.length ? perfilForm.rubros : [perfilForm.rubro]).includes(r.label);
                  const isPrimary = r.label === perfilForm.rubro;
                  const disabled  = !active && (perfilForm.rubros?.length || 0) >= MAX_RUBROS;
                  return (
                    <button
                      key={r.label}
                      type="button"
                      onClick={() => toggleRubro(r.label)}
                      disabled={isPrimary || disabled}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                        active
                          ? "bg-[var(--brand)] border-transparent text-white"
                          : "bg-transparent border-black/10 dark:border-white/15 text-[var(--muted)]"
                      } ${(isPrimary || disabled) && !active ? "opacity-40 cursor-not-allowed" : "active:scale-95"}`}
                    >
                      {!active && <Plus className="w-3 h-3" />}
                      {r.label}
                      {isPrimary && <span className="text-[9px] opacity-70">· principal</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={loading}
            className="w-full mt-6 py-4 bg-[var(--brand)] text-white rounded-2xl font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Guardando…" : "Guardar cambios"}
          </button>
        </Sheet>
      )}

      {/* ══════════════════════════════════════
          KYC — VERIFICACIÓN DE IDENTIDAD
      ══════════════════════════════════════ */}
      {showKYC && (
        <div className="fixed inset-0 z-[400] bg-[var(--ink)] flex flex-col">
          <header className="p-5 flex items-center justify-between shrink-0">
            <button
              onClick={() => { setShowKYC(false); setIsScanning(false); setKycStep(1); setKycError(""); }}
              aria-label="Cerrar verificación"
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex gap-1.5">
              {[2, 3, 4, 5].map((step) => (
                <div
                  key={step}
                  className={`h-1 w-7 rounded-full transition-colors duration-500 ${
                    kycStep >= step ? "bg-[var(--brand-light)]" : "bg-white/15"
                  }`}
                />
              ))}
            </div>
            <div className="w-9" />
          </header>

          <main className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">

            {/* Paso 1: Bienvenida */}
            {kycStep === 1 && (
              <div className="animate-pop max-w-xs w-full">
                <div className="w-16 h-16 bg-[var(--brand)] rounded-3xl flex items-center justify-center mb-6 mx-auto">
                  <Shield className="w-8 h-8 text-white" strokeWidth={1.75} />
                </div>
                <h3 className="font-display text-2xl font-bold text-white mb-3">Verifiquemos tu identidad</h3>
                <p className="text-white/60 text-sm mb-8 leading-relaxed">
                  Vamos a escanear tu cédula de identidad chilena y tomar una selfie para confirmar que eres tú.
                  Toma menos de dos minutos.
                </p>
                <ul className="text-left text-white/50 text-xs space-y-2 mb-8">
                  <li className="flex gap-2"><Check className="w-4 h-4 text-[var(--brand-light)] shrink-0" /> Busca un lugar con buena luz</li>
                  <li className="flex gap-2"><Check className="w-4 h-4 text-[var(--brand-light)] shrink-0" /> Ten tu cédula a mano</li>
                  <li className="flex gap-2"><Check className="w-4 h-4 text-[var(--brand-light)] shrink-0" /> Da permiso de cámara cuando se te pida</li>
                </ul>
                <button
                  onClick={() => startStep(2, "Encuadra el frente de tu cédula")}
                  className="w-full py-4 bg-white text-[var(--ink)] rounded-2xl font-semibold text-sm active:scale-[0.98] transition-transform"
                >
                  Comenzar verificación
                </button>
              </div>
            )}

            {/* Pasos 2 y 4: Escaneo */}
            {(kycStep === 2 || kycStep === 4) && (
              <div className="w-full max-w-sm space-y-5 animate-pop">
                <h4 className="text-white font-semibold text-sm">
                  {kycStep === 2 ? "Frente de la cédula" : "Reverso de la cédula"}
                </h4>
                <div className="relative aspect-[1.58/1] rounded-3xl overflow-hidden border border-white/10 bg-black">
                  {cameraDenied ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                      <Camera className="w-8 h-8 text-white/30" />
                      <p className="text-white/50 text-xs leading-relaxed">
                        No pudimos acceder a tu cámara. Revisa los permisos del navegador y vuelve a intentar.
                      </p>
                    </div>
                  ) : (
                    <Webcam
                      audio={false}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      videoConstraints={{ facingMode: "environment" }}
                      onUserMediaError={() => setCameraDenied(true)}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 border-[16px] border-black/60 pointer-events-none rounded-3xl">
                    <div className="w-full h-full border-2 border-dashed border-[var(--brand-light)]/70 rounded-xl relative overflow-hidden">
                      {isScanning && (
                        <div className="absolute inset-x-0 h-0.5 bg-[var(--brand-light)] shadow-[0_0_10px_var(--brand-light)] animate-scan" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-[var(--brand-light)] text-sm font-medium">
                  {isScanning && <ScanLine className="w-4 h-4 animate-pulse" />}
                  {scanStatus}
                </div>

                <button
                  onClick={handleManualCapture}
                  className="w-full py-3.5 bg-white/10 text-white rounded-2xl font-medium text-sm active:scale-[0.98] transition-transform"
                >
                  Ya está alineado, continuar
                </button>
                {scanAttempts >= 3 && (
                  <p className="text-white/40 text-xs leading-relaxed">
                    ¿Cuesta que se reconozca? Acerca más la cédula al marco o mejora la iluminación, o presiona "continuar" para seguir manualmente.
                  </p>
                )}
              </div>
            )}

            {/* Paso 3: Transición */}
            {kycStep === 3 && (
              <div className="animate-pop text-center max-w-xs w-full">
                <div className="w-16 h-16 bg-[var(--brand)] rounded-full flex items-center justify-center mb-6 mx-auto">
                  <Check className="w-8 h-8 text-white" strokeWidth={2.5} />
                </div>
                <h3 className="font-display text-xl font-bold text-white mb-3">Frente registrado</h3>
                <p className="text-white/60 text-sm mb-8 leading-relaxed">
                  Ahora muestra el reverso de tu cédula a la cámara.
                </p>
                <button
                  onClick={() => startStep(4, "Encuadra el reverso de tu cédula")}
                  className="w-full py-4 bg-white text-[var(--ink)] rounded-2xl font-semibold text-sm active:scale-[0.98] transition-transform"
                >
                  Continuar con el reverso
                </button>
              </div>
            )}

            {/* Paso 5: Selfie */}
            {kycStep === 5 && (
              <div className="animate-pop max-w-sm w-full">
                <h4 className="text-white font-semibold text-sm mb-5">Selfie de verificación</h4>
                <div className="relative aspect-square rounded-3xl overflow-hidden border border-white/10 bg-black mb-5">
                  {cameraDenied ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                      <Camera className="w-8 h-8 text-white/30" />
                      <p className="text-white/50 text-xs leading-relaxed">No pudimos acceder a tu cámara frontal.</p>
                    </div>
                  ) : (
                    <Webcam
                      audio={false}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      videoConstraints={{ facingMode: "user" }}
                      onUserMediaError={() => setCameraDenied(true)}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-40 h-48 border-2 border-dashed border-white/40 rounded-full" />
                  </div>
                </div>
                <p className="text-white/50 text-xs mb-6 leading-relaxed">
                  Centra tu rostro dentro del óvalo, con buena luz frontal, y presiona el botón.
                </p>
                <button
                  onClick={handleSelfieCapture}
                  className="w-full py-4 bg-white text-[var(--ink)] rounded-2xl font-semibold text-sm active:scale-[0.98] transition-transform"
                >
                  Capturar selfie
                </button>
              </div>
            )}

            {/* Paso 6: Error */}
            {kycStep === 6 && (
              <div className="animate-pop text-center max-w-xs w-full">
                <div className="w-16 h-16 bg-red-500/15 rounded-full flex items-center justify-center mb-6 mx-auto">
                  <AlertTriangle className="w-7 h-7 text-red-400" />
                </div>
                <h3 className="font-display text-xl font-bold text-white mb-3">No pudimos verificarte</h3>
                <p className="text-white/60 text-sm mb-8 leading-relaxed">
                  {kycError || "Ocurrió un problema al completar la verificación."}
                </p>
                <button
                  onClick={() => { setKycStep(1); setKycError(""); setDetectedSerie(""); setScanAttempts(0); }}
                  className="w-full py-4 bg-white text-[var(--ink)] rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  <RotateCcw className="w-4 h-4" /> Intentar nuevamente
                </button>
              </div>
            )}

            {/* Paso 7: Procesando */}
            {kycStep === 7 && (
              <div className="animate-pop text-center max-w-xs w-full">
                <div className="relative w-16 h-16 mx-auto mb-8">
                  <div className="w-full h-full border-4 border-white/10 border-t-[var(--brand-light)] rounded-full animate-spin" />
                </div>
                <h3 className="font-display text-lg font-bold text-white mb-4">Verificando…</h3>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-[var(--brand-light)] transition-all duration-200 rounded-full"
                    style={{ width: `${kycProgress}%` }}
                  />
                </div>
                <p className="text-white/40 text-xs">{kycProgress}% completado</p>
              </div>
            )}

            {/* Paso 8: Éxito */}
            {kycStep === 8 && (
              <div className="animate-pop text-center max-w-xs w-full">
                <div className="w-20 h-20 bg-[var(--brand)] rounded-full flex items-center justify-center mb-8 mx-auto">
                  <Check className="w-9 h-9 text-white" strokeWidth={2.5} />
                </div>
                <h2 className="font-display text-2xl font-bold text-white mb-3">Identidad verificada</h2>
                <p className="text-white/60 text-sm mb-8 leading-relaxed">
                  Tu perfil ahora muestra el sello de verificación y es más visible para los clientes.
                </p>
                <button
                  onClick={() => setShowKYC(false)}
                  className="w-full py-4 bg-white text-[var(--ink)] rounded-2xl font-semibold text-sm active:scale-[0.98] transition-transform"
                >
                  Listo
                </button>
              </div>
            )}
          </main>
        </div>
      )}

      {/* MODAL CERRAR SESIÓN */}
      {showLogoutConfirm && (
        <Sheet onClose={() => setShowLogoutConfirm(false)} centered>
          <div className="text-center">
            <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <LogOut className="w-6 h-6 text-[var(--danger)]" />
            </div>
            <h3 className="font-display text-lg font-bold mb-2">¿Cerrar sesión?</h3>
            <p className="text-sm text-[var(--muted)] mb-7 leading-relaxed">
              Deberás iniciar sesión nuevamente para acceder a tu cuenta.
            </p>
            <button
              onClick={confirmLogout}
              className="w-full py-4 bg-[var(--danger)] text-white rounded-2xl font-semibold text-sm mb-2.5 active:scale-[0.98] transition-transform"
            >
              Cerrar sesión
            </button>
            <button
              onClick={() => setShowLogoutConfirm(false)}
              className="w-full py-3 text-sm font-medium text-[var(--muted)]"
            >
              Cancelar
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTES
───────────────────────────────────────────── */

/* Medidor circular de perfil — combina verificación + completitud */
function ProfileGauge({ percent, verified, photoUrl, initial }) {
  const r = 27;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;

  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="3" className="stroke-black/8 dark:stroke-white/10" />
        <circle
          cx="32" cy="32" r={r} fill="none" strokeWidth="3" strokeLinecap="round"
          stroke={verified ? "var(--brand)" : "var(--brass)"}
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-[5px] rounded-full overflow-hidden bg-white dark:bg-[var(--card-dark)] flex items-center justify-center">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="font-display font-bold text-lg text-[var(--ink)] dark:text-[var(--ink-dark)]">{initial}</span>
        )}
      </div>
      {verified && (
        <div className="absolute -bottom-0.5 -right-0.5 bg-[var(--brand)] text-white p-1 rounded-full border-2 border-[var(--paper)] dark:border-[var(--paper-dark)]">
          <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />
        </div>
      )}
    </div>
  );
}

function QuickAction({ to, onClick, icon: Icon, label, trailing }) {
  const inner = (
    <div className="flex flex-col items-center gap-2 py-4 px-2 bg-white dark:bg-[var(--card-dark)] rounded-2xl border border-black/5 dark:border-white/10 active:scale-95 transition-transform h-full">
      <div className="relative">
        <Icon className="w-5 h-5" strokeWidth={1.75} />
        {trailing != null && (
          <span className="absolute -top-1 -right-2.5 bg-[var(--ink)] dark:bg-[var(--ink-dark)] text-[var(--paper)] dark:text-[var(--paper-dark)] text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {trailing}
          </span>
        )}
      </div>
      <span className="text-[11px] font-medium text-[var(--muted)] text-center leading-tight">{label}</span>
    </div>
  );
  if (to) return <Link to={to} className="block h-full">{inner}</Link>;
  return <button onClick={onClick} className="w-full h-full text-left">{inner}</button>;
}

function MenuOption({ to, icon: Icon, text, onClick, last }) {
  const content = (
    <div className={`flex items-center gap-3.5 p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors ${last ? "" : "border-b border-black/5 dark:border-white/10"}`}>
      <span className="w-9 h-9 flex items-center justify-center rounded-xl bg-black/[0.03] dark:bg-white/[0.06] shrink-0">
        <Icon className="w-4.5 h-4.5" strokeWidth={1.75} />
      </span>
      <span className="text-sm font-medium flex-1">{text}</span>
      <ChevronRight className="w-4 h-4 text-[var(--muted)]" />
    </div>
  );
  if (to) return <Link to={to} className="block">{content}</Link>;
  return <button onClick={onClick} className="w-full text-left">{content}</button>;
}

function EditField({ label, hint, value, onChange, type = "text", placeholder, maxLength }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <label className="text-xs font-semibold text-[var(--muted)]">{label}</label>
        {hint && <span className="text-xs text-[var(--muted)]">{hint}</span>}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-black/10 dark:border-white/15 bg-[var(--paper)] dark:bg-[var(--paper-dark)] px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-shadow"
      />
    </div>
  );
}

/* Hoja inferior reutilizable para modales */
function Sheet({ children, onClose, centered }) {
  return (
    <div
      className="fixed inset-0 z-[350] bg-black/50 backdrop-blur-[2px] flex items-end justify-center animate-[fadeIn_0.25s_ease-out]"
      onClick={onClose}
    >
      <div
        className={`bg-[var(--paper)] dark:bg-[var(--card-dark)] w-full max-w-md rounded-t-[2rem] p-6 pb-8 shadow-2xl animate-[slideUp_0.35s_cubic-bezier(0.16,1,0.3,1)] ${centered ? "text-center" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-9 h-1 bg-black/10 dark:bg-white/15 rounded-full mx-auto mb-5" />
        {children}
      </div>
    </div>
  );
}