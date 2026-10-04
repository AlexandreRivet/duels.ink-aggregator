/**
 * Renders the d3 charts to PNG without a browser (Node only):
 * jsdom gives d3 a DOM, resvg rasterises the SVG with the bundled Inter font.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { JSDOM } from 'jsdom';

const FONT_DIR = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));
const FONT_FILES = ['Inter_400Regular.ttf', 'Inter_500Medium.ttf', 'Inter_600SemiBold.ttf'].map(
  (file) => path.join(FONT_DIR, file),
);

export function createDocument() {
  return new JSDOM('<!doctype html><html><body></body></html>').window.document;
}

/** Serialises an <svg> built in jsdom and rasterises it (×2 for high-density screens). */
export function svgToPng(svgNode, { scale = 2 } = {}) {
  const { XMLSerializer } = svgNode.ownerDocument.defaultView;
  const xml = new XMLSerializer().serializeToString(svgNode);
  const resvg = new Resvg(xml, {
    fitTo: { mode: 'zoom', value: scale },
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Inter' },
  });
  return resvg.render().asPng();
}
