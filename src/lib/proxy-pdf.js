/**
 * Proxy sheets: cards at their real size, 3 × 3 per A4 page, edge to edge so that one cut
 * separates two cards, with cut marks in the margins along every card edge.
 */

// mm. Lorcana cards have the usual TCG size and full-bleed images.
export const CARD = { width: 63, height: 88 };
const PAGE = { width: 210, height: 297 };
const COLUMNS = 3;
const ROWS = 3;
export const CARDS_PER_PAGE = COLUMNS * ROWS;
// Cut marks: short lines starting a little away from the cards, long enough to line a ruler up.
const MARK = { gap: 1, length: 5, width: 0.2, color: 120 };

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
  copies.forEach((card, i) => {
    const slot = i % CARDS_PER_PAGE;
    if (slot === 0) {
      if (i > 0) doc.addPage();
      cutMarks(doc, left, top);
    }
    const x = left + (slot % COLUMNS) * CARD.width;
    const y = top + Math.floor(slot / COLUMNS) * CARD.height;
    doc.addImage(card.jpeg, 'JPEG', x, y, CARD.width, CARD.height, card.id, 'NONE');
  });
  return doc.output('arraybuffer');
}

/** Marks for the full grid, even on a last page that isn't full: they stay where cards would be. */
function cutMarks(doc, left, top) {
  const right = left + COLUMNS * CARD.width;
  const bottom = top + ROWS * CARD.height;
  doc.setLineWidth(MARK.width);
  doc.setDrawColor(MARK.color);
  for (let column = 0; column <= COLUMNS; column++) {
    const x = left + column * CARD.width;
    doc.line(x, top - MARK.gap - MARK.length, x, top - MARK.gap);
    doc.line(x, bottom + MARK.gap, x, bottom + MARK.gap + MARK.length);
  }
  for (let row = 0; row <= ROWS; row++) {
    const y = top + row * CARD.height;
    doc.line(left - MARK.gap - MARK.length, y, left - MARK.gap, y);
    doc.line(right + MARK.gap, y, right + MARK.gap + MARK.length, y);
  }
}
