import { Link, useLocation } from "react-router-dom";
import { useUser } from "../context/UserContext";

export default function BottomNav() {
  const { user } = useUser();
  const location = useLocation();
  const path = location.pathname;

  if (!user || user.role === 'admin') return null;

  const isActive = (route) => path === route;
  const userPhoto = user?.profile?.photoUrl || user?.photoURL;

  // Clases compartidas para los links
  const linkClass = (route) => `
    flex flex-col items-center gap-1.5 p-2 transition-all duration-500 relative
    ${isActive(route) 
      ? 'text-black dark:text-white scale-110' 
      : 'text-zinc-400 opacity-40 hover:opacity-100'}
  `;

  // Indicador de punto activo (punto minimalista debajo del icono)
  const ActiveDot = () => (
    <div className="absolute -bottom-1 w-1 h-1 bg-black dark:bg-white rounded-full animate-reveal" />
  );

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-white/80 dark:bg-black/80 backdrop-blur-2xl border-t border-[var(--border-light)] dark:border-[var(--border-dark)] flex justify-around items-center py-4 pb-8 z-50 transition-colors duration-500">
      
      {/* --- RENDERIZADO CONDICIONAL POR ROL --- */}
      
      {user.role === 'profesional' ? (
        <>
          <Link to="/prof/dashboard" className={linkClass('/prof/dashboard')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] italic">Inicio</span>
            {isActive('/prof/dashboard') && <ActiveDot />}
          </Link>

          <Link to="/servicios-disponibles" className={linkClass('/servicios-disponibles')}>
            <div className="relative">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-600 rounded-full border-2 border-white dark:border-black animate-pulse" />
            </div>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] italic">Bolsa</span>
            {isActive('/servicios-disponibles') && <ActiveDot />}
          </Link>

          <Link to="/prof/trabajos" className={linkClass('/prof/trabajos')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] italic">Agenda</span>
            {isActive('/prof/trabajos') && <ActiveDot />}
          </Link>
        </>
      ) : (
        <>
          <Link to="/solicitar" className={linkClass('/solicitar')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 4v16m8-8H4"/></svg>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] italic">Pedir</span>
            {isActive('/solicitar') && <ActiveDot />}
          </Link>

          <Link to="/mis-solicitudes" className={linkClass('/mis-solicitudes')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] italic">Pedidos</span>
            {isActive('/mis-solicitudes') && <ActiveDot />}
          </Link>

          <Link to="/cliente/dashboard" className={linkClass('/cliente/dashboard')}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] italic">Explorar</span>
            {isActive('/cliente/dashboard') && <ActiveDot />}
          </Link>
        </>
      )}

      {/* --- PERFIL (COMÚN PARA AMBOS) --- */}
      <Link 
        to={user.role === 'profesional' ? "/prof/perfil" : "/cliente/perfil"} 
        className={linkClass(user.role === 'profesional' ? "/prof/perfil" : "/cliente/perfil")}
      >
        <div className={`
          w-7 h-7 rounded-[0.75rem] overflow-hidden border transition-all duration-500
          ${isActive(user.role === 'profesional' ? "/prof/perfil" : "/cliente/perfil") 
            ? 'border-black dark:border-white ring-4 ring-black/5 dark:ring-white/10 scale-110' 
            : 'border-zinc-200 dark:border-zinc-800 grayscale opacity-60'}
        `}>
          {userPhoto ? (
            <img src={userPhoto} className="w-full h-full object-cover" alt="Perfil" />
          ) : (
            <div className="bg-zinc-100 dark:bg-zinc-800 w-full h-full flex items-center justify-center text-[10px] font-black italic">
              {(user.profile?.name || user.name) ? (user.profile?.name || user.name)[0] : "U"}
            </div>
          )}
        </div>
        <span className="text-[8px] font-black uppercase tracking-[0.2em] italic">Perfil</span>
        {isActive(user.role === 'profesional' ? "/prof/perfil" : "/cliente/perfil") && <ActiveDot />}
      </Link>

    </nav>
  );
}