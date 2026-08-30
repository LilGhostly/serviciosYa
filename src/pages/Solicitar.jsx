/**
 * Solicitar.jsx — Rediseño visual y de UX
 * Mismo sistema de diseño que Perfil (paper/ink/brand/brass/danger,
 * Space Grotesk + Inter + JetBrains Mono). Lógica de negocio sin cambios.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection, doc, setDoc, serverTimestamp,
  updateDoc, query, where, getDocs, limit,
} from "firebase/firestore";
import { compressImageToDataUrl } from "../lib/imageCompression";
import { useUser } from "../context/UserContext";
import { createMercadoPagoPreference } from "../services/paymentService";
import { useLoadScript, Autocomplete, GoogleMap, Marker } from "@react-google-maps/api";
import {
  ArrowLeft, Search, MapPin, Calendar, Camera, ImagePlus, X, Check,
  AlertTriangle, Loader2, Lightbulb, Zap,
  FileText, ChevronRight, Clock, Hourglass, CheckCircle2, Pencil,
} from "lucide-react";
import { RUBROS, CATS } from "../data/categories";

/* ─────────────────────────────────────────────
   CONSTANTES
   NOTA: el catálogo de rubros vive en src/data/categories.js,
   compartido con RegisterProfesional.jsx y Home.jsx, para que un
   cliente nunca pueda pedir un rubro en el que ningún profesional
   se puede registrar (y viceversa).
───────────────────────────────────────────── */
const LIBRARIES   = ["places"];
const TOTAL_STEPS = 5;
const MAX_PHOTOS  = 3;
const MAX_MB      = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const FLASH_PRICE = 150;

const STEP_META = [
  { id: 1, label: "Servicio",  hint: "¿Qué necesitas?" },
  { id: 2, label: "Fotos",     hint: "Evidencia visual" },
  { id: 3, label: "Ubicación", hint: "¿Dónde?" },
  { id: 4, label: "Agenda",    hint: "¿Cuándo?" },
  { id: 5, label: "Confirmar", hint: "Revisar y enviar" },
];

/* ─────────────────────────────────────────────
   UTILS
───────────────────────────────────────────── */
const getComunaFromComponents = (components = []) => {
  const c = components.find(
    (c) => c.types.includes("locality") || c.types.includes("administrative_area_level_3")
  );
  return c?.long_name || "";
};

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString("es-CL", { dateStyle: "long", timeStyle: "short" }) : null;

const INITIAL_FORM = {
  problemType: "", description: "", address: "", mapComuna: "",
  lat: null, lng: null, refAddress: "", urgency: "normal",
  confirmTruth: false, scheduleType: "programado", scheduledDate: "",
};

/* ─────────────────────────────────────────────
   VALIDACIÓN POR PASO
───────────────────────────────────────────── */
function useStepValidator(step, form, hasMapsKey) {
  return useCallback(() => {
    if (step === 1) {
      if (!form.problemType) return "Elige una especialidad para continuar.";
      if (form.description.trim().length < 15) return "Describe el problema con al menos 15 caracteres.";
    }
    if (step === 3) {
      if (!form.address) return "Ingresa una dirección para continuar.";
      // Con Google Maps configurado, exigimos coordenadas reales (vienen del
      // autocompletado/mapa). Sin clave configurada, el formulario es manual
      // y no genera lat/lng, así que no se puede exigir.
      if (hasMapsKey && (!form.lat || !form.lng))
        return "Selecciona una dirección válida del buscador o el mapa.";
    }
    if (step === 4 && form.urgency === "normal" && !form.scheduledDate)
      return "Selecciona fecha y hora para la visita.";
    if (step === 5 && !form.confirmTruth)
      return "Debes certificar la veracidad de los datos.";
    return null;
  }, [step, form, hasMapsKey]);
}

/* ─────────────────────────────────────────────
   QUICK TIMES
───────────────────────────────────────────── */
function quickTimes() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const fmt = (d, h) => { const t = new Date(d); t.setHours(h, 0, 0, 0); return t.toISOString().slice(0, 16); };
  const pasado = new Date(tomorrow.getTime() + 86400000);
  return [
    { label: "Mañana 9am",  value: fmt(tomorrow, 9) },
    { label: "Mañana 12pm", value: fmt(tomorrow, 12) },
    { label: "Mañana 6pm",  value: fmt(tomorrow, 18) },
    { label: "Pasado 9am",  value: fmt(pasado, 9) },
    { label: "Pasado 12pm", value: fmt(pasado, 12) },
    { label: "Pasado 6pm",  value: fmt(pasado, 18) },
  ];
}

