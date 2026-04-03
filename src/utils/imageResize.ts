/**
 * Prepares a receipt image for OCR.
 *
 * Strategy: minimal processing. Send the cleanest possible signal.
 *
 * - Resize to max 1600px (larger = more pixels per character = better OCR)
 * - NO filters, NO grayscale, NO contrast — every processing step risks
 *   smearing thin Hebrew thermal-print strokes before they reach the model
 * - PNG output (lossless) — JPEG compression creates block artefacts around
 *   fine strokes that corrupt Hebrew glyph recognition
 *
 * Caller signature unchanged: prepareImage(file) → { blob, mimeType }
 */
export async function prepareImage(
  file: File
): Promise<{ blob: Blob; mimeType: string }> {
  const img = await createImageBitmap(file);

  // Resize: cap longest side at 1600px; never upscale (no artefacts)
  const MAX = 1600;
  const longest = Math.max(img.width, img.height);
  const scale = longest > MAX ? MAX / longest : 1;

  const w = Math.round(img.width  * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Plain draw — no filters whatsoever
  ctx.drawImage(img, 0, 0, w, h);

  // PNG: lossless, no block artefacts around fine Hebrew strokes
  const blob = await new Promise<Blob>((res) =>
    canvas.toBlob(res as BlobCallback, 'image/png')
  );

  return { blob: blob!, mimeType: 'image/png' };
}
