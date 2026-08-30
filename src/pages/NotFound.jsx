import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-6">
      <div className="max-w-sm w-full text-center">
        <p className="text-7xl font-black italic tracking-tighter text-zinc-200 dark:text-zinc-800 mb-4">
          404
        </p>
        <h1 className="text-lg font-black italic tracking-tight text-zinc-900 dark:text-white mb-2">
          Esta página no existe
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-8">
          El enlace que seguiste puede estar roto o la página fue movida.
        </p>
        <Link
          to="/"
          className="block w-full py-4 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-black text-sm active:scale-95 transition-transform"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
