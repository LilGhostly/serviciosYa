import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  doc, collection, addDoc, query, orderBy,
  onSnapshot, serverTimestamp, updateDoc, getDoc,
} from "firebase/firestore";
import { useUser } from "../context/UserContext";
import { compressImageToDataUrl } from "../lib/imageCompression";

/* ─────────────────────────────────────────────
   CONFIGURACIÓN
───────────────────────────────────────────── */
const MAX_FILE_MB  = 10;
const MAX_FILE_B   = MAX_FILE_MB * 1024 * 1024;
const MAX_MSG_LEN  = 1000;
const ALLOWED_IMG  = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VID  = ["video/mp4", "video/quicktime", "video/webm"];

const QUICK_REPLIES = {
  cliente: [
    "👋 Hola, gracias por la cotización.",
    "✅ Me parece bien el presupuesto.",
    "🕒 ¿A qué hora podrías venir?",
    "📍 Te confirmaré la dirección exacta.",
    "💰 ¿Aceptas transferencia o efectivo?",
    "📷 Te envío más fotos ahora.",
  ],
  profesional: [
    "👋 Hola, quedo atento a tu confirmación.",
    "🚗 Voy saliendo hacia tu domicilio.",
    "📍 Llegaré en aproximadamente 20 minutos.",
    "🔧 ¿Necesitas que lleve materiales extra?",
    "📷 ¿Podrías enviarme una foto más cercana?",
    "✅ He llegado al lugar.",
  ],
};

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function ChatPage() {
  const { requestId } = useParams();
  const { user }      = useUser();
  const navigate      = useNavigate();

  const [requestData,    setRequestData]    = useState(null);
  const [messages,       setMessages]       = useState([]);
  const [text,           setText]           = useState("");
  const [loading,        setLoading]        = useState(true);
  const [sendError,      setSendError]      = useState("");
  const [zoomImg,        setZoomImg]        = useState(null);
  const [isHeaderOpen,   setIsHeaderOpen]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // 0-100 | null
  const [isAttachOpen,   setIsAttachOpen]   = useState(false);

  const bottomRef   = useRef(null);
  const fileRef     = useRef(null);
  const textareaRef = useRef(null);

  /* ─── SEGURIDAD: cargar datos y verificar acceso ─── */
  useEffect(() => {
    if (!requestId || !user?.uid) return;

    const unsub = onSnapshot(doc(db, "requests", requestId), (snap) => {
      if (!snap.exists()) { navigate("/dashboard"); return; }
      const data = snap.data();

      /* Solo el cliente o el profesional asignado pueden acceder */
      if (user.uid !== data.clientId && user.uid !== data.acceptedById) {
        navigate("/dashboard");
        return;
      }

      setRequestData({ id: snap.id, ...data });
      setLoading(false);

      /* Marcar como leído si el último mensaje no es mío */
      if (data.unreadChat && data.lastMessageSenderId && data.lastMessageSenderId !== user.uid) {
        updateDoc(doc(db, "requests", requestId), { unreadChat: false }).catch(() => {});
      }
    });

    return () => unsub();
  }, [requestId, user?.uid, navigate]);

  /* ─── MENSAJES ─── */
  useEffect(() => {
    if (!requestId) return;
    const q = query(
      collection(db, "chats", requestId, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [requestId]);

  /* ─── AUTO-SCROLL ─── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ─── ENVIAR MENSAJE DE TEXTO ─── */
  const sendMessage = useCallback(async (e) => {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || uploadProgress !== null) return;
    if (trimmed.length > MAX_MSG_LEN) {
      setSendError(`Mensaje demasiado largo (máx. ${MAX_MSG_LEN} caracteres).`);
      return;
    }

    /* Verificar que el chat siga activo */
    const status = requestData?.status;
    if (!status || ["completado", "cancelado_cliente", "cancelado_profesional"].includes(status)) {
      setSendError("Este canal de comunicación está cerrado.");
      return;
    }

    setSendError("");
    setText("");

    try {
      await addDoc(collection(db, "chats", requestId, "messages"), {
        senderId:  user.uid,
        text:      trimmed,
        type:      "text",
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "requests", requestId), {
        lastMessage:          trimmed.length > 60 ? trimmed.slice(0, 60) + "…" : trimmed,
        lastMessageAt:        serverTimestamp(),
        lastMessageSenderId:  user.uid,
        unreadChat:           true,
      });
    } catch (err) {
      console.error(err);
      setSendError("No se pudo enviar el mensaje. Intenta de nuevo.");
      setText(trimmed); // restaurar
    }
  }, [text, uploadProgress, requestData, requestId, user?.uid]);

  /* ─── ENVIAR ARCHIVO ─── */
  const sendFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    /* Validaciones de tipo y tamaño.
       NOTA: los videos quedaron deshabilitados en el chat porque, al no
       usar Firebase Storage (bloqueado por facturación), los archivos se
       guardan como Base64 dentro del propio documento de Firestore, que
       tiene un límite de 1 MB — un video no cabe ahí. Las imágenes sí,
       porque se comprimen antes de guardarse. */
    const isImg = ALLOWED_IMG.includes(file.type);
    const isVid = ALLOWED_VID.includes(file.type);

    if (isVid) {
      setSendError("Por ahora el envío de videos no está disponible. Puedes enviar imágenes (JPG, PNG, WEBP).");
      e.target.value = "";
      return;
    }
    if (!isImg) {
      setSendError("Solo se permiten imágenes (JPG, PNG, WEBP, GIF).");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_B) {
      setSendError(`El archivo supera el límite de ${MAX_FILE_MB} MB.`);
      e.target.value = "";
      return;
    }

    setIsAttachOpen(false);
    setSendError("");

    try {
      setUploadProgress(20);
      const dataUrl = await compressImageToDataUrl(file, { maxDimension: 900, maxBytes: 300 * 1024 });
      setUploadProgress(80);

      await addDoc(collection(db, "chats", requestId, "messages"), {
        senderId:  user.uid,
        url:       dataUrl,
        type:      "image",
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "requests", requestId), {
        lastMessage:         "📷 Imagen enviada",
        lastMessageAt:       serverTimestamp(),
        lastMessageSenderId: user.uid,
        unreadChat:          true,
      });
    } catch (err) {
      console.error(err);
      setSendError(err.message || "Error al procesar la imagen. Intenta nuevamente.");
    } finally {
      setUploadProgress(null);
      e.target.value = "";
    }
  };

  const insertQuickReply = (text) => {
    setText(text);
    textareaRef.current?.focus();
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("es-CL", { day: "numeric", month: "long" });
  };

  /* Agrupar mensajes por fecha para separadores */
  const groupedMessages = (() => {
    const groups = [];
    let lastDate = "";
    messages.forEach((m) => {
      if (!m.createdAt) { groups.push({ type: "msg", msg: m }); return; }
      const d = (m.createdAt.toDate ? m.createdAt.toDate() : new Date(m.createdAt))
        .toLocaleDateString("es-CL");
      if (d !== lastDate) {
        groups.push({ type: "date", label: formatDate(m.createdAt) });
        lastDate = d;
      }
      groups.push({ type: "msg", msg: m });
    });
    return groups;
  })();

  /* ─── LOADING ─── */
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-light)] dark:bg-[var(--bg-dark)]">
        <div className="w-8 h-8 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isClient    = user.uid === requestData?.clientId;
  const suggestions = isClient ? QUICK_REPLIES.cliente : QUICK_REPLIES.profesional;
  const otherName   = isClient
    ? (requestData?.professionalName || "Profesional")
    : (requestData?.clientSnapshot?.name || "Cliente");
  const otherPhone  = isClient
    ? requestData?.professionalPhone
    : requestData?.clientSnapshot?.phone;

  const isClosed = ["completado", "cancelado_cliente", "cancelado_profesional"].includes(requestData?.status);
  const total    = requestData?.proposedPrice ?? ((requestData?.laborCost || 0) + (requestData?.materialsCost || 0));

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="h-screen flex flex-col bg-[var(--bg-light)] dark:bg-[var(--bg-dark)] overflow-hidden font-sans transition-colors duration-500">

      {/* ── HEADER ── */}
      <header className="absolute top-0 w-full bg-white/90 dark:bg-black/90 backdrop-blur-xl border-b border-[var(--border-light)] dark:border-[var(--border-dark)] z-30 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">

          {/* Volver */}
          <Link
            to={isClient ? "/mis-solicitudes" : "/prof/trabajos"}
            className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center active:scale-90 transition-all border border-zinc-100 dark:border-zinc-800 shrink-0"
          >
            <svg className="w-5 h-5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"/>
            </svg>
          </Link>

          {/* Info del contacto */}
          <button
            className="flex-1 text-left cursor-pointer min-w-0"
            onClick={() => setIsHeaderOpen((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <h1 className="font-black text-sm uppercase tracking-tight leading-none mb-0.5 italic truncate dark:text-white">
                {otherName}
              </h1>
              {!isClosed && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              )}
            </div>
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-400 truncate">
              {requestData?.problemType} · {isHeaderOpen ? "▲" : "▼"}
            </p>
          </button>

          {/* Estado del servicio */}
          <div className="flex items-center gap-2 shrink-0">
            {isClosed && (
              <span className="text-[7px] font-black uppercase tracking-widest bg-zinc-100 dark:bg-zinc-900 text-zinc-400 px-3 py-1 rounded-full border border-zinc-200 dark:border-zinc-800">
                Cerrado
              </span>
            )}
            {/* Llamada directa */}
            {otherPhone && !isClosed && (
              <a
                href={`tel:${otherPhone}`}
                className="w-10 h-10 rounded-full bg-black text-white dark:bg-white dark:text-black flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                title={`Llamar a ${otherName}`}
              >
                <span className="text-sm">📞</span>
              </a>
            )}
          </div>
        </div>

        {/* DETALLES DESPLEGABLES */}
        {isHeaderOpen && (
          <div className="max-w-2xl mx-auto px-5 py-5 bg-zinc-50/95 dark:bg-zinc-900/95 border-t border-[var(--border-light)] dark:border-[var(--border-dark)] animate-slide-down">
            <div className="space-y-3">
              {requestData?.address && (
                <div className="flex items-start gap-4 p-4 bg-white dark:bg-black rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <span className="text-lg">📍</span>
                  <div>
                    <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Dirección</p>
                    <p className="text-xs font-bold leading-tight dark:text-white">{requestData.address}</p>
                  </div>
                </div>
              )}
              {total > 0 && (
                <div className="flex justify-between items-center p-4 bg-black text-white dark:bg-white dark:text-black rounded-2xl shadow-lg">
                  <span className="text-[9px] font-black uppercase tracking-widest">Presupuesto acordado</span>
                  <span className="text-xl font-black italic tracking-tighter">${total.toLocaleString("es-CL")}</span>
                </div>
              )}
              {requestData?.securityPin && isClient && (
                <div className="p-4 bg-zinc-900 dark:bg-zinc-100 rounded-2xl text-center">
                  <p className="text-[7px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2">
                    PIN de Seguridad
                  </p>
                  <div className="flex justify-center gap-3">
                    {requestData.securityPin.split("").map((d, i) => (
                      <span key={i} className="text-3xl font-black text-white dark:text-black italic">{d}</span>
                    ))}
                  </div>
                  <p className="text-[7px] text-zinc-500 dark:text-zinc-400 mt-2 uppercase tracking-widest">
                    Muéstralo solo al profesional al llegar
                  </p>
                </div>
              )}
              {/* Aviso de seguridad */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-100 dark:border-amber-800/30">
                <p className="text-[7px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 text-center leading-relaxed">
                  🔒 Nunca compartas contraseñas, datos bancarios ni realices pagos fuera de la plataforma.
                </p>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── ÁREA DE MENSAJES ── */}
      <main className="flex-1 overflow-y-auto px-4 pt-24 pb-4 bg-zinc-50 dark:bg-zinc-950 scroll-smooth">
        <div className="max-w-2xl mx-auto flex flex-col gap-2">

          {/* Aviso canal cerrado */}
          {isClosed && (
            <div className="flex justify-center my-4">
              <span className="bg-zinc-200/80 dark:bg-zinc-800/80 backdrop-blur-sm px-5 py-2 rounded-full text-[8px] font-black uppercase text-zinc-500 tracking-widest border border-zinc-300/50 dark:border-zinc-700/50">
                Canal cerrado · Solo lectura
              </span>
            </div>
          )}

          {groupedMessages.map((entry, idx) => {
            /* Separador de fecha */
            if (entry.type === "date") {
              return (
                <div key={`date-${idx}`} className="flex justify-center my-3">
                  <span className="bg-zinc-200/70 dark:bg-zinc-800/70 backdrop-blur-sm px-4 py-1.5 rounded-full text-[8px] font-bold uppercase text-zinc-500 tracking-widest border border-zinc-200/50 dark:border-zinc-700/50">
                    {entry.label}
                  </span>
                </div>
              );
            }

            const m     = entry.msg;
            const isMine= m.senderId === user.uid;

            /* ── Mensaje sistema ── */
            if (m.system && m.type !== "proposal") {
              return (
                <div key={m.id} className="flex justify-center my-1 animate-fade-in">
                  <span className="bg-zinc-200/60 dark:bg-zinc-800/60 backdrop-blur-sm px-4 py-1.5 rounded-full text-[8px] font-bold uppercase text-zinc-500 tracking-widest border border-zinc-200/50 dark:border-zinc-700/50 text-center max-w-[88%] shadow-sm leading-relaxed">
                    {m.text}
                  </span>
                </div>
              );
            }

            /* ── Card de cotización ── */
            if (m.type === "proposal") {
              return (
                <div key={m.id} className="w-full my-4 animate-reveal px-1">
                  <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-sm font-black uppercase italic tracking-wide flex items-center gap-2 dark:text-white">
                        <span className="text-lg">📑</span> Cotización Oficial
                      </h3>
                      <span className="bg-black text-white dark:bg-white dark:text-black text-[7px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">
                        Formal
                      </span>
                    </div>

                    {m.details ? (
                      <>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          {[
                            { label: "Mano de obra", val: m.details.laborCost },
                            { label: "Materiales",   val: m.details.materialsCost },
                          ].map(({ label, val }) => (
                            <div key={label} className="bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-2xl text-center border border-zinc-100 dark:border-zinc-700">
                              <p className="text-[7px] font-black uppercase text-zinc-400 tracking-widest mb-1">{label}</p>
                              <p className="text-sm font-black dark:text-white">${Number(val || 0).toLocaleString("es-CL")}</p>
                            </div>
                          ))}
                        </div>

                        {m.details.materialsDetail && (
                          <div className="mb-4 p-4 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700">
                            <p className="text-[7px] font-black uppercase text-zinc-400 tracking-widest mb-2">Detalle técnico</p>
                            <p className="text-xs italic font-medium leading-relaxed text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
                              "{m.details.materialsDetail}"
                            </p>
                          </div>
                        )}

                        <div className="flex justify-between items-center bg-black text-white dark:bg-white dark:text-black p-4 rounded-2xl shadow-lg">
                          <span className="text-[9px] font-black uppercase tracking-[0.2em]">Total Final</span>
                          <span className="text-xl font-black italic tracking-tighter">
                            ${Number(m.totalPrice || 0).toLocaleString("es-CL")}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-4 flex justify-between items-center bg-black text-white dark:bg-white dark:text-black p-4 rounded-2xl">
                        <span className="text-[9px] font-black uppercase tracking-widest">Total</span>
                        <span className="text-2xl font-black italic">${Number(m.totalPrice || 0).toLocaleString("es-CL")}</span>
                      </div>
                    )}

                    <p className="text-[7px] font-bold text-center mt-4 uppercase tracking-widest opacity-30">
                      {formatTime(m.createdAt)} · Documento válido
                    </p>
                  </div>
                </div>
              );
            }

            /* ── Mensaje normal ── */
            return (
              <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"} animate-slide-up`}>
                <div className={`max-w-[78%] shadow-sm transition-all hover:shadow-md
                  ${isMine
                    ? "bg-black text-white dark:bg-white dark:text-black rounded-[1.5rem] rounded-tr-sm"
                    : "bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 rounded-[1.5rem] rounded-tl-sm border border-zinc-100 dark:border-zinc-800"}
                  px-5 py-3`}
                >
                  {m.type === "text" && (
                    <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap break-words">
                      {m.text}
                    </p>
                  )}

                  {m.type === "image" && (
                    <button
                      onClick={() => setZoomImg(m.url)}
                      className="block mt-1 mb-1 rounded-xl overflow-hidden active:scale-95 transition-transform"
                    >
                      <img
                        src={m.url}
                        className="max-w-full h-auto object-cover rounded-xl"
                        alt="imagen adjunta"
                        loading="lazy"
                      />
                    </button>
                  )}

                  {m.type === "video" && (
                    <div className="mt-1 mb-1">
                      <video
                        src={m.url}
                        controls
                        playsInline
                        className="rounded-xl w-full bg-black shadow-sm max-h-64"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-1 mt-1.5 opacity-40">
                    <span className="text-[7px] font-bold tracking-wider">{formatTime(m.createdAt)}</span>
                    {isMine && <span className="text-[9px]">✓✓</span>}
                  </div>
                </div>
              </div>
            );
          })}

          <div ref={bottomRef} className="h-2" />
        </div>
      </main>

      {/* ── FOOTER (solo si no está cerrado) ── */}
      {!isClosed ? (
        <footer className="bg-white dark:bg-black border-t border-[var(--border-light)] dark:border-[var(--border-dark)] sticky bottom-0 z-20 pb-safe">

          {/* Barra de sugerencias */}
          <div className="flex gap-2 overflow-x-auto px-4 py-2.5 no-scrollbar bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-sm">
            {suggestions.map((sug, i) => (
              <button
                key={i}
                onClick={() => insertQuickReply(sug)}
                className="whitespace-nowrap px-4 py-2 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[9px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white active:scale-95 transition-all shadow-sm shrink-0"
              >
                {sug}
              </button>
            ))}
          </div>

          {/* Error de envío */}
          {sendError && (
            <div className="mx-4 mb-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-200 dark:border-red-800/30 animate-shake">
              <p className="text-[8px] font-black uppercase text-red-600 dark:text-red-400 tracking-widest text-center">
                ⚠️ {sendError}
              </p>
            </div>
          )}

          {/* Barra de progreso upload */}
          {uploadProgress !== null && (
            <div className="px-4 mb-2">
              <div className="h-1 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-black dark:bg-white transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-[8px] font-black uppercase tracking-widest text-zinc-400 text-center mt-1">
                Subiendo archivo... {uploadProgress}%
              </p>
            </div>
          )}

          <div className="max-w-2xl mx-auto flex items-end gap-2 px-4 pb-4 pt-1">

            {/* Input oculto para archivos */}
            <input
              type="file"
              accept={ALLOWED_IMG.join(",")}
              ref={fileRef}
              className="hidden"
              onChange={sendFile}
            />

            {/* Botón adjuntar */}
            <div className="relative">
              <button
                onClick={() => setIsAttachOpen((v) => !v)}
                disabled={uploadProgress !== null}
                className="w-11 h-11 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center text-zinc-500 active:scale-90 transition-all border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-30"
                title="Adjuntar archivo"
              >
                {uploadProgress !== null ? (
                  <div className="w-4 h-4 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/>
                  </svg>
                )}
              </button>

              {isAttachOpen && (
                <div className="absolute bottom-14 left-0 bg-white dark:bg-zinc-900 rounded-2xl p-2 shadow-2xl border border-zinc-100 dark:border-zinc-800 animate-slide-up flex flex-col gap-1 min-w-[140px] z-50">
                  <button
                    onClick={() => { fileRef.current.click(); setIsAttachOpen(false); }}
                    className="flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-black/50 rounded-xl transition-colors text-left"
                  >
                    <span className="text-lg">📷</span>
                    <span className="text-[9px] font-black uppercase tracking-widest dark:text-white">Imagen</span>
                  </button>
                  <button
                    onClick={() => { fileRef.current.click(); setIsAttachOpen(false); }}
                    className="flex items-center gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-black/50 rounded-xl transition-colors text-left"
                  >
                    <span className="text-lg">🎥</span>
                    <span className="text-[9px] font-black uppercase tracking-widest dark:text-white">Video</span>
                  </button>
                </div>
              )}
            </div>

            {/* Input de texto */}
            <form
              onSubmit={sendMessage}
              className="flex-1 flex items-end gap-2 bg-zinc-100 dark:bg-zinc-900 rounded-[1.5rem] px-1.5 py-1.5 border border-zinc-200 dark:border-zinc-800 focus-within:border-black dark:focus-within:border-white transition-colors"
            >
              <textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_MSG_LEN) {
                    setText(e.target.value);
                    setSendError("");
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(e);
                  }
                }}
                placeholder="Escribe aquí..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2.5 px-3 max-h-32 resize-none dark:text-white font-medium placeholder:text-zinc-400"
              />
              <button
                type="submit"
                disabled={!text.trim() || uploadProgress !== null}
                className="w-9 h-9 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center shadow-md active:scale-90 transition-all disabled:opacity-20 disabled:shadow-none shrink-0"
              >
                <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
            </form>
          </div>

          {/* Contador de caracteres */}
          {text.length > MAX_MSG_LEN * 0.8 && (
            <p className="text-center text-[7px] font-black uppercase tracking-widest text-zinc-300 pb-2">
              {text.length}/{MAX_MSG_LEN}
            </p>
          )}
        </footer>
      ) : (
        /* Canal cerrado */
        <footer className="bg-white dark:bg-black border-t border-[var(--border-light)] dark:border-[var(--border-dark)] px-4 py-6 pb-safe">
          <div className="max-w-2xl mx-auto">
            <div className="w-full py-4 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700 font-black text-[9px] uppercase text-center tracking-widest italic">
              💬 Canal de comunicación cerrado
            </div>
          </div>
        </footer>
      )}

      {/* ZOOM IMAGEN */}
      {zoomImg && (
        <div
          className="fixed inset-0 z-[500] bg-black/96 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setZoomImg(null)}
        >
          <img
            src={zoomImg}
            className="max-w-full max-h-[85vh] rounded-[2rem] shadow-2xl animate-scale-up object-contain"
            alt="zoom"
          />
          <button
            className="absolute top-8 right-8 w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white font-black text-2xl"
            onClick={() => setZoomImg(null)}
          >
            ×
          </button>
        </div>
      )}

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .pb-safe { padding-bottom: max(1.5rem, env(safe-area-inset-bottom)); }

        .animate-reveal { animation: reveal 0.4s cubic-bezier(0.16,1,0.3,1) forwards; }
        @keyframes reveal { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }

        .animate-fade-in { animation: fadeIn 0.25s ease-out; }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

        .animate-slide-down { animation: slideDown 0.3s ease-out; }
        @keyframes slideDown { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }

        .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.16,1,0.3,1); }
        @keyframes slideUp { from { transform:translateY(8px); opacity:0; } to { transform:translateY(0); opacity:1; } }

        .animate-scale-up { animation: scaleUp 0.3s cubic-bezier(0.16,1,0.3,1); }
        @keyframes scaleUp { from { transform:scale(0.94); opacity:0; } to { transform:scale(1); opacity:1; } }

        .animate-shake { animation: shake 0.35s ease-in-out; }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
      `}</style>
    </div>
  );
}