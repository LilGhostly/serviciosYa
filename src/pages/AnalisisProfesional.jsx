import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection, query, where, getDocs, orderBy, limit, doc, getDoc, setDoc
} from "firebase/firestore";
import { useUser } from "../context/UserContext";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
  ReferenceLine, Legend,
} from "recharts";

/* ─────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────── */
const COLORS       = ["#6366f1", "#f43f5e", "#f59e0b", "#10b981", "#0ea5e9"];
const MESES        = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MESES_FULL   = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const CACHE_MS     = 1000 * 60 * 30;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS        = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR];

/* ─────────────────────────────────────────────
   UTILS
───────────────────────────────────────────── */
const fmt = (n) => Number(n || 0).toLocaleString("es-CL", { maximumFractionDigits: 0 });
const pct = (a, b) => (b === 0 ? null : (((a - b) / b) * 100).toFixed(1));

/* ─────────────────────────────────────────────
   EXPORTAR CSV
───────────────────────────────────────────── */
function exportCSV(data, filename) {
  const headers = ["Fecha", "Tipo de Trabajo", "Precio ($)"];
  const rows = data.map((d) => [
    new Date(d.createdAt).toLocaleDateString("es-CL"),
    `"${d.problemType}"`,
    d.proposedPrice,
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────
   HOOK: DATOS FIREBASE
───────────────────────────────────────────── */
function useMetricsData(uid, anio) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [datos, setDatos]     = useState([]);

  useEffect(() => {
    if (!uid) return;
    const cacheKey  = `anl_${uid}_${anio}`;
    const cacheTime = `${cacheKey}_t`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      const ts     = sessionStorage.getItem(cacheTime);
      if (cached && ts && Date.now() - Number(ts) < CACHE_MS) {
        setDatos(JSON.parse(cached));
        setLoading(false);
        return;
      }
    } catch {}

    const fetch = async () => {
      try {
        setLoading(true);
        setError("");
        const q = query(
          collection(db, "requests"),
          where("acceptedById", "==", uid),
          where("status", "==", "completado"),
          orderBy("createdAt", "desc"),
          limit(200)
        );
        const snap  = await getDocs(q);
        const items = snap.docs.map((d) => {
          const data = d.data();
          return {
            id:            d.id,
            problemType:   data.problemType || "Servicio",
            proposedPrice: data.proposedPrice ?? ((data.laborCost || 0) + (data.materialsCost || 0)),
            clientName:    data.clientSnapshot?.name || "Cliente",
            clientId:      data.clientSnapshot?.uid  || null,
            createdAt:     data.createdAt?.toDate
              ? data.createdAt.toDate().toISOString()
              : new Date().toISOString(),
          };
        });
        setDatos(items);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(items));
          sessionStorage.setItem(cacheTime, Date.now().toString());
        } catch {}
      } catch (err) {
        console.error(err);
        setError("No se pudieron cargar las métricas.");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [uid, anio]);

  return { loading, error, datos };
}

/* ─────────────────────────────────────────────
   HOOK: METAS FIRESTORE
───────────────────────────────────────────── */
function useMetas(uid, anio) {
  const [metas, setMetas]   = useState({ anual: 0, mensual: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const load = async () => {
      try {
        const ref  = doc(db, "metas", `${uid}_${anio}`);
        const snap = await getDoc(ref);
        if (snap.exists()) setMetas(snap.data());
      } catch {}
    };
    load();
  }, [uid, anio]);

  const saveMetas = useCallback(async (nuevas) => {
    if (!uid) return;
    setSaving(true);
    try {
      const ref = doc(db, "metas", `${uid}_${anio}`);
      await setDoc(ref, nuevas, { merge: true });
      setMetas(nuevas);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }, [uid, anio]);

  return { metas, saveMetas, saving };
}

/* ─────────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────────── */
export default function AnalisisProfesional() {
  const { user }     = useUser();
  const navigate     = useNavigate();
  const [anio, setAnio]               = useState(CURRENT_YEAR);
  const [tab, setTab]                 = useState("overview");   // overview | rubros | clientes
  const [showMetaModal, setShowMetaModal] = useState(false);

  const { loading, error, datos }     = useMetricsData(user?.uid, anio);
  const { metas, saveMetas, saving }  = useMetas(user?.uid, anio);

  /* ─── Procesamiento ─── */
  const metrics = useMemo(() => {
    const anual  = datos.filter((i) => new Date(i.createdAt).getFullYear() === anio);
    const prevYr = datos.filter((i) => new Date(i.createdAt).getFullYear() === anio - 1);

    const facturacion = anual.reduce((a, i) => a + (Number(i.proposedPrice) || 0), 0);
    const facturacionPrev = prevYr.reduce((a, i) => a + (Number(i.proposedPrice) || 0), 0);
    const ticketProm  = anual.length ? facturacion / anual.length : 0;
    const ticketPrev  = prevYr.length ? facturacionPrev / prevYr.length : 0;

    // Mensual combinado (anio vs anio-1)
    const mensual = MESES.map((mes, idx) => {
      const curr = anual.filter((i) => new Date(i.createdAt).getMonth() === idx);
      const prev = prevYr.filter((i) => new Date(i.createdAt).getMonth() === idx);
      return {
        name:  mes,
        total: curr.reduce((a, i) => a + (Number(i.proposedPrice) || 0), 0),
        count: curr.length,
        prev:  prev.reduce((a, i) => a + (Number(i.proposedPrice) || 0), 0),
      };
    });

    // Mejor mes
    const mejorMes = [...mensual].sort((a, b) => b.total - a.total)[0] || { name: "—", total: 0 };

    // Rubros
    const rubros = Object.values(
      anual.reduce((acc, i) => {
        const k = i.problemType;
        if (!acc[k]) acc[k] = { name: k, value: 0, count: 0 };
        acc[k].value += Number(i.proposedPrice) || 0;
        acc[k].count += 1;
        return acc;
      }, {})
    ).sort((a, b) => b.value - a.value);

    // Top clientes
    const clientes = Object.values(
      anual.reduce((acc, i) => {
        const k = i.clientId || i.clientName;
        if (!acc[k]) acc[k] = { name: i.clientName, total: 0, count: 0 };
        acc[k].total += Number(i.proposedPrice) || 0;
        acc[k].count += 1;
        return acc;
      }, {})
    ).sort((a, b) => b.total - a.total).slice(0, 5);

    // Racha activa (meses consecutivos con ingresos)
    let racha = 0;
    const mesActual = new Date().getMonth();
    for (let m = mesActual; m >= 0; m--) {
      if (mensual[m].count > 0) racha++;
      else break;
    }

    // Promedio mensual (meses activos)
    const mesesActivos = mensual.filter((m) => m.count > 0).length || 1;
    const promedioMensual = facturacion / mesesActivos;

    // Proyección anual (basada en meses transcurridos)
    const mesActualIdx = Math.min(new Date().getMonth() + 1, 12);
    const proyeccion   = anio === CURRENT_YEAR && mesActualIdx > 0
      ? (facturacion / mesActualIdx) * 12
      : null;

    return {
      anual, prevYr, mensual, rubros, clientes,
      facturacion, facturacionPrev,
      ticketProm, ticketPrev,
      mejorMes, racha, promedioMensual, proyeccion,
      variacion: pct(facturacion, facturacionPrev),
      variacionTicket: pct(ticketProm, ticketPrev),
    };
  }, [datos, anio]);

  const maxRubroValue = metrics.rubros.length > 0 ? Math.max(...metrics.rubros.map(r => r.value)) : 1;

  /* ─── Progreso meta anual ─── */
  const progMetaAnual  = metas.anual  > 0 ? Math.min((metrics.facturacion / metas.anual) * 100, 100) : 0;
  const progMetaMensual = metas.mensual > 0
    ? Math.min((metrics.mensual[new Date().getMonth()]?.total / metas.mensual) * 100, 100)
    : 0;

  /* ─── Loading Skeleton ─── */
  if (loading) return <SkeletonScreen />;

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-zinc-950 font-sans pb-32 overflow-x-hidden transition-colors duration-500">

      {/* HEADER */}
      <header className="bg-[var(--bg-light)]/80 dark:bg-zinc-950/80 backdrop-blur-2xl border-b border-[var(--border-light)] dark:border-zinc-900 sticky top-0 z-50 shadow-sm">
        <div className="max-w-md mx-auto px-5 py-3.5 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-[var(--card-light)] dark:bg-zinc-900 border border-[var(--border-light)] dark:border-zinc-800 flex items-center justify-center active:scale-95 transition-all text-zinc-500 hover:text-black dark:hover:text-white shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>

          <h1 className="text-xs font-black uppercase tracking-tighter dark:text-white italic flex items-center gap-1.5 flex-1 justify-center">
            Análisis <span className="px-2 py-0.5 bg-indigo-600 text-white rounded-md text-[9px] not-italic tracking-widest shadow-lg shadow-indigo-500/40">PRO</span>
          </h1>

          <div className="flex items-center gap-2">
            {/* Exportar CSV */}
            <button
              onClick={() => exportCSV(metrics.anual, `metricas_${anio}.csv`)}
              disabled={metrics.anual.length === 0}
              title="Exportar CSV"
              className="w-9 h-9 rounded-xl bg-[var(--card-light)] dark:bg-zinc-900 border border-[var(--border-light)] dark:border-zinc-800 flex items-center justify-center active:scale-95 transition-all text-zinc-500 hover:text-emerald-500 disabled:opacity-30 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
            </button>

            {/* Selector año */}
            <div className="flex bg-[var(--card-light)] dark:bg-zinc-900 p-0.5 rounded-xl border border-[var(--border-light)] dark:border-zinc-800">
              {YEARS.map((y) => (
                <button
                  key={y}
                  onClick={() => setAnio(y)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-200 ${
                    anio === y
                      ? "bg-black dark:bg-white text-white dark:text-black shadow"
                      : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* TAB BAR */}
        <div className="max-w-md mx-auto px-5 pb-3 flex gap-1.5">
          {[
            { id: "overview",  label: "Resumen",   icon: "⚡" },
            { id: "rubros",    label: "Rubros",    icon: "🎯" },
            { id: "clientes",  label: "Clientes",  icon: "👤" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-200 ${
                tab === t.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30"
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 bg-transparent"
              }`}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* ERROR */}
      {error && (
        <div className="max-w-md mx-auto px-5 pt-5 animate-reveal">
          <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl text-center">
            <p className="text-[10px] font-black uppercase text-red-600 dark:text-red-400 tracking-widest">⚠️ {error}</p>
          </div>
        </div>
      )}

      <main className="max-w-md mx-auto px-5 pt-6 space-y-5 pb-10">

        {/* ── TAB: OVERVIEW ── */}
        {tab === "overview" && (
          <>
            {/* KPIs */}
            <section className="grid grid-cols-2 gap-3 animate-reveal" style={{ animationDelay: "50ms" }}>
              <KPITile
                titulo="Facturación"
                valor={`$${fmt(metrics.facturacion)}`}
                sub={`Año ${anio}`}
                delta={metrics.variacion}
                color="indigo"
                icon="📈"
              />
              <KPITile
                titulo="Ticket Prom."
                valor={`$${fmt(metrics.ticketProm)}`}
                sub="Por servicio"
                delta={metrics.variacionTicket}
                color="rose"
                icon="🎟️"
              />
              <KPITile
                titulo="Trabajos"
                valor={metrics.anual.length}
                sub={`Mejor: ${metrics.mejorMes.name}`}
                color="emerald"
                icon="⚡"
              />
              <KPITile
                titulo="Racha activa"
                valor={`${metrics.racha} mes${metrics.racha !== 1 ? "es" : ""}`}
                sub="Consecutivos"
                color="amber"
                icon="🔥"
              />
            </section>

            {/* Proyección + Promedio mensual */}
            {(metrics.proyeccion || metrics.promedioMensual > 0) && (
              <section className="grid grid-cols-2 gap-3 animate-reveal" style={{ animationDelay: "100ms" }}>
                {metrics.proyeccion && (
                  <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-5 rounded-2xl text-white col-span-1 shadow-xl shadow-indigo-500/20">
                    <p className="text-[8px] font-black uppercase tracking-widest opacity-70 mb-2">Proyección anual</p>
                    <p className="text-xl font-black italic tracking-tighter leading-none">${fmt(metrics.proyeccion)}</p>
                    <p className="text-[8px] opacity-60 mt-1.5 font-bold">Basado en ritmo actual</p>
                  </div>
                )}
                <div className="bg-[var(--card-light)] dark:bg-zinc-900 border border-[var(--border-light)] dark:border-zinc-800 p-5 rounded-2xl col-span-1">
                  <p className="text-[8px] font-black uppercase tracking-widest text-zinc-500 mb-2">Prom. mensual</p>
                  <p className="text-xl font-black italic tracking-tighter text-emerald-500 leading-none">${fmt(metrics.promedioMensual)}</p>
                  <p className="text-[8px] text-zinc-400 mt-1.5 font-bold uppercase tracking-widest">Meses activos</p>
                </div>
              </section>
            )}

            {/* METAS */}
            <section className="bg-[var(--card-light)] dark:bg-zinc-900 rounded-2xl border border-[var(--border-light)] dark:border-zinc-800 overflow-hidden animate-reveal shadow-lg" style={{ animationDelay: "120ms" }}>
              <div className="px-6 pt-5 pb-4 flex justify-between items-center">
                <div>
                  <h2 className="text-xs font-black uppercase tracking-tighter dark:text-white italic">Metas {anio}</h2>
                  <p className="text-[8px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Objetivos de facturación</p>
                </div>
                <button
                  onClick={() => setShowMetaModal(true)}
                  className="text-[9px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-500/10 px-3 py-1.5 rounded-lg hover:bg-indigo-500/20 transition-colors"
                >
                  Editar
                </button>
              </div>

              <div className="px-6 pb-6 space-y-4">
                {/* Meta Anual */}
                <MetaBar
                  label="Meta anual"
                  current={metrics.facturacion}
                  target={metas.anual}
                  progress={progMetaAnual}
                  color="#6366f1"
                />
                {/* Meta Mensual */}
                <MetaBar
                  label={`Meta ${MESES_FULL[new Date().getMonth()]}`}
                  current={metrics.mensual[new Date().getMonth()]?.total || 0}
                  target={metas.mensual}
                  progress={progMetaMensual}
                  color="#10b981"
                />
              </div>
            </section>

            {/* GRÁFICO ÁREA + COMPARATIVA */}
            <section className="relative overflow-hidden bg-[var(--card-light)] dark:bg-zinc-900 p-6 rounded-2xl border border-[var(--border-light)] dark:border-zinc-800 shadow-lg animate-reveal" style={{ animationDelay: "150ms" }}>
              <div className="absolute -top-8 -right-8 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 mb-6 flex justify-between items-end">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-tighter dark:text-white italic leading-none">Ingresos {anio}</h2>
                  <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest mt-1">vs {anio - 1}</p>
                </div>
                <div className="flex items-center gap-3 text-[8px] font-black uppercase tracking-widest">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"/>{anio}</span>
                  <span className="flex items-center gap-1 opacity-50"><span className="w-2 h-2 rounded-full bg-zinc-400 inline-block"/>{anio - 1}</span>
                </div>
              </div>

              {metrics.facturacion === 0 && metrics.anual.length === 0 ? (
                <EmptyState year={anio} />
              ) : (
                <div className="h-52 w-full -ml-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={metrics.mensual} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gCurr" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gPrev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#a1a1aa" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#a1a1aa" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#52525b" strokeOpacity={0.12} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: "#71717a" }} dy={8} />
                      <YAxis hide />
                      <Tooltip content={<ComparativaTooltip anio={anio} />} cursor={{ stroke: "#6366f1", strokeWidth: 1, strokeDasharray: "4 4" }} />
                      {/* Línea de meta mensual */}
                      {metas.mensual > 0 && (
                        <ReferenceLine y={metas.mensual} stroke="#10b981" strokeDasharray="6 3" strokeWidth={1.5}
                          label={{ value: `Meta $${fmt(metas.mensual)}`, position: "insideTopRight", fontSize: 8, fill: "#10b981", fontWeight: 700 }}
                        />
                      )}
                      <Area type="monotone" dataKey="prev"  stroke="#a1a1aa" strokeWidth={1.5} fillOpacity={1} fill="url(#gPrev)" strokeDasharray="4 3" dot={false} animationDuration={1000} />
                      <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={3}   fillOpacity={1} fill="url(#gCurr)" dot={false} animationDuration={1200} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            {/* GRÁFICO BARRAS: Cantidad de trabajos por mes */}
            {metrics.anual.length > 0 && (
              <section className="bg-[var(--card-light)] dark:bg-zinc-900 p-6 rounded-2xl border border-[var(--border-light)] dark:border-zinc-800 shadow-lg animate-reveal" style={{ animationDelay: "200ms" }}>
                <h2 className="text-xs font-black uppercase tracking-tighter dark:text-white italic mb-1">Trabajos por mes</h2>
                <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest mb-5">Volumen de servicios</p>
                <div className="h-40 w-full -ml-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.mensual} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#52525b" strokeOpacity={0.12} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: "#71717a" }} dy={6} />
                      <YAxis hide />
                      <Tooltip
                        formatter={(v) => [v + " trabajo" + (v !== 1 ? "s" : ""), "Cantidad"]}
                        contentStyle={{
                          background: "rgba(9,9,11,0.9)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "14px",
                          fontSize: "11px",
                          fontWeight: "bold",
                          color: "#fff",
                          padding: "10px 14px",
                        }}
                      />
                      <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={32} animationDuration={1000}>
                        {metrics.mensual.map((_, i) => (
                          <Cell key={i} fill={_ === metrics.mejorMes ? "#f43f5e" : "#6366f1"} fillOpacity={_.count === 0 ? 0.2 : 1} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[8px] text-zinc-400 font-bold text-center mt-2 uppercase tracking-widest">
                  <span className="text-rose-400">■</span> Mejor mes: {metrics.mejorMes.name}
                </p>
              </section>
            )}

            {/* ÚLTIMOS SERVICIOS */}
            {metrics.anual.length > 0 && (
              <section className="animate-reveal" style={{ animationDelay: "250ms" }}>
                <div className="flex justify-between items-center px-1 mb-3">
                  <h2 className="text-[10px] font-black uppercase text-zinc-400 tracking-widest italic">Últimos servicios</h2>
                  <Link to="/historial-profesional" className="text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-600 transition-colors bg-indigo-500/10 px-3 py-1.5 rounded-lg">
                    Ver todo →
                  </Link>
                </div>
                <div className="space-y-2.5">
                  {metrics.anual.slice(0, 5).map((job) => (
                    <ServiceRow key={job.id} job={job} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── TAB: RUBROS ── */}
        {tab === "rubros" && (
          <section className="space-y-5">
            {metrics.rubros.length === 0 ? (
              <EmptyState year={anio} />
            ) : (
              <>
                {/* Donut */}
                <div className="bg-[var(--card-light)] dark:bg-zinc-900 p-6 rounded-2xl border border-[var(--border-light)] dark:border-zinc-800 shadow-lg animate-reveal">
                  <h2 className="text-xs font-black uppercase tracking-tighter dark:text-white italic mb-1 text-center">Distribución</h2>
                  <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest mb-4 text-center">Ingresos por especialidad</p>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={metrics.rubros} innerRadius={55} outerRadius={80} paddingAngle={6} dataKey="value" stroke="none" cornerRadius={5} animationDuration={1000}>
                          {metrics.rubros.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => [`$${fmt(v)}`, "Total"]} contentStyle={{
                          background: "rgba(9,9,11,0.92)", border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "14px", fontSize: "11px", fontWeight: "bold", color: "#fff", padding: "10px 14px",
                        }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Lista con barras */}
                <div className="bg-[var(--card-light)] dark:bg-zinc-900 p-6 rounded-2xl border border-[var(--border-light)] dark:border-zinc-800 shadow-lg space-y-4 animate-reveal" style={{ animationDelay: "100ms" }}>
                  {metrics.rubros.map((item, i) => {
                    const color = COLORS[i % COLORS.length];
                    const pctVal = ((item.value / metrics.facturacion) * 100).toFixed(1);
                    return (
                      <div key={i}>
                        <div className="flex justify-between items-end mb-1.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-2.5 h-2.5 rounded-full shadow-inner shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-[10px] font-black uppercase tracking-widest dark:text-white truncate max-w-[140px]">{item.name}</span>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className="text-xs font-black dark:text-white leading-none">${fmt(item.value)}</p>
                            <p className="text-[7px] font-black text-zinc-500 uppercase tracking-widest mt-0.5">
                              {item.count} serv. · {pctVal}%
                            </p>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${(item.value / maxRubroValue) * 100}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Tabla de rubros */}
                <div className="bg-[var(--card-light)] dark:bg-zinc-900 rounded-2xl border border-[var(--border-light)] dark:border-zinc-800 overflow-hidden shadow-lg animate-reveal" style={{ animationDelay: "200ms" }}>
                  <div className="px-5 py-4 border-b border-[var(--border-light)] dark:border-zinc-800 flex justify-between">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Especialidad</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Ticket prom.</span>
                  </div>
                  {metrics.rubros.map((item, i) => (
                    <div key={i} className="px-5 py-3.5 flex justify-between items-center border-b border-[var(--border-light)] dark:border-zinc-900/50 last:border-0">
                      <span className="text-[10px] font-black dark:text-white uppercase tracking-widest">{item.name}</span>
                      <span className="text-[10px] font-black text-indigo-500">${fmt(item.value / item.count)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* ── TAB: CLIENTES ── */}
        {tab === "clientes" && (
          <section className="space-y-5">
            {metrics.clientes.length === 0 ? (
              <EmptyState year={anio} />
            ) : (
              <>
                <div className="bg-[var(--card-light)] dark:bg-zinc-900 rounded-2xl border border-[var(--border-light)] dark:border-zinc-800 shadow-lg overflow-hidden animate-reveal">
                  <div className="px-6 py-5 border-b border-[var(--border-light)] dark:border-zinc-800">
                    <h2 className="text-xs font-black uppercase tracking-tighter dark:text-white italic">Top Clientes</h2>
                    <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Ranking por facturación {anio}</p>
                  </div>
                  {metrics.clientes.map((c, i) => (
                    <div key={i} className="px-6 py-4 flex items-center gap-4 border-b border-[var(--border-light)] dark:border-zinc-900/40 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                      <span className={`text-lg font-black italic ${i === 0 ? "text-amber-500" : i === 1 ? "text-zinc-400" : i === 2 ? "text-amber-700" : "text-zinc-600 dark:text-zinc-500"}`}>
                        #{i + 1}
                      </span>
                      <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-sm shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black dark:text-white uppercase tracking-widest truncate">{c.name}</p>
                        <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">
                          {c.count} servicio{c.count !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 italic shrink-0">${fmt(c.total)}</p>
                    </div>
                  ))}
                </div>

                {/* Estadísticas de clientes */}
                <div className="grid grid-cols-2 gap-3 animate-reveal" style={{ animationDelay: "100ms" }}>
                  <div className="bg-[var(--card-light)] dark:bg-zinc-900 p-5 rounded-2xl border border-[var(--border-light)] dark:border-zinc-800">
                    <p className="text-[8px] font-black uppercase tracking-widest text-zinc-500 mb-2">Clientes únicos</p>
                    <p className="text-2xl font-black italic text-indigo-500">{metrics.clientes.length}</p>
                  </div>
                  <div className="bg-[var(--card-light)] dark:bg-zinc-900 p-5 rounded-2xl border border-[var(--border-light)] dark:border-zinc-800">
                    <p className="text-[8px] font-black uppercase tracking-widest text-zinc-500 mb-2">LTV promedio</p>
                    <p className="text-2xl font-black italic text-rose-500">
                      ${fmt(metrics.clientes.reduce((a, c) => a + c.total, 0) / (metrics.clientes.length || 1))}
                    </p>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

      </main>

      {/* MODAL METAS */}
      {showMetaModal && (
        <MetaModal
          metas={metas}
          saving={saving}
          anio={anio}
          onSave={(m) => { saveMetas(m); setShowMetaModal(false); }}
          onClose={() => setShowMetaModal(false)}
        />
      )}

      <style>{`
        @keyframes reveal { 
          from { opacity: 0; transform: translateY(18px); filter: blur(4px); } 
          to   { opacity: 1; transform: translateY(0);    filter: blur(0); } 
        }
        .animate-reveal { animation: reveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTES
───────────────────────────────────────────── */

function KPITile({ titulo, valor, sub, delta, color, icon }) {
  const colorMap = {
    indigo:  { text: "text-indigo-500",  bg: "bg-indigo-50 dark:bg-indigo-500/10",   border: "border-indigo-500/20" },
    rose:    { text: "text-rose-500",    bg: "bg-rose-50 dark:bg-rose-500/10",       border: "border-rose-500/20" },
    emerald: { text: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-500/20" },
    amber:   { text: "text-amber-500",   bg: "bg-amber-50 dark:bg-amber-500/10",     border: "border-amber-500/20" },
  };
  const t = colorMap[color] || colorMap.indigo;
  const hasDelta = delta !== null && delta !== undefined;
  const isPos    = hasDelta && Number(delta) > 0;

  return (
    <div className={`relative overflow-hidden bg-[var(--card-light)] dark:bg-zinc-900 p-5 rounded-2xl border ${t.border} dark:border-zinc-800 shadow-md flex flex-col justify-between h-32`}>
      <div className={`absolute -top-5 -right-5 w-16 h-16 rounded-full blur-2xl opacity-50 ${t.bg.split(" ")[1]}`} />
      <div className="relative z-10 flex justify-between items-start">
        <p className="text-[8px] font-black uppercase text-zinc-500 tracking-widest leading-tight max-w-[70%]">{titulo}</p>
        <span className="text-sm opacity-70">{icon}</span>
      </div>
      <div className="relative z-10">
        <p className={`text-xl font-black tracking-tighter italic ${t.text} truncate leading-none mb-1.5`}>{valor}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-block px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${t.bg} ${t.text}`}>{sub}</span>
          {hasDelta && (
            <span className={`inline-block px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${isPos ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-100 dark:bg-red-500/10 text-red-500"}`}>
              {isPos ? "+" : ""}{delta}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaBar({ label, current, target, progress, color }) {
  const done = target > 0 && current >= target;
  return (
    <div>
      <div className="flex justify-between items-end mb-2">
        <div className="flex items-center gap-2">
          <p className="text-[9px] font-black uppercase tracking-widest dark:text-white">{label}</p>
          {done && <span className="text-[8px] bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-black uppercase tracking-widest">✓ Meta alcanzada</span>}
        </div>
        <p className="text-[9px] font-black text-zinc-400">
          {target > 0 ? `$${fmt(current)} / $${fmt(target)}` : <span className="text-indigo-400 italic">Sin meta</span>}
        </p>
      </div>
      <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
        {target > 0 && (
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${progress}%`, backgroundColor: done ? "#10b981" : color }}
          />
        )}
      </div>
      {target > 0 && (
        <p className="text-[7px] font-black text-zinc-400 uppercase tracking-widest mt-1 text-right">
          {progress.toFixed(1)}%{!done && target > current && ` · Faltan $${fmt(target - current)}`}
        </p>
      )}
    </div>
  );
}

function ServiceRow({ job }) {
  return (
    <div className="group bg-[var(--card-light)] dark:bg-zinc-900 p-4 rounded-2xl border border-[var(--border-light)] dark:border-zinc-800 flex justify-between items-center hover:border-indigo-500/30 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-lg group-hover:scale-110 transition-transform shrink-0">💼</div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest dark:text-white italic truncate w-36">{job.problemType}</p>
          <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
            {new Date(job.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "long" })} · {job.clientName}
          </p>
        </div>
      </div>
      <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 italic shrink-0">
        +${fmt(job.proposedPrice)}
      </p>
    </div>
  );
}

function ComparativaTooltip({ active, payload, label, anio }) {
  if (!active || !payload?.length) return null;
  const curr = payload.find((p) => p.dataKey === "total");
  const prev = payload.find((p) => p.dataKey === "prev");
  const diff = curr && prev ? curr.value - prev.value : null;
  return (
    <div className="bg-zinc-900/92 backdrop-blur-xl text-white p-4 rounded-2xl shadow-2xl border border-white/10 min-w-[160px]">
      <p className="text-[8px] font-black uppercase text-zinc-400 tracking-widest mb-3">{label}</p>
      {curr && <div className="flex justify-between gap-4 mb-1"><span className="text-[9px] text-indigo-400 font-black uppercase tracking-widest">{anio}</span><span className="text-sm font-black italic">${fmt(curr.value)}</span></div>}
      {prev && <div className="flex justify-between gap-4 mb-2"><span className="text-[9px] text-zinc-500 font-black uppercase tracking-widest">{anio - 1}</span><span className="text-sm font-black italic text-zinc-400">${fmt(prev.value)}</span></div>}
      {diff !== null && prev?.value > 0 && (
        <div className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg text-center mt-1 ${diff >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
          {diff >= 0 ? "+" : ""}{fmt(diff)} vs año anterior
        </div>
      )}
    </div>
  );
}

function MetaModal({ metas, saving, anio, onSave, onClose }) {
  const [anual,   setAnual]   = useState(metas.anual   || "");
  const [mensual, setMensual] = useState(metas.mensual || "");

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md bg-[var(--card-light)] dark:bg-zinc-900 rounded-t-3xl border-t border-[var(--border-light)] dark:border-zinc-800 p-6 pb-10 shadow-2xl animate-reveal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto mb-6" />
        <h2 className="text-sm font-black uppercase tracking-tighter dark:text-white italic mb-1">Metas {anio}</h2>
        <p className="text-[8px] text-zinc-400 font-bold uppercase tracking-widest mb-6">Define tus objetivos de facturación</p>

        <div className="space-y-4">
          <div>
            <label className="text-[8px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">Meta anual ($)</label>
            <input
              type="number"
              value={anual}
              onChange={(e) => setAnual(e.target.value)}
              placeholder="Ej: 5000000"
              className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
            />
          </div>
          <div>
            <label className="text-[8px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">Meta mensual ($)</label>
            <input
              type="number"
              value={mensual}
              onChange={(e) => setMensual(e.target.value)}
              placeholder="Ej: 400000"
              className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
            />
          </div>
        </div>

        <button
          onClick={() => onSave({ anual: Number(anual) || 0, mensual: Number(mensual) || 0 })}
          disabled={saving}
          className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest py-4 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-indigo-500/30"
        >
          {saving ? "Guardando..." : "Guardar metas"}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ year }) {
  return (
    <div className="bg-[var(--card-light)] dark:bg-zinc-900/50 p-14 rounded-2xl text-center border border-dashed border-[var(--border-light)] dark:border-zinc-800/50 animate-reveal">
      <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-5">
        <span className="text-2xl opacity-40">📂</span>
      </div>
      <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest italic">Sin registros en {year}</p>
      <p className="text-[8px] text-zinc-400 mt-2 max-w-[180px] mx-auto font-medium">
        Completa solicitudes para generar métricas en este período.
      </p>
    </div>
  );
}

function SkeletonScreen() {
  return (
    <div className="min-h-screen bg-[var(--bg-light)] dark:bg-zinc-950 px-5 pt-20 pb-10">
      <div className="max-w-md mx-auto space-y-5">
        <div className="flex justify-between items-center mb-8">
          <div className="w-9 h-9 bg-zinc-200 dark:bg-zinc-900 rounded-xl animate-pulse" />
          <div className="w-28 h-5 bg-zinc-200 dark:bg-zinc-900 rounded-full animate-pulse" />
          <div className="w-24 h-9 bg-zinc-200 dark:bg-zinc-900 rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-zinc-200 dark:bg-zinc-900/50 rounded-2xl animate-pulse border border-zinc-100 dark:border-zinc-800/50" />)}
        </div>
        <div className="h-56 bg-zinc-200 dark:bg-zinc-900/50 rounded-2xl animate-pulse border border-zinc-100 dark:border-zinc-800/50" />
        <div className="h-40 bg-zinc-200 dark:bg-zinc-900/50 rounded-2xl animate-pulse border border-zinc-100 dark:border-zinc-800/50" />
      </div>
    </div>
  );
}