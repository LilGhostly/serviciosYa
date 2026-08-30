import { Component } from "react";

/**
 * Red de seguridad para toda la aplicación. Sin esto, si cualquier
 * componente lanza un error durante el render (una propiedad undefined,
 * un dato inesperado de Firestore, etc.), React desmonta el árbol
 * completo y el usuario ve una página en blanco, sin ningún mensaje ni
 * forma de recuperarse salvo recargar manualmente.
 *
 * Con este boundary, ese mismo error muestra una pantalla clara con la
 * opción de reintentar o volver al inicio, y el error queda registrado en
 * consola para depuración.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("💥 Error no controlado:", error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-6">
        <div className="max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-3xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">😕</span>
          </div>
          <h1 className="text-lg font-black italic tracking-tight text-zinc-900 dark:text-white mb-2">
            Algo salió mal
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-8">
            Ocurrió un error inesperado. Puedes volver al inicio e intentarlo
            de nuevo; si el problema persiste, cuéntanos qué estabas
            haciendo desde el Centro de Ayuda.
          </p>
          <button
            onClick={this.handleReload}
            className="w-full py-4 rounded-2xl bg-black dark:bg-white text-white dark:text-black font-black text-sm active:scale-95 transition-transform"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }
}
