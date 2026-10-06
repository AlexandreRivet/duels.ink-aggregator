/**
 * Proxy sheets: cards at their real size, 3 × 3 per A4 page, edge to edge so that one cut
 * separates two cards, with a cut guide along every card edge.
 */

// mm. Lorcana cards have the usual TCG size and full-bleed images.
export const CARD = { width: 63, height: 88 };
const PAGE = { width: 210, height: 297 };
const COLUMNS = 3;
const ROWS = 3;
export const CARDS_PER_PAGE = COLUMNS * ROWS;
// Cut guides (grey levels): light over the cards, whose black borders hide the edge between two
// cards, darker in the white margins. A cut a little off the line still lands on black.
const GUIDE = { width: 0.15, onCards: 190, inMargins: 120 };

/**
 * @param {{ id: string, count: number, jpeg: Uint8Array }[]} cards In print order; each image is
 *   embedded once, whatever its count.
 * @returns {Promise<ArrayBuffer>} The PDF.
 */
export async function proxySheets(cards) {
  // Loaded on first use: the page only needs it once the PDF is asked for
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const left = (PAGE.width - COLUMNS * CARD.width) / 2;
  const top = (PAGE.height - ROWS * CARD.height) / 2;
  const copies = cards.flatMap((card) => Array(card.count).fill(card));
  for (let first = 0; first < copies.length; first += CARDS_PER_PAGE) {
    if (first > 0) doc.addPage();
    const page = copies.slice(first, first + CARDS_PER_PAGE);
    page.forEach((card, slot) => {
      const x = left + (slot % COLUMNS) * CARD.width;
      const y = top + Math.floor(slot / COLUMNS) * CARD.height;
      doc.addImage(card.jpeg, 'JPEG', x, y, CARD.width, CARD.height, card.id, 'NONE');
    });
    // Over the images
    cutGuides(doc, left, top, Math.ceil(page.length / COLUMNS));
  }
  return doc.output('arraybuffer');
}

/**
 * Lines along the edges of the rows that hold cards (a last page may have fewer). In the margins
 * they run out to the page's edges, to line a ruler or a paper trimmer up.
 */
function cutGuides(doc, left, top, rows) {
  const right = left + COLUMNS * CARD.width;
  const bottom = top + rows * CARD.height;
  const xs = Array.from({ length: COLUMNS + 1 }, (_, i) => left + i * CARD.width);
  const ys = Array.from({ length: rows + 1 }, (_, i) => top + i * CARD.height);
  doc.setLineWidth(GUIDE.width);
  doc.setDrawColor(GUIDE.inMargins);
  for (const x of xs) {
    doc.line(x, 0, x, top);
    // In the bottom margin only, not across the empty rows of a last page
    doc.line(x, top + ROWS * CARD.height, x, PAGE.height);
  }
  for (const y of ys) {
    doc.line(0, y, left, y);
    doc.line(right, y, PAGE.width, y);
  }
  doc.setDrawColor(GUIDE.onCards);
  for (const x of xs) doc.line(x, top, x, bottom);
  for (const y of ys) doc.line(left, y, right, y);
}
