/* Redimensionne et compresse une photo dans le navigateur avant envoi. */

function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => loadViaImage(file));
  }
  return loadViaImage(file);
}

function loadViaImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Lecture de l’image impossible'));
    reader.readAsDataURL(blob);
  });
}

/**
 * @returns {Promise<{blob: Blob, base64: string, ext: string, width: number, height: number, previewUrl: string}>}
 */
export async function compressImage(file, { maxSize = 1400, quality = 0.82 } = {}) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Choisis un fichier image (JPG, PNG, HEIC…).');
  const bitmap = await loadBitmap(file);
  const srcW = bitmap.width, srcH = bitmap.height;
  const scale = Math.min(1, maxSize / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  let blob = await toBlob(canvas, 'image/webp', quality);
  let ext = 'webp';
  if (!blob || blob.type !== 'image/webp') {
    blob = await toBlob(canvas, 'image/jpeg', quality);
    ext = 'jpg';
  }
  if (!blob) throw new Error('Compression impossible sur cet appareil.');

  const base64 = await blobToBase64(blob);
  return { blob, base64, ext, width: w, height: h, previewUrl: URL.createObjectURL(blob) };
}

export function formatBytes(n) {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}
