import { createWorker, PSM, OEM } from 'tesseract.js';

export type OCRImagesOptions = {
  onProgress?: (progress: { current: number; total: number }) => void;
  onStart?: (progress: { current: 0; total: number }) => void;
  language?: string;
};

/**
 * Perform OCR on array of image URLs using Tesseract.js v6.x
 * Processes all images in parallel for better performance
 *
 * @param urls - Array of image URLs (data URLs or HTTP URLs)
 * @param options - Configuration options
 * @returns Promise<Record<string, string>> - Text indexed by page number (1-based)
 *
 * @example
 * ```typescript
 * const images = ['data:image/png;base64,...', 'data:image/png;base64,...'];
 * const results = await OCRImages(images, {
 *   language: 'eng',
 *   onProgress: ({ current, total }) => console.log(`OCR ${current}/${total}`)
 * });
 * // results = { "1": "page 1 text", "2": "page 2 text" }
 * ```
 */
export async function OCRImages(
  urls: string[],
  options?: OCRImagesOptions
): Promise<Record<string, string>> {
  options?.onStart?.({ current: 0, total: urls.length });

  const progress = { total: urls.length, current: 0 };
  const language = options?.language || 'eng';

  // Process all images in parallel using modern worker API
  const promises = urls.map(async (url) => {
    // Create worker for this image
    const worker = await createWorker(language);

    try {
      // Configure Tesseract for better receipt OCR
      // PSM.SINGLE_BLOCK = Assume a single uniform block of text (best for receipts)
      // OEM.LSTM_ONLY = LSTM neural net mode (best accuracy)
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,  // Single uniform block of text
        tessedit_ocr_engine_mode: OEM.LSTM_ONLY, // LSTM only
      });

      // Perform OCR
      const { data: { text } } = await worker.recognize(url);

      progress.current += 1;
      options?.onProgress?.(progress);

      return text;
    } finally {
      // Always terminate worker to free memory
      await worker.terminate();
    }
  });

  const texts = await Promise.all(promises);

  // Convert array to page-indexed object (1-based)
  return texts.reduce((acc, text, index) => {
    return { ...acc, [index + 1]: text };
  }, {} as Record<string, string>);
}
