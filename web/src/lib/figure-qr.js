import qrcode from '../../third-party/qrcode-generator/qrcode.mjs';
import { publicFigureLink } from './figure-info.js';

// Only the public, fixed-host information link enters the QR encoder.
// Rendering is entirely local; there is no external QR service or tag payload.
export function publicFigureQr(id) {
  const url = publicFigureLink(id);
  if (!url) return null;
  const code = qrcode(0, 'M');
  code.addData(url, 'Byte');
  code.make();
  const svg = code.createSvgTag({ cellSize: 6, margin: 24, scalable: true });
  return { url, dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    size: (code.getModuleCount() + 8) * 6 };
}
