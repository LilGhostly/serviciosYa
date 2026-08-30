// src/components/RequireRole.jsx
import { useUser } from "../context/UserContext";
import { Navigate, useLocation } from "react-router-dom";

export default function RequireRole({ children, allowed }) {
  const { user, loading } = useUser();
  const location = useLocation();

  // 🔄 1. Esperar carga inicial
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Verificando sesión...
      </div>
    );
  }

  // 🔄 2. Esperar a que user exista y tenga role
  if (!user || !user.role) {
    return (
      <Navigate
        to={`/login?redirect=${location.pathname}`}
        replace
      />
    );
  }

  // ❌ 3. Rol no permitido
  if (!allowed.includes(user.role)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-slate-600 text-center p-6">
        <h2 className="text-xl font-semibold mb-2">Acceso restringido</h2>
        <p className="text-sm opacity-80 mb-4">
          Tu cuenta no tiene permisos para acceder a esta sección.
        </p>

        <a
          href="/"
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 transition"
        >
          Ir al inicio
        </a>
      </div>
    );
  }

  // ✔ 4. Todo OK → mostrar contenido
  return children;
}