const darkMapStyles = [
  { elementType: "geometry",           stylers: [{ color: "#1c1f23" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1c1f23" }] },
  { elementType: "labels.text.fill",   stylers: [{ color: "#83807A" }] },
  { featureType: "road",     elementType: "geometry", stylers: [{ color: "#2a2e33" }] },
  { featureType: "water",    elementType: "geometry", stylers: [{ color: "#15171A" }] },
  { featureType: "poi",      elementType: "geometry", stylers: [{ color: "#1c1f23" }] },
];

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function Solicitar() {
  const navigate = useNavigate();
  const { user } = useUser();
  const dateRef  = useRef(null);

  const HAS_MAPS_KEY = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

  // Si no hay clave de Google Maps configurada (ej. clonaste el repo público
  // sin crear una cuenta de Google Cloud con facturación habilitada), no
  // dependemos de que el script termine de cargar — usamos directamente el
  // formulario de dirección manual (ver Paso 3 más abajo, mapsAvailable).
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES,
  });

  const mapsAvailable = HAS_MAPS_KEY && isLoaded && !loadError;

  const [step,         setStep]         = useState(1);
  const [form,         setForm]         = useState(INITIAL_FORM);
  const [photos,       setPhotos]       = useState([]);
  const [error,        setError]        = useState("");
  const [sending,      setSending]      = useState(false);
  const [success,      setSuccess]      = useState(false);
  const [activeReq,    setActiveReq]    = useState(null);
  const [checking,     setChecking]     = useState(true);
  const [showFlash,    setShowFlash]    = useState(false);
  const [autocomplete, setAutocomplete] = useState(null);
  const [mapCenter,    setMapCenter]    = useState({ lat: -33.4489, lng: -70.6693 });
  const [catFilter,    setCatFilter]    = useState("Todos");
  const [search,       setSearch]       = useState("");
  const [charCount,    setCharCount]    = useState(0);
  const [photoError,   setPhotoError]   = useState("");
  const [dragOver,     setDragOver]     = useState(false);

  const validate = useStepValidator(step, form, HAS_MAPS_KEY);
  const set      = (patch) => setForm((p) => ({ ...p, ...patch }));

  const filteredRubros = useMemo(() => {
    const s = search.toLowerCase();
    return RUBROS.filter(
      (r) => (catFilter === "Todos" || r.cat === catFilter) && r.label.toLowerCase().includes(s)
    );
  }, [search, catFilter]);

  useEffect(() => {
    if (!user || user.role !== "cliente") { navigate("/login?redirect=/solicitar"); return; }
    (async () => {
      try {
        const q = query(
          collection(db, "requests"),
          where("clientId", "==", user.uid),
          where("status", "in", ["pendiente", "asignado", "en_progreso", "esperando_pago"]),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) setActiveReq({ id: snap.docs[0].id, status: snap.docs[0].data().status });
      } catch (e) { console.error(e); }
      finally { setChecking(false); }
    })();
  }, [user, navigate]);

  const processFiles = useCallback((files) => {
    setPhotoError("");
    const valid = Array.from(files).filter((f) => {
      if (!ALLOWED_TYPES.includes(f.type)) { setPhotoError("Solo se aceptan fotos JPG, PNG o WEBP."); return false; }
      if (f.size / 1024 / 1024 > MAX_MB)  { setPhotoError(`Cada foto debe pesar menos de ${MAX_MB}MB.`); return false; }
      return true;
    });
    setPhotos((p) => [...p, ...valid].slice(0, MAX_PHOTOS));
  }, []);

  const handlePlaceChanged = () => {
    if (!autocomplete) return;
    const place = autocomplete.getPlace();
    if (place?.geometry?.location) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      setMapCenter({ lat, lng });
      set({ address: place.formatted_address, mapComuna: getComunaFromComponents(place.address_components), lat, lng });
    }
  };

  const handleMapClick = (ev) => {
    const lat = ev.latLng.lat(); const lng = ev.latLng.lng();
    setMapCenter({ lat, lng });
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results[0])
        set({ address: results[0].formatted_address, mapComuna: getComunaFromComponents(results[0].address_components), lat, lng });
      else set({ lat, lng });
    });
  };

  const goNext = () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setError("");
    setStep((s) => s - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goToStep = (s) => {
    setError("");
    setStep(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const uploadPhotos = async () => {
    // Las fotos se comprimen en el navegador y se guardan como Base64
    // dentro del propio documento de la solicitud en Firestore (campo
    // photoUrls), en vez de subirlas a Firebase Storage. Al ser máximo
    // MAX_PHOTOS fotos, se comprimen más agresivo para que quepan todas
    // dentro del límite de 1 MB por documento.
    const urls = [];
    for (const file of photos) {
      const dataUrl = await compressImageToDataUrl(file, {
        maxDimension: 640,
        maxBytes: 220 * 1024,
      });
      urls.push(dataUrl);
    }
    return urls;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSending(true); setError("");
    try {
      const isFlash = form.urgency === "urgente";
      const newRef  = doc(collection(db, "requests"));
      const payload = {
        ...form,
        clientSnapshot: {
          name:   user.profile?.name || user.name || "Cliente",
          phone:  user.profile?.phone || "",
          comuna: form.mapComuna || user.profile?.comuna || "",
        },
        clientId:      user.uid,
        status:        isFlash ? "esperando_pago" : "pendiente",
        isPriority:    isFlash,
        priorityLevel: isFlash ? 1 : 0,
        scheduleType:  isFlash ? "lo_antes_posible" : "programado",
        createdAt:     serverTimestamp(),
      };
      if (isFlash) {
        const data = await createMercadoPagoPreference(newRef.id, FLASH_PRICE, `Prioridad Flash — ${form.problemType}`);
        if (data?.init_point) {
          await setDoc(newRef, payload);
          if (photos.length) { const urls = await uploadPhotos(); await updateDoc(newRef, { photoUrls: urls }); }
          window.location.href = data.init_point;
        }
      } else {
        await setDoc(newRef, payload);
        if (photos.length) { const urls = await uploadPhotos(); await updateDoc(newRef, { photoUrls: urls }); }
        setSuccess(true);
        setTimeout(() => navigate("/cliente/dashboard"), 3000);
      }
    } catch (e) {
      console.error(e);
      setError("No pudimos procesar tu solicitud. Intenta nuevamente.");
      setSending(false);
    }
  };

  if (checking)  return <LoadingScreen />;
  if (success)   return <SuccessScreen />;
  if (activeReq) return <ActiveRequestScreen onNavigate={() => navigate("/cliente/dashboard")} />;

  const selectedRubro = RUBROS.find((r) => r.label === form.problemType);

  return (
    <div className="min-h-screen bg-[var(--paper)] dark:bg-[var(--paper-dark)] font-body text-[var(--ink)] dark:text-[var(--ink-dark)] transition-colors duration-300">

      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-[var(--paper)]/90 dark:bg-[var(--paper-dark)]/90 backdrop-blur-xl border-b border-black/5 dark:border-white/10">
        <div className="max-w-lg mx-auto px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={step === 1 ? () => navigate(-1) : goBack}
              aria-label={step === 1 ? "Salir" : "Volver al paso anterior"}
              className="w-9 h-9 rounded-xl bg-white dark:bg-[var(--card-dark)] border border-black/5 dark:border-white/10 flex items-center justify-center active:scale-95 transition-transform"
            >
              <ArrowLeft className="w-4.5 h-4.5" />
            </button>

            <div className="text-center">
              <p className="text-sm font-semibold">{STEP_META[step - 1].label}</p>
              <p className="text-xs text-[var(--muted)] mt-0.5">{STEP_META[step - 1].hint}</p>
            </div>

            <span className="text-xs font-mono text-[var(--muted)] w-9 text-right">
              {step}/{TOTAL_STEPS}
            </span>
          </div>

          <div className="flex gap-1.5">
            {STEP_META.map((s) => (
              <div key={s.id} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                s.id < step ? "bg-[var(--brand)]" : s.id === step ? "bg-[var(--brand-light)]" : "bg-black/8 dark:bg-white/10"
              }`} />
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 pt-7 pb-16 space-y-6">

        {error && (
          <div className="flex items-start gap-2.5 p-4 bg-red-50 dark:bg-red-950/30 rounded-2xl animate-shake">
            <AlertTriangle className="w-4 h-4 text-[var(--danger)] shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-[var(--danger)] leading-snug">{error}</p>
          </div>
        )}

        {/* ══ PASO 1: SERVICIO ══ */}
        {step === 1 && (
          <div className="space-y-6 animate-enter">
            <div>
              <h1 className="font-display text-3xl font-bold leading-tight mb-1.5">¿Qué necesitas?</h1>
              <p className="text-sm text-[var(--muted)]">Especialidad, descripción y tipo de atención</p>
            </div>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar especialidad…"
                className="w-full bg-white dark:bg-[var(--card-dark)] border border-black/10 dark:border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-shadow"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {CATS.map((cat) => (
                <button key={cat} onClick={() => setCatFilter(cat)}
                  className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    catFilter === cat
                      ? "bg-[var(--brand)] text-white"
                      : "bg-white dark:bg-[var(--card-dark)] border border-black/10 dark:border-white/10 text-[var(--muted)]"
                  }`}>{cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {filteredRubros.map((r) => {
                const Icon = r.icon;
                const active = form.problemType === r.label;
                return (
                  <button key={r.label} type="button"
                    onClick={() => { set({ problemType: r.label }); setError(""); }}
                    className={`relative flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all active:scale-[0.97] ${
                      active
                        ? "bg-[var(--brand)] border-transparent text-white"
                        : "bg-white dark:bg-[var(--card-dark)] border-black/8 dark:border-white/10"
                    }`}
                  >
                    <Icon className={`w-4.5 h-4.5 shrink-0 ${active ? "text-white" : "text-[var(--brand)]"}`} strokeWidth={1.75} />
                    <span className="text-xs font-medium leading-tight">{r.label}</span>
                    {active && <Check className="w-3.5 h-3.5 absolute top-2.5 right-2.5" strokeWidth={2.5} />}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-[var(--muted)]">
                  Describe el problema
                </label>
                <span className={`text-xs font-mono ${charCount >= 15 ? "text-[var(--brand)]" : "text-[var(--muted)]"}`}>
                  {charCount}/500
                </span>
              </div>
              <textarea
                value={form.description}
                onChange={(e) => { set({ description: e.target.value }); setCharCount(e.target.value.length); }}
                maxLength={500} rows={5}
                placeholder="Ej: El grifo del baño gotea constantemente desde hace 3 días…"
                className="w-full bg-white dark:bg-[var(--card-dark)] border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3.5 text-sm placeholder-[var(--muted)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-shadow leading-relaxed"
              />
              {charCount >= 15 && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--brand)]">
                  <Check className="w-3.5 h-3.5" /> Descripción suficiente
                </p>
              )}
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-[var(--muted)]">Tipo de atención</p>
              <div className="grid grid-cols-2 gap-3">
                <UrgencyTile
                  active={form.urgency === "normal"} onClick={() => set({ urgency: "normal" })}
                  icon={Clock} title="Estándar" badge="Gratis" desc="En lista de espera"
                />
                <UrgencyTile
                  active={form.urgency === "urgente"} onClick={() => setShowFlash(true)}
                  icon={Zap} title="Flash" badge={`+$${FLASH_PRICE}`} desc="Atención prioritaria" premium
                />
              </div>
            </div>

            <StepCTA onClick={goNext} label="Continuar" />
          </div>
        )}

        {/* ══ PASO 2: FOTOS ══ */}
        {step === 2 && (
          <div className="space-y-6 animate-enter">
            <div>
              <h1 className="font-display text-3xl font-bold leading-tight mb-1.5">Evidencia visual</h1>
              <p className="text-sm text-[var(--muted)]">Hasta {MAX_PHOTOS} fotos · JPG o PNG · máx. {MAX_MB}MB · opcional</p>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); processFiles(e.dataTransfer.files); }}
              onClick={() => photos.length < MAX_PHOTOS && document.getElementById("photo-input").click()}
              className={`flex flex-col items-center justify-center gap-3 py-12 rounded-3xl border-2 border-dashed cursor-pointer transition-colors ${
                dragOver ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                : photos.length >= MAX_PHOTOS ? "border-black/10 dark:border-white/10 opacity-40 cursor-not-allowed"
                : "border-black/15 dark:border-white/15 bg-white dark:bg-[var(--card-dark)] hover:border-[var(--brand)]"
              }`}
            >
              <input id="photo-input" type="file" multiple accept="image/*" className="hidden"
                onChange={(e) => processFiles(e.target.files)} disabled={photos.length >= MAX_PHOTOS} />
              <ImagePlus className="w-7 h-7 text-[var(--muted)]" strokeWidth={1.5} />
              <div className="text-center">
                <p className="text-sm font-medium">{dragOver ? "Suelta aquí" : "Toca o arrastra fotos"}</p>
                <p className="text-xs text-[var(--muted)] mt-1">{photos.length}/{MAX_PHOTOS} cargadas</p>
              </div>
            </div>

            {photoError && <p className="text-xs font-medium text-[var(--danger)]">{photoError}</p>}

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {photos.map((f, i) => (
                  <div key={i} className="relative aspect-square rounded-2xl overflow-hidden border border-black/8 dark:border-white/10">
                    <img src={URL.createObjectURL(f)} className="w-full h-full object-cover" alt="" />
                    <button onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                      aria-label="Quitar foto"
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/70 text-white rounded-full flex items-center justify-center">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {Array.from({ length: MAX_PHOTOS - photos.length }).map((_, i) => (
                  <div key={`e-${i}`} onClick={() => document.getElementById("photo-input").click()}
                    className="aspect-square rounded-2xl border-2 border-dashed border-black/10 dark:border-white/10 flex items-center justify-center cursor-pointer hover:border-[var(--brand)] transition-colors">
                    <ImagePlus className="w-5 h-5 text-[var(--muted)]" />
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-start gap-2.5 p-4 bg-white dark:bg-[var(--card-dark)] border border-black/5 dark:border-white/10 rounded-2xl">
              <Lightbulb className="w-4 h-4 text-[var(--brand)] shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                Las fotos claras ayudan al profesional a estimar el trabajo antes de llegar.
              </p>
            </div>

            <StepCTA onClick={goNext} label="Continuar" />
          </div>
        )}

        {/* ══ PASO 3: UBICACIÓN ══ */}
        {step === 3 && (
          <div className="space-y-5 animate-enter">
            <div>
              <h1 className="font-display text-3xl font-bold leading-tight mb-1.5">Lugar de atención</h1>
              <p className="text-sm text-[var(--muted)]">Busca tu dirección o márcala en el mapa</p>
            </div>

            {!HAS_MAPS_KEY ? (
              /* ── Sin clave de Google Maps: formulario de dirección manual ── */
              <>
                <div className="flex items-start gap-2.5 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-2xl mb-1">
                  <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                    Ingresa la dirección manualmente. El autocompletado y mapa con Google Maps se activan
                    configurando <code>VITE_GOOGLE_MAPS_API_KEY</code> en <code>.env</code>.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--muted)]">Dirección</label>
                  <input type="text" value={form.address}
                    onChange={(e) => set({ address: e.target.value })}
                    placeholder="Calle, número, comuna…"
                    className="w-full bg-white dark:bg-[var(--card-dark)] border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3.5 text-sm placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-shadow"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--muted)]">Comuna</label>
                  <input type="text" value={form.mapComuna || ""}
                    onChange={(e) => set({ mapComuna: e.target.value })}
                    placeholder="Ej: Providencia"
                    className="w-full bg-white dark:bg-[var(--card-dark)] border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3.5 text-sm placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-shadow"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--muted)]">
                    Referencia adicional <span className="font-normal">(opcional)</span>
                  </label>
                  <input type="text" value={form.refAddress} onChange={(e) => set({ refAddress: e.target.value })}
                    placeholder="Depto 302, torre B, portón negro…"
                    className="w-full bg-white dark:bg-[var(--card-dark)] border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3.5 text-sm placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-shadow"
                  />
                </div>
              </>
            ) : !mapsAvailable ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <Loader2 className="w-6 h-6 text-[var(--brand)] animate-spin" />
                <p className="text-xs font-medium text-[var(--muted)]">Cargando mapa…</p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] z-10" />
                  <Autocomplete onLoad={setAutocomplete} onPlaceChanged={handlePlaceChanged} options={{ componentRestrictions: { country: "cl" } }}>
                    <input type="text"
                      className="w-full bg-white dark:bg-[var(--card-dark)] border border-black/10 dark:border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-shadow"
                      placeholder="Calle, número, ciudad…"
                      value={form.address}
                      onChange={(e) => set({ address: e.target.value, lat: null, lng: null })}
                      onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                    />
                  </Autocomplete>
                </div>

                <div className={`w-full rounded-3xl overflow-hidden border transition-all duration-500 ${
                  form.lat && form.lng ? "h-52 border-[var(--brand)]/30" : "h-32 border-black/10 dark:border-white/10"
                }`}>
                  {form.lat && form.lng ? (
                    <GoogleMap mapContainerStyle={{ width: "100%", height: "100%" }} center={mapCenter} zoom={16}
                      options={{ disableDefaultUI: true, gestureHandling: "greedy", styles: darkMapStyles }} onClick={handleMapClick}>
                      <Marker position={{ lat: form.lat, lng: form.lng }} animation={window.google.maps.Animation.DROP} />
                    </GoogleMap>
                  ) : (
                    <div className="w-full h-full bg-white dark:bg-[var(--card-dark)] flex flex-col items-center justify-center gap-2">
                      <MapPin className="w-5 h-5 text-[var(--muted)]" />
                      <p className="text-xs text-[var(--muted)] text-center px-8">Selecciona una dirección para ver el mapa</p>
                    </div>
                  )}
                </div>

                {form.lat && form.lng && (
                  <div className="flex items-start gap-2.5 p-4 bg-[var(--brand-soft)] rounded-2xl">
                    <Check className="w-4 h-4 text-[var(--brand)] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--brand)] mb-0.5">Ubicación confirmada</p>
                      <p className="text-sm text-[var(--ink)] dark:text-[var(--ink-dark)] leading-snug">{form.address}</p>
                      {form.mapComuna && <p className="text-xs text-[var(--muted)] mt-1">{form.mapComuna}</p>}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--muted)]">
                    Referencia adicional <span className="font-normal">(opcional)</span>
                  </label>
                  <input type="text" value={form.refAddress} onChange={(e) => set({ refAddress: e.target.value })}
                    placeholder="Depto 302, torre B, portón negro…"
                    className="w-full bg-white dark:bg-[var(--card-dark)] border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3.5 text-sm placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-shadow"
                  />
                </div>
              </>
            )}

            <StepCTA onClick={goNext} label="Continuar" />
          </div>
        )}

        {/* ══ PASO 4: AGENDA ══ */}
        {step === 4 && (
          <div className="space-y-6 animate-enter">
            <div>
              <h1 className="font-display text-3xl font-bold leading-tight mb-1.5">¿Cuándo te visitan?</h1>
              <p className="text-sm text-[var(--muted)]">Elige fecha y hora de la visita</p>
            </div>

            {form.urgency === "urgente" ? (
              <div className="relative overflow-hidden p-7 bg-[var(--brass)] rounded-3xl text-white">
                <Zap className="w-8 h-8 mb-4" strokeWidth={1.75} />
                <h3 className="font-display text-lg font-bold mb-2">Modo Flash activado</h3>
                <p className="text-sm text-white/80 leading-relaxed">
                  Tu solicitud tiene prioridad máxima. El profesional más cercano llegará lo antes posible.
                </p>
                <button onClick={() => set({ urgency: "normal" })} className="mt-5 text-xs font-medium text-white/70 underline">
                  Cambiar a estándar
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  onClick={() => dateRef.current?.showPicker?.() || dateRef.current?.click()}
                  className={`relative cursor-pointer rounded-3xl border-2 p-7 flex flex-col items-center gap-3 transition-colors active:scale-[0.98] ${
                    form.scheduledDate
                      ? "border-[var(--brand)]/40 bg-[var(--brand-soft)]"
                      : "border-dashed border-black/15 dark:border-white/15 bg-white dark:bg-[var(--card-dark)] hover:border-[var(--brand)]"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${form.scheduledDate ? "bg-white/60 dark:bg-black/20" : "bg-black/5 dark:bg-white/10"}`}>
                    <Calendar className="w-5 h-5 text-[var(--brand)]" />
                  </div>
                  {form.scheduledDate ? (
                    <div className="text-center">
                      <p className="text-xs font-semibold text-[var(--brand)] mb-1">Fecha seleccionada</p>
                      <p className="text-sm font-medium">{fmtDate(form.scheduledDate)}</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm font-medium">Seleccionar fecha y hora</p>
                      <p className="text-xs text-[var(--muted)] mt-1">Toca para abrir el calendario</p>
                    </div>
                  )}
                  <input ref={dateRef} type="datetime-local" value={form.scheduledDate}
                    min={new Date(Date.now() + 3600000).toISOString().slice(0, 16)}
                    onChange={(e) => set({ scheduledDate: e.target.value })}
                    className="absolute inset-0 w-full h-full opacity-0 pointer-events-none" />
                </div>

                <div>
                  <p className="text-xs font-semibold text-[var(--muted)] mb-2">Horarios sugeridos</p>
                  <div className="grid grid-cols-3 gap-2">
                    {quickTimes().map(({ label, value }) => (
                      <button key={label} onClick={() => set({ scheduledDate: value })}
                        className={`py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                          form.scheduledDate === value
                            ? "bg-[var(--brand)] border-transparent text-white"
                            : "border-black/10 dark:border-white/10 text-[var(--muted)] bg-white dark:bg-[var(--card-dark)]"
                        }`}>{label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-4 bg-white dark:bg-[var(--card-dark)] border border-black/5 dark:border-white/10 rounded-2xl">
                  <Lightbulb className="w-4 h-4 text-[var(--brand)] shrink-0 mt-0.5" />
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    Puedes reagendar con el profesional por el chat una vez asignada la solicitud.
                  </p>
                </div>
              </div>
            )}

            <StepCTA onClick={goNext} label="Continuar" />
          </div>
        )}

        {/* ══ PASO 5: CONFIRMAR ══ */}
        {step === 5 && (
          <div className="space-y-5 animate-enter">
            <div>
              <h1 className="font-display text-3xl font-bold leading-tight mb-1.5">Revisar y confirmar</h1>
              <p className="text-sm text-[var(--muted)]">Toca cualquier dato para corregirlo</p>
            </div>

            <div className="bg-white dark:bg-[var(--card-dark)] border border-black/5 dark:border-white/10 rounded-3xl overflow-hidden">
              <button onClick={() => goToStep(1)} className="w-full flex items-center gap-3.5 p-4 border-b border-black/5 dark:border-white/10 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors">
                {selectedRubro && <selectedRubro.icon className="w-5 h-5 text-[var(--brand)] shrink-0" strokeWidth={1.75} />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--muted)] mb-0.5">Especialidad</p>
                  <p className="text-sm font-semibold truncate">{form.problemType || "—"}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 ${
                  form.urgency === "urgente" ? "bg-[var(--brass-soft)] text-[var(--brass)]" : "bg-black/5 dark:bg-white/10 text-[var(--muted)]"
                }`}>
                  {form.urgency === "urgente" ? "Flash" : "Estándar"}
                </span>
                <Pencil className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
              </button>

              <ReviewRow icon={FileText} label="Descripción" value={form.description} onEdit={() => goToStep(1)} />
              <ReviewRow icon={MapPin} label="Dirección" value={(form.address || "—") + (form.refAddress ? ` · ${form.refAddress}` : "")} onEdit={() => goToStep(3)} />
              <ReviewRow icon={Calendar} label="Visita" value={form.urgency === "urgente" ? "Lo antes posible (Flash)" : fmtDate(form.scheduledDate) || "—"} onEdit={() => goToStep(4)} />
              <ReviewRow icon={Camera} label="Fotos" value={photos.length > 0 ? `${photos.length} foto${photos.length > 1 ? "s" : ""} adjunta${photos.length > 1 ? "s" : ""}` : "Sin fotos"} onEdit={() => goToStep(2)} last />
            </div>

            {photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {photos.map((f, i) => (
                  <div key={i} className="w-20 h-20 shrink-0 rounded-2xl overflow-hidden border border-black/8 dark:border-white/10">
                    <img src={URL.createObjectURL(f)} className="w-full h-full object-cover" alt="" />
                  </div>
                ))}
              </div>
            )}

            {form.urgency === "urgente" && (
              <div className="flex justify-between items-center p-5 bg-[var(--brass-soft)] rounded-2xl">
                <div>
                  <p className="text-xs font-semibold text-[var(--brass)]">Cargo de prioridad</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">Pago único vía MercadoPago</p>
                </div>
                <p className="font-display text-2xl font-bold text-[var(--brass)]">${FLASH_PRICE}</p>
              </div>
            )}

            <label className="flex items-start gap-3.5 cursor-pointer p-4 bg-white dark:bg-[var(--card-dark)] border border-black/5 dark:border-white/10 rounded-2xl">
              <div className={`w-5 h-5 shrink-0 mt-0.5 rounded-md border-2 flex items-center justify-center transition-colors ${
                form.confirmTruth ? "bg-[var(--brand)] border-[var(--brand)]" : "border-black/20 dark:border-white/20"
              }`}>
                {form.confirmTruth && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
              </div>
              <input type="checkbox" className="sr-only" checked={form.confirmTruth} onChange={(e) => set({ confirmTruth: e.target.checked })} />
              <span className="text-sm text-[var(--muted)] leading-relaxed">
                Certifico que la información es verídica y acepto los{" "}
                <span className="text-[var(--brand)] font-medium">términos y condiciones</span>.
              </span>
            </label>

            <button
              onClick={handleSubmit}
              disabled={sending || !form.confirmTruth}
              className={`w-full py-4.5 rounded-2xl font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                form.urgency === "urgente" ? "bg-[var(--brass)] text-white" : "bg-[var(--brand)] text-white"
              }`}
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {form.urgency === "urgente" ? "Procesando pago…" : "Publicando…"}
                </>
              ) : form.urgency === "urgente" ? (
                <><Zap className="w-4 h-4" /> Pagar y publicar</>
              ) : (
                <><Check className="w-4 h-4" /> Publicar solicitud</>
              )}
            </button>
          </div>
        )}
      </main>

      {showFlash && (
        <FlashModal price={FLASH_PRICE}
          onConfirm={() => { set({ urgency: "urgente", scheduleType: "lo_antes_posible", scheduledDate: "" }); setShowFlash(false); }}
          onCancel={() => setShowFlash(false)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTES
───────────────────────────────────────────── */

function StepCTA({ onClick, label }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full py-4.5 rounded-2xl bg-[var(--ink)] dark:bg-[var(--ink-dark)] text-[var(--paper)] dark:text-[var(--ink)] font-semibold text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
      {label} <ChevronRight className="w-4 h-4" />
    </button>
  );
}

function UrgencyTile({ active, onClick, icon: Icon, title, badge, desc, premium }) {
  return (
    <button type="button" onClick={onClick}
      className={`relative flex flex-col items-center gap-2.5 p-5 rounded-2xl border transition-all active:scale-95 text-center ${
        active
          ? premium ? "bg-[var(--brass)] border-transparent text-white" : "bg-[var(--ink)] dark:bg-[var(--ink-dark)] border-transparent text-[var(--paper)] dark:text-[var(--ink)]"
          : "bg-white dark:bg-[var(--card-dark)] border-black/8 dark:border-white/10"
      }`}
    >
      <Icon className="w-5 h-5" strokeWidth={1.75} />
      <div>
        <p className="text-xs font-semibold mb-0.5">{title}</p>
        <p className={`text-sm font-bold ${active ? "" : "text-[var(--brand)]"}`}>{badge}</p>
        <p className={`text-xs mt-1 ${active ? "opacity-80" : "text-[var(--muted)]"}`}>{desc}</p>
      </div>
    </button>
  );
}

function ReviewRow({ icon: Icon, label, value, onEdit, last }) {
  return (
    <button onClick={onEdit} className={`w-full flex items-start gap-3.5 p-4 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors ${last ? "" : "border-b border-black/5 dark:border-white/10"}`}>
      <Icon className="w-4 h-4 text-[var(--muted)] shrink-0 mt-0.5" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[var(--muted)] mb-1">{label}</p>
        <p className="text-sm leading-relaxed">{value}</p>
      </div>
      <Pencil className="w-3.5 h-3.5 text-[var(--muted)] shrink-0 mt-0.5" />
    </button>
  );
}

function FlashModal({ price, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-lg bg-[var(--paper)] dark:bg-[var(--card-dark)] rounded-t-[2rem] p-6 pb-8 shadow-2xl animate-enter">
        <div className="w-9 h-1 bg-black/10 dark:bg-white/15 rounded-full mx-auto mb-6" />
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-[var(--brass-soft)] flex items-center justify-center">
            <Zap className="w-5 h-5 text-[var(--brass)]" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">Prioridad Flash</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">Atención inmediata garantizada</p>
          </div>
        </div>
        <div className="space-y-2.5 mb-6">
          {[
            "Tu solicitud aparece primero para todos los profesionales disponibles",
            "Tiempo de respuesta promedio: 15–30 minutos",
            "Pago único y seguro vía MercadoPago",
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <Check className="w-4 h-4 text-[var(--brass)] shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--muted)] leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between p-4 bg-white dark:bg-[var(--paper-dark)] border border-black/5 dark:border-white/10 rounded-2xl mb-5">
          <p className="text-xs font-semibold text-[var(--muted)]">Cargo único</p>
          <p className="font-display text-2xl font-bold text-[var(--brass)]">${price} <span className="text-xs text-[var(--muted)] font-normal">CLP</span></p>
        </div>
        <button onClick={onConfirm}
          className="w-full py-4 rounded-2xl bg-[var(--brass)] text-white font-semibold text-sm active:scale-[0.98] transition-transform mb-2.5 flex items-center justify-center gap-2">
          <Zap className="w-4 h-4" /> Activar prioridad Flash
        </button>
        <button onClick={onCancel}
          className="w-full py-2.5 text-sm font-medium text-[var(--muted)]">
          Continuar sin prioridad
        </button>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="h-screen bg-[var(--paper)] dark:bg-[var(--paper-dark)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 text-[var(--brand)] animate-spin" />
        <p className="text-xs font-medium text-[var(--muted)]">Verificando…</p>
      </div>
    </div>
  );
}

function SuccessScreen() {
  return (
    <div className="h-screen bg-[var(--paper)] dark:bg-[var(--paper-dark)] flex items-center justify-center p-8 font-body text-[var(--ink)] dark:text-[var(--ink-dark)]">
      <div className="text-center animate-enter">
        <div className="w-16 h-16 rounded-full bg-[var(--brand-soft)] flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-7 h-7 text-[var(--brand)]" />
        </div>
        <h2 className="font-display text-3xl font-bold mb-2">¡Publicado!</h2>
        <p className="text-sm text-[var(--muted)] mb-1">Tu solicitud ya está activa</p>
        <p className="text-xs text-[var(--muted)]">Redirigiendo…</p>
      </div>
    </div>
  );
}

function ActiveRequestScreen({ onNavigate }) {
  return (
    <div className="h-screen bg-[var(--paper)] dark:bg-[var(--paper-dark)] flex items-center justify-center p-8 font-body text-[var(--ink)] dark:text-[var(--ink-dark)]">
      <div className="w-full max-w-sm animate-enter">
        <div className="w-12 h-12 rounded-2xl bg-[var(--brand-soft)] flex items-center justify-center mb-6">
          <Hourglass className="w-5 h-5 text-[var(--brand)]" />
        </div>
        <h2 className="font-display text-3xl font-bold leading-tight mb-3">
          Ya tienes una solicitud activa
        </h2>
        <p className="text-sm text-[var(--muted)] leading-relaxed mb-8">
          Solo puedes gestionar un pedido a la vez. Revisa su estado antes de crear uno nuevo.
        </p>
        <button onClick={onNavigate}
          className="w-full py-4 rounded-2xl bg-[var(--ink)] dark:bg-[var(--ink-dark)] text-[var(--paper)] dark:text-[var(--ink)] font-semibold text-sm active:scale-[0.98] transition-transform">
          Ver solicitud actual
        </button>
      </div>
    </div>
  );
}