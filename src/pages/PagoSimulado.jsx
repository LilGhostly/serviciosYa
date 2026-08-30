import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { ShieldCheck, CreditCard, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const CLP = (n) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n || 0);

/**
 * Checkout de prueba, equivalente al flujo real de Mercado Pago.
 *
 * Esta pantalla existe porque el proyecto corre en PAYMENTS_MODE=mock por
 * defecto (ver functions/index.js): el backend nunca llama a la API real
 * de Mercado Pago, así que no hace falta ninguna cuenta ni credencial de
 * pago para clonar este repositorio y probar la aplicación completa.
 * El resultado (aprobar/rechazar) aplica exactamente el mismo efecto que
 * aplicaría el webhook real: acredita créditos o marca la solicitud como
 * prioritaria (ver Cloud Function `confirmarPagoSimulado`).
 */
export default function PagoSimulado() {
  const { paymentId } = useParams();
  const navigate = useNavigate();

  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [outcome, setOutcome] = useState(null); // "approved" | "rejected" | null

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "mockPayments", paymentId));
        if (!snap.exists()) {
          setError("Este pago de prueba no existe o ya expiró.");
        } else {
          setPayment(snap.data());
        }
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar la información del pago.");
      } finally {
        setLoading(false);
      }
    })();
  }, [paymentId]);

  const resolve = async (approve) => {
    if (processing) return;
    setProcessing(true);
    setError("");
    try {
      const confirmarPago = httpsCallable(functions, "confirmarPagoSimulado");
      const { data } = await confirmarPago({ paymentId, approve });
      setOutcome(approve ? "approved" : "rejected");
      setTimeout(() => navigate(data.redirectPath || "/", { replace: true }), 1400);
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo procesar el pago de prueba.");
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error && !payment) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-zinc-950 px-6 text-center">
        <XCircle className="w-12 h-12 text-red-500" />
        <p className="text-zinc-600 dark:text-zinc-400 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4 py-10">
      <div className="w-full max-w-md">

        {/* Banner de contexto: checkout de prueba, no una pasarela real */}
        <div className="mb-4 flex items-center gap-2 justify-center text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
          <ShieldCheck className="w-4 h-4" />
          Checkout de prueba — sin cargo real
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-[2rem] shadow-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">

          {/* Header estilo pasarela de pago */}
          <div className="bg-zinc-900 dark:bg-black text-white px-8 py-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/50 font-bold">ServiciosYa Pay</p>
              <p className="text-sm font-black">Confirmar pago</p>
            </div>
          </div>

          <div className="px-8 py-8">
            {outcome ? (
              <div className="flex flex-col items-center text-center gap-3 py-6">
                {outcome === "approved" ? (
                  <CheckCircle2 className="w-14 h-14 text-emerald-500" />
                ) : (
                  <XCircle className="w-14 h-14 text-red-500" />
                )}
                <p className="text-lg font-black italic">
                  {outcome === "approved" ? "Pago aprobado" : "Pago rechazado"}
                </p>
                <p className="text-sm text-zinc-500">Redirigiendo...</p>
              </div>
            ) : (
              <>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-1">Detalle</p>
                <p className="text-base font-bold text-zinc-900 dark:text-white mb-6">{payment.title}</p>

                <div className="flex items-baseline justify-between border-t border-zinc-100 dark:border-zinc-800 pt-5 mb-8">
                  <span className="text-sm text-zinc-500 font-medium">Total a pagar</span>
                  <span className="text-3xl font-black tracking-tight">{CLP(payment.amount)}</span>
                </div>

                {error && (
                  <p className="text-xs text-red-500 font-medium mb-4 text-center">{error}</p>
                )}

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => resolve(true)}
                    disabled={processing}
                    className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm transition active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : "✅ Simular pago aprobado"}
                  </button>
                  <button
                    onClick={() => resolve(false)}
                    disabled={processing}
                    className="w-full py-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 text-zinc-700 dark:text-zinc-200 font-black text-sm transition active:scale-[0.98]"
                  >
                    ❌ Simular pago rechazado
                  </button>
                </div>

                <p className="text-[11px] text-zinc-400 text-center mt-6 leading-relaxed">
                  Esta pantalla reemplaza a la pasarela real de Mercado Pago mientras
                  el proyecto corre en modo de pagos de prueba. Ver <code>docs/PAGOS_Y_VERIFICACION.md</code>.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
