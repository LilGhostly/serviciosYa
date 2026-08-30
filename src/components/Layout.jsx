import { Outlet } from "react-router-dom";
import BottomNav from "./BottomNav"; // Asegúrate de haber creado el BottomNav del paso anterior

export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 transition-colors duration-500">
      {/* Outlet renderiza la página actual (Dashboard, Perfil, etc.) */}
      <Outlet />
      
      {/* El menú se muestra siempre encima, fijo abajo */}
      <BottomNav />
    </div>
  );
}