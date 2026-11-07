// Product pictures live in Google Drive (Karvio Shop › Images), shared view-by-link.
// Pictures are shrunk in the browser before upload, so a phone photo becomes ~150 KB.

export const imageUrl = (id, width = 400) => `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w${width}`;
export const imageList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

/** A picture file → JPEG data URL, longest side at most `max` pixels, on a white background (for transparent PNGs). */
export async function shrinkImage(file, max = 1400, quality = 0.85) {
  if (!file || !/^image\//.test(file.type)) throw new Error(`${file?.name || 'This file'} is not a picture`);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`${file.name} could not be opened as a picture`));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } finally { URL.revokeObjectURL(url); }
}
