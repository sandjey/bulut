"use client";

/**
 * Read an image File and return a compressed base64 data URL.
 * Photos are resized to fit within `maxSize` px and re-encoded as JPEG so
 * they stay small enough to live inside the task row + offline cache.
 */
export async function compressImage(
  file: File,
  maxSize = 1400,
  quality = 0.72
): Promise<string> {
  const dataUrl = await readAsDataUrl(file);

  // SVG / GIF (animated) — keep as-is, they don't survive canvas re-encode well
  if (file.type === "image/svg+xml" || file.type === "image/gif") return dataUrl;

  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);

  const out = canvas.toDataURL("image/jpeg", quality);
  // if re-encoding somehow made it bigger, keep the smaller original
  return out.length < dataUrl.length ? out : dataUrl;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
