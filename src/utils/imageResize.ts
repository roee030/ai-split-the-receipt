/**
 * Prepares a receipt image for OCR.
 *
 * Digital Darkroom pipeline:
 *  1. 4× upscale (MAX 3200px longest side) — more pixels per glyph
 *  2. Grayscale + Contrast 200% — paper → pure white, ink → pure black
 *  3. PNG output (lossless)
 */
export async function prepareImage(
  file: File
): Promise<{ blob: Blob; mimeType: string }> {
  const img = await createImageBitmap(file);

  // 4× target — cap at 3200px so we don't blow up memory / API limits
  const MAX = 3200;
  const longest = Math.max(img.width, img.height);
  const scale = longest > MAX ? MAX / longest : Math.min(4, MAX / longest);

  const w = Math.round(img.width  * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Digital Darkroom: grayscale removes color noise, contrast 200% crushes
  // thermal-print grey ink to pure black and bleaches the paper to pure white.
  ctx.filter = 'grayscale(100%) contrast(200%)';
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob>((res) =>
    canvas.toBlob(res as BlobCallback, 'image/png')
  );

  return { blob: blob!, mimeType: 'image/png' };
}
