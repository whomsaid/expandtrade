/**
 * Client-side Canvas image optimizer for user profile photos.
 * Resizes images larger than maxDimension and encodes as compact WebP or JPEG
 * before upload, falling back cleanly to the original File if unsupported.
 */
export async function optimizeProfileImage(file, maxDimension = 512, quality = 0.85) {
  if (!file || typeof window === 'undefined' || typeof document === 'undefined') {
    return file;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return file;
  }
  // Skip optimization if already very small (< 120KB)
  if (file.size <= 120 * 1024) {
    return file;
  }

  let objectUrl = '';
  try {
    objectUrl = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objectUrl;
    });

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return file;

    const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const outputType = file.type === 'image/png' ? 'image/webp' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, outputType, quality));
    if (!blob || blob.size >= file.size) {
      return file;
    }

    const baseName = (file.name || 'avatar').replace(/\.[^.]+$/, '');
    const ext = outputType === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `${baseName}.${ext}`, { type: outputType, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
