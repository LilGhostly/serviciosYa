/**
 * src/data/categories.js
 *
 * Fuente única de verdad para los rubros/categorías de servicio de la
 * plataforma. Antes existían tres listas hardcodeadas y desincronizadas:
 *   - Home.jsx (ESPECIALIDADES)         → solo mostraba rubros del hogar
 *   - RegisterProfesional.jsx (RUBROS)  → solo permitía registrarse en rubros del hogar
 *   - Solicitar.jsx (RUBROS)            → ya incluía Belleza, Arte, Mascotas, etc.
 *
 * Esto era un bug real: un cliente podía pedir un "Tatuador/a" en Solicitar.jsx,
 * pero ningún tatuador podía registrarse como tal en RegisterProfesional.jsx,
 * porque esa pantalla no ofrecía esa opción.
 *
 * Este archivo unifica todo en una sola lista, y la amplía para reflejar el
 * alcance definido en el proyecto: "cualquier trabajo independiente presencial",
 * no solo servicios del hogar.
 */

import {
  Zap, Wrench, KeyRound, Hammer, ShowerHead, HardHat, PaintRoller, Blocks,
  Snowflake, Plug, Laptop, Router, Camera, Scissors, Sparkles, Hand, Palette,
  Wand2, Flower2, Feather, PenTool, Gem, PawPrint, Dog, GraduationCap, Car,
  Truck, Leaf, Search, Brain, Dumbbell, Music, Aperture, LayoutTemplate,
} from "lucide-react";

/**
 * Lista completa de rubros. Cada entrada define:
 *   - label: nombre visible del rubro (y valor guardado en Firestore)
 *   - icon:  componente de ícono (lucide-react)
 *   - cat:   categoría agrupadora, usada para filtrar en Solicitar.jsx
 */
export const RUBROS = [
  // Hogar
  { label: "Electricista",                 icon: Zap,            cat: "Hogar" },
  { label: "Gasfíter",                     icon: Wrench,         cat: "Hogar" },
  { label: "Cerrajero",                    icon: KeyRound,       cat: "Hogar" },
  { label: "Carpintero",                   icon: Hammer,         cat: "Hogar" },
  { label: "Plomero",                      icon: ShowerHead,     cat: "Hogar" },
  { label: "Limpieza profesional",         icon: Sparkles,       cat: "Hogar" },
  { label: "Control de plagas",            icon: Search,         cat: "Hogar" },

  // Construcción
  { label: "Maestro de obras",             icon: HardHat,        cat: "Construcción" },
  { label: "Pintor",                       icon: PaintRoller,    cat: "Construcción" },
  { label: "Albañil",                      icon: Blocks,         cat: "Construcción" },
  { label: "Soldador",                     icon: Hammer,         cat: "Construcción" },

  // Técnico
  { label: "Técnico en refrigeración",     icon: Snowflake,      cat: "Técnico" },
  { label: "Técnico en electrodomésticos", icon: Plug,           cat: "Técnico" },
  { label: "Técnico computacional",        icon: Laptop,         cat: "Técnico" },
  { label: "Técnico en redes",             icon: Router,         cat: "Técnico" },
  { label: "Instalador CCTV",              icon: Camera,         cat: "Técnico" },

  // Belleza y cuidado personal
  { label: "Barbero",                      icon: Scissors,       cat: "Belleza" },
  { label: "Peluquero/a",                  icon: Sparkles,       cat: "Belleza" },
  { label: "Manicurista",                  icon: Hand,           cat: "Belleza" },
  { label: "Maquillador/a",                icon: Palette,        cat: "Belleza" },
  { label: "Estilista",                    icon: Wand2,          cat: "Belleza" },
  { label: "Depilación",                   icon: Flower2,        cat: "Belleza" },
  { label: "Spa y masajes",                icon: Feather,        cat: "Belleza" },

  // Arte y cuerpo
  { label: "Tatuador/a",                   icon: PenTool,        cat: "Arte" },
  { label: "Body piercing",                icon: Gem,            cat: "Arte" },
  { label: "Diseñador gráfico",            icon: LayoutTemplate, cat: "Arte" },
  { label: "Fotógrafo/a",                  icon: Aperture,       cat: "Arte" },

  // Bienestar y salud (rubro ampliado en la propuesta de innovación)
  { label: "Psicólogo/a",                  icon: Brain,          cat: "Bienestar" },
  { label: "Entrenador/a personal",        icon: Dumbbell,       cat: "Bienestar" },
  { label: "Nutricionista",                icon: Leaf,           cat: "Bienestar" },

  // Educación
  { label: "Profesor particular",          icon: GraduationCap,  cat: "Educación" },
  { label: "Profesor de música",           icon: Music,          cat: "Educación" },

  // Mascotas
  { label: "Paseador de perros",           icon: PawPrint,       cat: "Mascotas" },
  { label: "Peluquero canino",             icon: Dog,            cat: "Mascotas" },

  // Transporte
  { label: "Conductor",                    icon: Car,            cat: "Transporte" },
  { label: "Fletes y mudanzas",            icon: Truck,          cat: "Transporte" },

  // Exterior
  { label: "Jardinería",                   icon: Leaf,           cat: "Exterior" },

  { label: "Otro",                         icon: Search,         cat: "General" },
];

/** Lista de categorías agrupadoras, derivada de RUBROS (con "Todos" al inicio). */
export const CATS = ["Todos", ...Array.from(new Set(RUBROS.map((r) => r.cat)))];

/** Lista plana de nombres de rubro, para <select> simples (ej. registro de profesional). */
export const RUBROS_LABELS = RUBROS.map((r) => r.label);

/**
 * Devuelve la definición completa (icono + categoría) de un rubro a partir
 * de su nombre. Útil quando solo se tiene el string guardado en Firestore.
 */
export function getRubroInfo(label) {
  return RUBROS.find((r) => r.label === label) || null;
}
