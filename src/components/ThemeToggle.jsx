import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";

export default function ThemeToggle() {
  const { dark, setDark } = useTheme();
  
  // Posición inicial: Esquina superior izquierda (pero un poco separado del borde)
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [isDragging, setIsDragging] = useState(false);

  // Lógica para arrastrar en móviles (Touch) y PC (Mouse)
  const handleDrag = (e) => {
    if (!isDragging) return;
    
    // Detectar si es touch o mouse
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Calcular nueva posición restando la mitad del botón (24px) para centrarlo al dedo/cursor
    setPosition({
      x: clientX - 24,
      y: clientY - 24
    });
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleDrag);
      window.addEventListener("touchmove", handleDrag);
      window.addEventListener("mouseup", () => setIsDragging(false));
      window.addEventListener("touchend", () => setIsDragging(false));
    }
    return () => {
      window.removeEventListener("mousemove", handleDrag);
      window.removeEventListener("touchmove", handleDrag);
    };
  }, [isDragging]);

  return (
    <div
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: "none", // Evita que el scroll del celular interfiera al arrastrar
      }}
      className="fixed z-[9999] transition-[transform] duration-75"
    >
      <button
        onMouseDown={() => setIsDragging(true)}
        onTouchStart={() => setIsDragging(true)}
        onClick={() => {
          // Solo cambia el tema si no se estaba arrastrando (evita clicks accidentales)
          if (!isDragging) setDark(!dark);
        }}
        className={`flex h-12 w-12 items-center justify-center 
                   rounded-2xl bg-white dark:bg-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border 
                   border-slate-200 dark:border-slate-700 transition-transform 
                   ${isDragging ? 'scale-125 cursor-grabbing' : 'hover:scale-110 active:scale-95 cursor-grab'}`}
        aria-label="Cambiar Tema"
      >
        <div className="relative w-6 h-6 flex items-center justify-center pointer-events-none">
          {/* Sol */}
          <span className={`absolute transition-all duration-500 ${dark ? 'opacity-100 rotate-0 scale-100 text-yellow-400' : 'opacity-0 -rotate-90 scale-0'}`}>
            ☀️
          </span>
          {/* Luna */}
          <span className={`absolute transition-all duration-500 ${!dark ? 'opacity-100 rotate-0 scale-100 text-blue-400' : 'opacity-0 rotate-90 scale-0'}`}>
            🌙
          </span>
        </div>
      </button>
    </div>
  );
}