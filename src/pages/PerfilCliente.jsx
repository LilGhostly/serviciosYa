import { useState, useEffect, useRef } from "react";
import Webcam from "react-webcam";
import { useUser } from "../context/UserContext";
import { getAuth, signOut, sendEmailVerification } from "firebase/auth";
import {
  doc, updateDoc, onSnapshot,
  query, collection, where, limit,
} from "firebase/firestore";
import { db } from "../firebase";
import { compressImageToDataUrl } from "../lib/imageCompression";
import { STRIKE_LIMIT } from "../lib/business";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell, Plus, Pencil, Camera, Image, X, Mail, HelpCircle,
  FileText, FolderOpen, LogOut, ChevronRight, AlertTriangle,
  Loader2, CheckCircle2, ShieldAlert,
} from "lucide-react";

/* ─────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────── */
const MAX_NAME_LEN    = 60;
const MAX_ADDRESS_LEN = 120;
const MAX_STRIKES     = STRIKE_LIMIT; // reexportado localmente por compatibilidad con el resto del archivo

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function PerfilCliente() {
  const { user }  = useUser();
  const auth      = getAuth();
  const webcamRef = useRef(null);
  const navigate  = useNavigate();

  /* ── UI ── */
  const [loading,           setLoading]           = useState(false);
  const [loadingEmail,      setLoadingEmail]      = useState(false);
  const [uploadProgress,    setUploadProgress]    = useState(null); // 0-100 | null
  const [showEditModal,     setShowEditModal]      = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showCamera,        setShowCamera]        = useState(false);
  const [cameraDenied,      setCameraDenied]      = useState(false);
  const [editError,         setEditError]         = useState("");
  const [emailMsg,          setEmailMsg]          = useState({ type: "", text: "" });
  const [emailCooldown,     setEmailCooldown]     = useState(0);
  const [unreadCount,       setUnreadCount]       = useState(0);
  const [showPhotoOptions,  setShowPhotoOptions]  = useState(false);
  const fileInputRef = useRef(null);

  /* ── Datos ── */
  const [ratingData,   setRatingData]   = useState({ totalStars: 0, totalReviews: 0 });
  const [strikes,      setStrikes]      = useState(0);
  const [clientForm,   setClientForm]   = useState({
    name: "", phone: "", address: "", comuna: "", photoUrl: "",
  });

  /* ─── 1. Escucha Firestore ─── */
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setRatingData(d.ratingStats || { totalStars: 0, totalReviews: 0 });
      setStrikes(d.reputationPoints || 0);
      const profile = d.profile || d;
      setClientForm({
        name:     profile.name     || d.name     || "",
        phone:    profile.phone    || d.phone    || "",
        address:  profile.address  || "",
        comuna:   profile.comuna   || d.comuna   || "",
        photoUrl: profile.photoUrl || d.photoURL || "",
      });
    });
    return () => unsub();
  }, [user?.uid]);

  /* ─── 2. Notificaciones no leídas ─── */
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

  /* ─── 3. Cooldown de email ─── */
  useEffect(() => {
    if (emailCooldown <= 0) return;
    const t = setInterval(() => setEmailCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [emailCooldown]);

  /* ── Guardar perfil ── */
  const handleSaveProfile = async () => {
    setEditError("");
    const name    = clientForm.name.trim();
    const address = clientForm.address.trim();

    if (!name || name.split(/\s+/).length < 2)
      return setEditError("Ingresa tu nombre completo (nombre y apellido).");
    if (name.length > MAX_NAME_LEN)
      return setEditError(`El nombre no puede superar ${MAX_NAME_LEN} caracteres.`);
    if (address.length > MAX_ADDRESS_LEN)
      return setEditError(`La dirección no puede superar ${MAX_ADDRESS_LEN} caracteres.`);

    try {
      setLoading(true);
      await updateDoc(doc(db, "users", user.uid), {
        "profile.name":    name,
        "profile.phone":   clientForm.phone.trim(),
        "profile.address": address,
        "profile.comuna":  clientForm.comuna.trim(),
      });
      setShowEditModal(false);
    } catch {
      setEditError("Error al guardar. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Subir foto desde la galería ── */
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setShowPhotoOptions(false);
    setUploadProgress(0);

    try {
      // La foto se comprime en el navegador y se guarda como Base64
      // directamente en el documento del usuario en Firestore, en vez de
      // subirla a Firebase Storage (que requiere plan Blaze).
      const dataUrl = await compressImageToDataUrl(file);
      setUploadProgress(80);
      await updateDoc(doc(db, "users", user.uid), { "profile.photoUrl": dataUrl });
      setUploadProgress(100);
    } catch (err) {
      console.error("Error guardando foto de galería:", err);
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* ── Verificar email ── */
  const handleVerifyEmail = async () => {
    if (emailCooldown > 0 || loadingEmail) return;
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

  /* ── Capturar y subir foto ── */
  const capturePhoto = async () => {
    if (!webcamRef.current) return;
    const imgSrc = webcamRef.current.getScreenshot();
    if (!imgSrc) return;

    setShowCamera(false);
    setUploadProgress(0);

    try {
      const dataUrl = await compressImageToDataUrl(imgSrc);
      setUploadProgress(80);
      await updateDoc(doc(db, "users", user.uid), { "profile.photoUrl": dataUrl });
      setUploadProgress(100);
    } catch (err) {
      console.error("Error guardando foto:", err);
    } finally {
      setUploadProgress(null);
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
  const average         = ratingData.totalReviews >= 3
    ? (ratingData.totalStars / ratingData.totalReviews).toFixed(1)
    : null;
  const isEmailVerified = auth.currentUser?.emailVerified || false;
  const firstName       = clientForm.name.split(" ")[0] || "Usuario";

  if (!user) return null;

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--paper)] dark:bg-[var(--paper-dark)] pb-28 font-body text-[var(--ink)] dark:text-[var(--ink-dark)] transition-colors duration-300">

      {/* BARRA DE SUBIDA */}
      {uploadProgress !== null && (
        <div className="fixed top-0 left-0 right-0 z-[500] h-1 bg-black/5 dark:bg-white/10">
          <div
            className="h-full bg-[var(--brand)] transition-all duration-200"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      {/* ── CÁMARA ── */}
      {showCamera && (
        <div className="fixed inset-0 z-[400] bg-[var(--ink)] flex flex-col">
          <header className="p-5 flex justify-end shrink-0">
            <button
              onClick={() => setShowCamera(false)}
              aria-label="Cerrar cámara"
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </header>
          <div className="flex-1 relative">
            {cameraDenied ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <Camera className="w-8 h-8 text-white/30" />
                <p className="text-white/50 text-sm leading-relaxed max-w-xs">
                  No pudimos acceder a tu cámara. Revisa los permisos del navegador e intenta nuevamente.
                </p>
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
              <div className="w-48 h-56 border-2 border-dashed border-white/40 rounded-full" />
            </div>
          </div>
          <div className="p-8 flex flex-col items-center gap-5 shrink-0">
            <p className="text-white/50 text-xs font-medium">Centra tu rostro y captura</p>
            <button
              onClick={capturePhoto}
              disabled={cameraDenied}
              aria-label="Capturar foto"
              className="w-18 h-18 w-[72px] h-[72px] bg-white rounded-full border-4 border-white/20 shadow-2xl active:scale-90 transition-transform disabled:opacity-40"
            />
          </div>
        </div>
      )}

      {/* input oculto para galería */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* ── OPCIONES DE FOTO ── */}
      {showPhotoOptions && (
        <Sheet onClose={() => setShowPhotoOptions(false)}>
          <h3 className="font-display text-lg font-bold text-center mb-6">Actualizar foto</h3>
          <div className="space-y-2.5">
            <button
              onClick={() => { setShowPhotoOptions(false); setCameraDenied(false); setShowCamera(true); }}
              className="w-full py-4 rounded-2xl bg-[var(--brand)] text-white font-semibold text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2.5"
            >
              <Camera className="w-4.5 h-4.5" /> Usar cámara
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 rounded-2xl bg-black/[0.04] dark:bg-white/[0.08] font-semibold text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2.5"
            >
              <Image className="w-4.5 h-4.5" /> Elegir de galería
            </button>
          </div>
          <button
            onClick={() => setShowPhotoOptions(false)}
            className="w-full py-3.5 mt-2 text-sm font-medium text-[var(--muted)]"
          >
            Cancelar
          </button>
        </Sheet>
      )}

      {/* ── HEADER ── */}
      <header className="px-5 pt-8 pb-6">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-[var(--card-dark)] border border-black/5 dark:border-white/10 shadow-sm overflow-hidden flex items-center justify-center">
                {clientForm.photoUrl ? (
                  <img src={clientForm.photoUrl} className="w-full h-full object-cover" alt="" />
                ) : (
                  <span className="font-display font-bold text-xl">{clientForm.name?.charAt(0) || "U"}</span>
                )}
              </div>
              <button
                onClick={() => setShowPhotoOptions(true)}
                aria-label="Cambiar foto de perfil"
                className="absolute -bottom-1.5 -right-1.5 bg-[var(--brand)] text-white p-1.5 rounded-full shadow-md border-2 border-[var(--paper)] dark:border-[var(--paper-dark)] active:scale-90 transition-transform"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold leading-tight truncate">{firstName}</h1>
              <p className="text-sm text-[var(--muted)] mt-0.5 truncate">{clientForm.comuna || "Sin ubicación registrada"}</p>
              {isEmailVerified && (
                <p className="flex items-center gap-1 text-xs font-medium text-[var(--brand)] mt-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Cuenta verificada
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

        {/* Stats */}
        <div className="max-w-md mx-auto flex gap-6 mt-6">
          <Stat value={ratingData.totalReviews} label="Servicios" />
          <Stat value={average ? `★ ${average}` : "—"} label="Calificación" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 space-y-6">

        {/* Estado de reputación — solo si hay algo que mostrar */}
        {strikes > 0 && <StrikesCard strikes={strikes} />}

        {/* ACCIONES RÁPIDAS */}
        <div className="grid grid-cols-3 gap-3">
          <QuickAction to="/solicitar" icon={Plus} label="Pedir servicio" primary />
          <QuickAction to="/notificaciones" icon={Bell} label="Buzón" trailing={unreadCount > 0 ? unreadCount : null} />
          <QuickAction onClick={() => { setShowEditModal(true); setEditError(""); }} icon={Pencil} label="Editar perfil" />
        </div>

        {/* MENÚ */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] px-1">Mi cuenta</h3>
          <div className="bg-white dark:bg-[var(--card-dark)] rounded-3xl border border-black/5 dark:border-white/10 overflow-hidden">
            <MenuOption to="/mis-solicitudes" icon={FolderOpen} text="Mis pedidos" />
            <MenuOption to="/ayuda"           icon={HelpCircle} text="Centro de ayuda" />
            <MenuOption to="/terminos"        icon={FileText} text="Legal y privacidad" last={isEmailVerified} />

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
                    : "Verificar cuenta"}
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

        {/* DATOS GUARDADOS */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] px-1">Datos registrados</h3>
          <div className="bg-white dark:bg-[var(--card-dark)] rounded-3xl p-5 border border-black/5 dark:border-white/10 space-y-3.5">
            {[
              { label: "Email",      value: auth.currentUser?.email, mono: true },
              { label: "WhatsApp",   value: clientForm.phone },
              { label: "Dirección",  value: clientForm.address },
              { label: "Comuna",     value: clientForm.comuna },
            ].map(({ label, value, mono }) => (
              <div key={label} className="flex justify-between items-center gap-4">
                <span className="text-sm text-[var(--muted)] shrink-0">{label}</span>
                <span className={`text-sm font-medium truncate max-w-[60%] text-right ${mono ? "font-mono" : ""}`}>
                  {value || "—"}
                </span>
              </div>
            ))}
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
          MODAL EDICIÓN
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
              hint="Nombre y apellido"
              value={clientForm.name}
              onChange={(v) => setClientForm((f) => ({ ...f, name: v }))}
              maxLength={MAX_NAME_LEN}
              placeholder="Juan Pérez"
            />
            <EditField
              label="WhatsApp"
              hint="Ej: +56 9 1234 5678"
              value={clientForm.phone}
              onChange={(v) => setClientForm((f) => ({ ...f, phone: v }))}
              type="tel"
            />
            <EditField
              label="Dirección principal"
              hint={`${clientForm.address.length}/${MAX_ADDRESS_LEN}`}
              value={clientForm.address}
              onChange={(v) => setClientForm((f) => ({ ...f, address: v }))}
              maxLength={MAX_ADDRESS_LEN}
              placeholder="Av. Providencia 123, depto 4B"
            />
            <EditField
              label="Comuna"
              value={clientForm.comuna}
              onChange={(v) => setClientForm((f) => ({ ...f, comuna: v }))}
              placeholder="Providencia"
            />
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

      {/* MODAL LOGOUT */}
      {showLogoutConfirm && (
        <Sheet onClose={() => setShowLogoutConfirm(false)}>
          <div className="text-center">
            <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <LogOut className="w-6 h-6 text-[var(--danger)]" />
            </div>
            <h3 className="font-display text-lg font-bold mb-2">¿Cerrar sesión?</h3>
            <p className="text-sm text-[var(--muted)] mb-7 leading-relaxed">
              Deberás iniciar sesión nuevamente para continuar.
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

function Stat({ value, label }) {
  return (
    <div>
      <p className="font-display text-lg font-bold leading-none">{value}</p>
      <p className="text-xs text-[var(--muted)] mt-1.5">{label}</p>
    </div>
  );
}

/* Tarjeta de reputación — reemplaza el banner de advertencia genérico
   con algo que explica el estado y cuánto margen queda. */
function StrikesCard({ strikes }) {
  const critical = strikes >= MAX_STRIKES - 1;
  return (
    <div className={`rounded-3xl p-5 border ${
      critical
        ? "bg-red-50 dark:bg-red-950/20 border-red-200/60 dark:border-red-800/30"
        : "bg-[var(--brass-soft)] border-transparent"
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          critical ? "bg-[var(--danger)]/10 text-[var(--danger)]" : "bg-white/60 text-[var(--brass)]"
        }`}>
          <ShieldAlert className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${critical ? "text-[var(--danger)]" : "text-[var(--brass)]"}`}>
            {strikes} de {MAX_STRIKES} avisos registrados
          </p>
          <p className={`text-xs mt-1 leading-relaxed ${critical ? "text-[var(--danger)]/80" : "text-[var(--brass)]/80"}`}>
            {critical
              ? "Un aviso más y tu cuenta será suspendida. Revisa el Centro de ayuda si crees que es un error."
              : "Acumular avisos por cancelaciones o reportes puede limitar tu cuenta."}
          </p>
          <div className="flex gap-1.5 mt-3">
            {Array.from({ length: MAX_STRIKES }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < strikes
                    ? critical ? "bg-[var(--danger)]" : "bg-[var(--brass)]"
                    : "bg-black/10 dark:bg-white/10"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ to, onClick, icon: Icon, label, trailing, primary }) {
  const inner = (
    <div className={`flex flex-col items-center gap-2 py-4 px-2 rounded-2xl border active:scale-95 transition-transform h-full ${
      primary
        ? "bg-[var(--brand)] border-transparent text-white"
        : "bg-white dark:bg-[var(--card-dark)] border-black/5 dark:border-white/10"
    }`}>
      <div className="relative">
        <Icon className="w-5 h-5" strokeWidth={1.75} />
        {trailing != null && (
          <span className="absolute -top-1 -right-2.5 bg-[var(--danger)] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {trailing}
          </span>
        )}
      </div>
      <span className={`text-[11px] font-medium text-center leading-tight ${primary ? "text-white/90" : "text-[var(--muted)]"}`}>
        {label}
      </span>
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
function Sheet({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[350] bg-black/50 backdrop-blur-[2px] flex items-end justify-center animate-[fadeIn_0.25s_ease-out]"
      onClick={onClose}
    >
      <div
        className="bg-[var(--paper)] dark:bg-[var(--card-dark)] w-full max-w-md rounded-t-[2rem] p-6 pb-8 shadow-2xl animate-[slideUp_0.35s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-9 h-1 bg-black/10 dark:bg-white/15 rounded-full mx-auto mb-5" />
        {children}
      </div>
    </div>
  );
}