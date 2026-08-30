import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

export const createMercadoPagoPreference = async (requestId, price, title) => {
  try {
    const crearPagoFn = httpsCallable(functions, 'crearPago');

    const payload = {
      requestId: requestId,
      price: price,
      title: title,
      // Necesario para que, tanto en modo real como en modo simulado, la
      // persona sea redirigida de vuelta al mismo origen desde el que
      // inició el pago (localhost en desarrollo, el dominio real en
      // producción) en vez de a un dominio fijo.
      returnUrl: window.location.origin,
    };

    const result = await crearPagoFn(payload);
    return result.data;

  } catch (error) {
    console.error("Error al conectar con Mercado Pago:", error);
    throw error;
  }
};