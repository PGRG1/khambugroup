/**
 * Prepare an image file for upload/OCR.
 *
 * Source fidelity matters more than bytes: an invoice photo that is already a
 * reasonable size is uploaded untouched, so no OCR detail is destroyed by a
 * pointless re-encode. Only oversized images are resized, and then at high
 * JPEG quality. PDFs are never touched.
 */

export const MAX_DIMENSION = 3200; // Max width or height in pixels after resize
export const JPEG_QUALITY = 0.9; // High quality — text/digit legibility first
export const PRESERVE_MAX_BYTES = 4 * 1024 * 1024; // ~4MB
export const PRESERVE_MAX_DIMENSION = 3200;

/**
 * Pure decision helper: should this file be re-encoded at all?
 * An image is preserved as-is when it is within both the dimension and size budget.
 */
export function shouldRecompress(input: {
  type: string;
  size: number;
  width: number;
  height: number;
}): boolean {
  if (input.type === "application/pdf") return false;
  if (!input.type.startsWith("image/")) return false;
  const longestEdge = Math.max(input.width, input.height);
  if (longestEdge <= PRESERVE_MAX_DIMENSION && input.size <= PRESERVE_MAX_BYTES) return false;
  return true;
}

/** Pure helper: target dimensions after capping the longest edge at MAX_DIMENSION. */
export function targetDimensions(width: number, height: number): { width: number; height: number } {
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) return { width, height };
  if (width > height) {
    return { width: MAX_DIMENSION, height: Math.round((height * MAX_DIMENSION) / width) };
  }
  return { width: Math.round((width * MAX_DIMENSION) / height), height: MAX_DIMENSION };
}

export async function compressImageFile(file: File): Promise<File> {
  // Don't compress PDFs — return as-is
  if (file.type === "application/pdf") return file;

  // Only compress image types
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    if (!shouldRecompress({ type: file.type, size: file.size, width: bitmap.width, height: bitmap.height })) {
      return file;
    }

    const { width, height } = targetDimensions(bitmap.width, bitmap.height);
    let blob: Blob | null = null;

    if (typeof OffscreenCanvas !== "undefined") {
      try {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, width, height);
          blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
        }
      } catch { /* Fall back to a regular canvas if offscreen encoding is unavailable. */ }
    }

    if (!blob) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);
      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
      });
    }

    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, ".jpg");
    const compressed = new File([blob], name, { type: "image/jpeg" });
    return compressed.size < file.size ? compressed : file;
  } catch {
    return file; // Preserve the original if decoding or encoding fails.
  } finally {
    bitmap?.close();
  }
}
