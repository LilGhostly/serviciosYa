/**
 * imageCompression.js
 *
 * Utilidades para comprimir imágenes en el navegador y guardarlas como
 * strings Base64 directamente en Firestore, en vez de subirlas a Firebase
 * Storage (que desde 2026 requiere el plan Blaze con tarjeta vinculada).
 *
 * Firestore tiene un límite duro de 1 MB por documento, así que estas
 * funciones comprimen agresivamente (reducen resolución y calidad JPEG)
 * hasta asegurar que el resultado quepa con margen — incluso cuando un
 * documento guarda varias fotos a la vez (ver Solicitar.jsx).
 */

const DEFAULT_MAX_DIMENSION = 900; // px, lado más largo de la imagen
const DEFAULT_MAX_BYTES = 300 * 1024; // ~300 KB por imagen comprimida
const DEFAULT_MIN_QUALITY = 0.35;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer la imagen."));
    img.src = src;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

/** Tamaño real en bytes de un dataURL base64 (aprox. 3 bytes por cada 4 chars). */
export function dataUrlSizeBytes(dataUrl) {
  const base64 = (dataUrl || "").split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

/**
 * Comprime una imagen (File/Blob o un dataURL, p. ej. el screenshot de
 * react-webcam) y devuelve un dataURL JPEG que no supera `maxBytes`.
 *
 * @param {File|Blob|string} input
 * @param {{ maxDimension?: number, maxBytes?: number, minQuality?: number }} options
 * @returns {Promise<string>} dataURL listo para guardar en Firestore o usar en <img src>
 */
export async function compressImageToDataUrl(input, options = {}) {
  const {
    maxDimension = DEFAULT_MAX_DIMENSION,
    maxBytes = DEFAULT_MAX_BYTES,
    minQuality = DEFAULT_MIN_QUALITY,
  } = options;

  const srcDataUrl = typeof input === "string" ? input : await fileToDataUrl(input);
  const img = await loadImage(srcDataUrl);

  let { width, height } = img;
  if (width >= height && width > maxDimension) {
    height = Math.round((height * maxDimension) / width);
    width = maxDimension;
  } else if (height > maxDimension) {
    width = Math.round((width * maxDimension) / height);
    height = maxDimension;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.75;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);

  while (dataUrlSizeBytes(dataUrl) > maxBytes && quality > minQuality) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  if (dataUrlSizeBytes(dataUrl) > maxBytes) {
    throw new Error(
      "No pudimos comprimir la imagen lo suficiente. Intenta con una foto más simple o de menor resolución."
    );
  }

  return dataUrl;
}
