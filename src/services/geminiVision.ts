import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { ParsedReceipt } from '../types/receipt.types';

const scanReceiptFn = httpsCallable<
  { imageBase64: string; mimeType: string },
  ParsedReceipt
>(functions, 'scanReceipt');

export async function scanReceipt(
  imageBlob: Blob,
  mimeType: string
): Promise<ParsedReceipt> {
  const imageBase64 = await blobToBase64(imageBlob);
  const result = await scanReceiptFn({ imageBase64, mimeType });
  return result.data;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
