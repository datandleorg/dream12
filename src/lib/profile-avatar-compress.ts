import {
  MAX_PROFILE_AVATAR_BYTES,
  MAX_PROFILE_AVATAR_INPUT_BYTES,
  PROFILE_AVATAR_CONTENT_TYPES,
} from "@/lib/profile-avatar-limits";

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });
}

async function encodeAt(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
): Promise<Blob> {
  const iw = bitmap.width;
  const ih = bitmap.height;
  const scale = Math.min(1, maxEdge / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not prepare image.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await canvasToJpegBlob(canvas, quality);
  if (!blob) {
    throw new Error("Could not compress image.");
  }
  return blob;
}

/**
 * Resize + JPEG encode in the browser until under {@link MAX_PROFILE_AVATAR_BYTES}.
 * Call only from client components (uses canvas / createImageBitmap).
 */
export async function compressProfileAvatarForUpload(file: File): Promise<Blob> {
  if (!(PROFILE_AVATAR_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    throw new Error("Use JPEG, PNG, or WebP.");
  }
  if (file.size > MAX_PROFILE_AVATAR_INPUT_BYTES) {
    throw new Error("Image must be 10 MB or smaller.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    let maxEdge = 1024;
    while (maxEdge >= 256) {
      let q = 0.92;
      while (q >= 0.42) {
        const blob = await encodeAt(bitmap, maxEdge, q);
        if (blob.size <= MAX_PROFILE_AVATAR_BYTES) {
          return blob;
        }
        q -= 0.07;
      }
      maxEdge = Math.floor(maxEdge * 0.75);
    }
    throw new Error("Could not compress image under 2 MB. Try a smaller or simpler photo.");
  } finally {
    bitmap.close();
  }
}
