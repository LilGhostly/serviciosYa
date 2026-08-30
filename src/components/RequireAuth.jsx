// src/components/RequireAuth.jsx
import { useUser } from "../context/UserContext";
import { Navigate, useLocation } from "react-router-dom";

export default function RequireAuth({ children }) {
  const { user, loading } = useUser();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Cargando…
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={`/login?redirect=${location.pathname}`}
        replace
      />
    );
  }

  return children;
}
