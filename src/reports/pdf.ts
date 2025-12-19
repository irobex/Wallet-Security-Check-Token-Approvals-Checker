import { chromium } from "playwright";

export async function renderPdfFromHtml(html: string): Promise<Uint8Array> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" }
    });
    return pdf;
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}


