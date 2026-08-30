import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// Home se carga de forma inmediata (eager): es la primera pantalla que
// ve cualquier visitante, así que no tiene sentido mostrar un loader
// para ella. El resto de las páginas se cargan bajo demanda (code
// splitting por ruta) para no obligar a descargar ~1.9 MB de JS antes
// de poder interactuar con la portada.
import Home from "./pages/Home";

const Solicitar             = lazy(() => import("./pages/Solicitar"));
const Login                 = lazy(() => import("./pages/Login"));
const Register              = lazy(() => import("./pages/Register"));
const RegisterProfesional   = lazy(() => import("./pages/RegisterProfesional"));
const Dashboard             = lazy(() => import("./pages/Dashboard"));
const ProfesionalProfile    = lazy(() => import("./pages/ProfesionalProfile"));
const PerfilProfesional     = lazy(() => import("./pages/PerfilProfesional"));
const PerfilCliente         = lazy(() => import("./pages/PerfilCliente"));
const Admin                 = lazy(() => import("./pages/Admin"));
const Terminos              = lazy(() => import("./pages/Terminos"));
const ChatPage               = lazy(() => import("./pages/Chatpage"));
const ComprarCreditos       = lazy(() => import("./pages/ComprarCreditos"));
const MisSolicitudes        = lazy(() => import("./pages/MisSolicitudes"));
const ServiciosDisponibles  = lazy(() => import("./pages/ServiciosDisponibles"));
const MisTrabajos           = lazy(() => import("./pages/MisTrabajos"));
const HistorialProfesional  = lazy(() => import("./pages/HistorialProfesional"));
const AnalisisProfesional   = lazy(() => import("./pages/AnalisisProfesional"));
const SobreNosotros         = lazy(() => import("./pages/SobreNosotros"));
const Contacto               = lazy(() => import("./pages/Contacto"));
const Privacidad            = lazy(() => import("./pages/Privacidad"));
const CentroAyuda           = lazy(() => import("./pages/CentroAyuda"));
const BilleteraPro           = lazy(() => import("./pages/BilleteraPro"));
const VerificacionExitosa   = lazy(() => import("./pages/VerificacionExitosa"));
const PagoSimulado          = lazy(() => import("./pages/PagoSimulado"));
const NotFound               = lazy(() => import("./pages/NotFound"));
const Notifications          = lazy(() => import("./pages/Notifications"));
const ClientProfile          = lazy(() => import("./pages/ClientProfile"));


// COMPONENTES GLOBALES
import RequireRole from "./components/RequireRole";
import ThemeToggle from "./components/ThemeToggle";
import Layout from "./components/Layout";
import ScrollToTop from "./components/ScrollToTop"; 
import { useUser } from "./context/UserContext";

// ===============================
// ⏳ Loader mostrado mientras se descarga el chunk de una ruta
// ===============================
function RouteLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
      <div className="w-8 h-8 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin" />
    </div>
  );
}



// ===============================
// 🔁 Componente para redirigir según rol
// ===============================
function SmartDashboardRedirect() {
  const { user } = useUser();

  if (!user) return <Navigate to="/login" replace />;

  if (user.role === "cliente") return <Navigate to="/cliente/dashboard" replace />;
  if (user.role === "profesional") return <Navigate to="/prof/dashboard" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;

  return <Navigate to="/" replace />;
}

