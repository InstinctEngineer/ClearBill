export type PDFToImagesOptions = {
  scale?: number;
  onProgress?: (progress: { current: number; total: number }) => void;
  onStart?: (progress: { current: 0; total: number }) => void;
};

/**
 * Convert PDF to array of PNG data URLs
 *
 * @param pdf - PDF data as string (data URL or URL)
 * @param options - Configuration options
 * @returns Promise<string[]> - Array of PNG data URLs, one per page
 *
 * @example
 * ```typescript
 * const file = event.target.files[0];
 * const pdfUrl = URL.createObjectURL(file);
 * const images = await pdfToImages(pdfUrl, {
 *   scale: 2.0,
 *   onProgress: ({ current, total }) => console.log(`Processing page ${current} of ${total}`)
 * });
 * ```
 */
export async function pdfToImages(
  pdf: string,
  options?: PDFToImagesOptions
): Promise<string[]> {
  // Dynamically import pdfjs-dist only in browser
  const pdfjsLib = await import('pdfjs-dist/build/pdf');

  // Set worker source
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';

  const output: string[] = [];

  // Load PDF document
  const loadingTask = pdfjsLib.getDocument(pdf);
  const doc = await loadingTask.promise;

  // Notify start
  options?.onStart?.({ current: 0, total: doc.numPages });

  // Process each page
  for (let i = 1; i <= doc.numPages; i++) {
    const canvas = document.createElement('canvas');
    const page = await doc.getPage(i);
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Failed to get canvas 2D context');
    }

    // Get viewport with specified scale (default 2.0 for better OCR)
    const viewport = page.getViewport({ scale: options?.scale || 2 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Render PDF page to canvas
    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    // Notify progress
    options?.onProgress?.({ current: i, total: doc.numPages });

    // Convert canvas to PNG data URL
    output.push(canvas.toDataURL('image/png'));
  }

  return output;
}