export default function App() {
  return (
    <div className="relative min-h-screen">
      
      <ScrollToTop />

      {/* Botón Global de Tema */}
      <ThemeToggle />

      <Suspense fallback={<RouteLoader />}>
      <Routes>
        {/* ======================================================== */}
        {/* 🔵 RUTAS PÚBLICAS (SIN MENÚ INFERIOR) */}
        {/* ======================================================== */}
        <Route path="/" element={<Home />} />
        <Route path="/sobre-nosotros" element={<SobreNosotros />} />
        <Route path="/terminos" element={<Terminos />} />
        <Route path="/contacto" element={<Contacto />} />
        <Route path="/privacidad" element={<Privacidad />} />
        <Route path="/ayuda" element={<CentroAyuda />} />
        <Route path="/login" element={<Login />} />
        <Route path="/registro" element={<Register />} />
        <Route path="/registro-profesional" element={<RegisterProfesional />} />
        <Route path="/verificacion-exitosa" element={<VerificacionExitosa />} />
        <Route path="/pago-simulado/:paymentId" element={<PagoSimulado />} />
        
        {/* Redirecciones Legacy */}
        <Route path="/gasfiter/login" element={<Navigate to="/login" replace />} />
        <Route path="/gasfiter/registro" element={<Navigate to="/registro" replace />} />
        <Route path="/cliente/login" element={<Navigate to="/login" replace />} />
        <Route path="/cliente/registro" element={<Navigate to="/registro" replace />} />
        
        {/* ======================================================== */}
        {/* 📱 RUTAS CON MENÚ INFERIOR (LAYOUT GLOBAl) */}
        {/* ======================================================== */}
        <Route element={<Layout />}>
            
            {/* 🟣 DASHBOARD UNIFICADO */}
            <Route path="/dashboard" element={<SmartDashboardRedirect />} />

            {/* 🔥 RUTA DE NOTIFICACIONES (Universal para ambos roles) */}
            <Route path="/notificaciones" element={
                <RequireRole allowed={["cliente", "profesional"]}> <Notifications /> </RequireRole>
            } />

            {/* --- RUTAS CLIENTE --- */}
            <Route path="/cliente/dashboard" element={
                <RequireRole allowed={["cliente"]}> <Dashboard /> </RequireRole>
            } />
            <Route path="/mis-solicitudes" element={
                <RequireRole allowed={["cliente"]}> <MisSolicitudes /> </RequireRole>
            } />
            <Route path="/solicitar" element={
                <RequireRole allowed={["cliente"]}> <Solicitar /> </RequireRole>
            } />
            <Route path="/cliente/perfil" element={
                <RequireRole allowed={["cliente"]}> <PerfilCliente /> </RequireRole>
            } />


            {/* --- RUTAS PROFESIONAL --- */}
            <Route path="/prof/dashboard" element={
                <RequireRole allowed={["profesional"]}> <Dashboard /> </RequireRole>
            } />
            <Route path="/prof/perfil" element={
                <RequireRole allowed={["profesional"]}> <PerfilProfesional /> </RequireRole>
            } />
            
            <Route path="/perfil" element={<Navigate to="/prof/perfil" replace />} />

            <Route path="/prof/trabajos" element={
                <RequireRole allowed={["profesional"]}> <MisTrabajos /> </RequireRole>
            } />
            <Route path="/mis-trabajos" element={<Navigate to="/prof/trabajos" replace />} />

            <Route path="/servicios-disponibles" element={
                <RequireRole allowed={["profesional"]}> <ServiciosDisponibles /> </RequireRole>
            } />
            <Route path="/historial-profesional" element={
                <RequireRole allowed={["profesional"]}> <HistorialProfesional /> </RequireRole>
            } />
            <Route path="/analisis-rendimiento" element={
                <RequireRole allowed={["profesional"]}> <AnalisisProfesional /> </RequireRole>
            } />
            <Route path="/comprar-creditos" element={
                <RequireRole allowed={["profesional"]}> <ComprarCreditos /> </RequireRole>
            } />

            {/* ✅ BILLETERA PRO INTEGRADA AQUÍ */}
            <Route path="/prof/billetera" element={
                <RequireRole allowed={["profesional"]}> <BilleteraPro /> </RequireRole>
            } />

            {/* 🔥 NUEVA RUTA: PERFIL PÚBLICO DEL CLIENTE (Visto por el Pro) */}
            <Route path="/client-profile/:uid" element={
                <RequireRole allowed={["profesional"]}> <ClientProfile /> </RequireRole>
            } />

            {/* 💬 CHAT */}
            <Route path="/chat/:requestId" element={
                <RequireRole allowed={["cliente", "profesional"]}> <ChatPage /> </RequireRole>
            } />

        </Route> {/* FIN DEL LAYOUT */}


        {/* ======================================================== */}
        {/* 🔴 RUTAS SIN MENÚ (ADMIN / EXTERNAS) */}
        {/* ======================================================== */}
        
        <Route path="/profesional/:id" element={<ProfesionalProfile />} />

        <Route path="/admin" element={
            <RequireRole allowed={["admin"]}> <Admin /> </RequireRole>
        } />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />

      </Routes>
      </Suspense>
    </div>
  );
}