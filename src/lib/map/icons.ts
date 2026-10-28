/**
 * Map marker icons: a symbol for each faith in a coloured disc, drawn as
 * vector paths at the screen's pixel ratio so they stay sharp on Retina.
 * Symbols are deliberately simple and widely used by communities themselves:
 *
 *   Christianity — cross            Islam — crescent
 *   Judaism — Star of David         Hinduism — diya (oil lamp)
 *   Buddhism — Dharma wheel         Sikhism — Khanda (ring and khanda blade)
 *   Shinto — torii gate             Jainism — ahimsa hand
 *   Bahá'í — nine-pointed star      Chinese traditions — yin and yang
 *   Zoroastrianism — sacred fire    Other — a simple light
 */
import { FAITHS, faithColor } from "../faiths";

type Ctx = CanvasRenderingContext2D;

/** Each draws in a 24x24 box centred on (12, 12), in white. */
const SYMBOLS: Record<string, (c: Ctx) => void> = {
  christianity(c) {
    c.fillRect(10.7, 4.5, 2.6, 15);
    c.fillRect(6.6, 8.6, 10.8, 2.6);
  },
  islam(c) {
    c.beginPath();
    c.arc(12, 12, 7, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = "destination-out";
    c.beginPath();
    c.arc(14.8, 10.6, 5.9, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = "source-over";
  },
  judaism(c) {
    c.lineWidth = 1.7;
    c.lineJoin = "round";
    for (const flip of [1, -1]) {
      c.beginPath();
      c.moveTo(12, 12 - 7.6 * flip);
      c.lineTo(12 + 6.6, 12 + 3.8 * flip);
      c.lineTo(12 - 6.6, 12 + 3.8 * flip);
      c.closePath();
      c.stroke();
    }
  },
  hinduism(c) {
    // Diya: a shallow lamp with a flame.
    c.beginPath();
    c.moveTo(4.5, 14);
    c.quadraticCurveTo(12, 21.5, 19.5, 14);
    c.quadraticCurveTo(12, 16.2, 4.5, 14);
    c.fill();
    c.beginPath();
    c.moveTo(12, 4);
    c.bezierCurveTo(15.4, 8.2, 14.6, 12.4, 12, 13);
    c.bezierCurveTo(9.4, 12.4, 8.6, 8.2, 12, 4);
    c.fill();
  },
  buddhism(c) {
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(12, 12, 6.6, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(12, 12, 1.8, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 1.2;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      c.beginPath();
      c.moveTo(12 + Math.cos(a) * 1.8, 12 + Math.sin(a) * 1.8);
      c.lineTo(12 + Math.cos(a) * 8.6, 12 + Math.sin(a) * 8.6);
      c.stroke();
    }
  },
  sikhism(c) {
    // Chakkar (ring) with the double-edged khanda through it.
    c.lineWidth = 1.7;
    c.beginPath();
    c.arc(12, 13, 5, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(12, 3.5);
    c.lineTo(13.5, 7);
    c.lineTo(13, 18.5);
    c.lineTo(12, 20.5);
    c.lineTo(11, 18.5);
    c.lineTo(10.5, 7);
    c.closePath();
    c.fill();
  },
  shinto(c) {
    c.beginPath();
    c.moveTo(3.5, 6.2);
    c.quadraticCurveTo(12, 8.2, 20.5, 6.2);
    c.lineTo(20.2, 8.4);
    c.quadraticCurveTo(12, 9.8, 3.8, 8.4);
    c.closePath();
    c.fill();
    c.fillRect(5.8, 10.6, 12.4, 1.5);
    c.fillRect(7.4, 8.6, 1.9, 11.5);
    c.fillRect(14.7, 8.6, 1.9, 11.5);
  },
  jainism(c) {
    // Ahimsa: a raised open hand with a wheel in the palm.
    c.beginPath();
    c.roundRect(7.4, 10, 9.2, 9.5, 2.6);
    c.fill();
    for (const [x, top] of [[7.4, 6], [9.8, 4.4], [12.2, 4], [14.6, 5]] as const) {
      c.beginPath();
      c.roundRect(x, top, 2, 8, 1);
      c.fill();
    }
    c.save();
    c.translate(16.4, 13.4);
    c.rotate(-0.6);
    c.beginPath();
    c.roundRect(0, -1, 4.2, 2, 1);
    c.fill();
    c.restore();
    c.globalCompositeOperation = "destination-out";
    c.lineWidth = 0.9;
    c.beginPath();
    c.arc(12, 14.6, 2.3, 0, Math.PI * 2);
    c.stroke();
    c.globalCompositeOperation = "source-over";
  },
  bahai(c) {
    c.beginPath();
    for (let i = 0; i < 18; i++) {
      const r = i % 2 ? 4.4 : 8.2;
      const a = -Math.PI / 2 + (i * Math.PI) / 9;
      c.lineTo(12 + Math.cos(a) * r, 12 + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  },
  chinese(c) {
    const r = 7;
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(12, 12, r, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(12, 12, r, -Math.PI / 2, Math.PI / 2);
    c.arc(12, 12 + r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true);
    c.arc(12, 12 - r / 2, r / 2, Math.PI / 2, -Math.PI / 2);
    c.fill();
    c.beginPath();
    c.arc(12, 12 + r / 2, 1.1, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = "destination-out";
    c.beginPath();
    c.arc(12, 12 - r / 2, 1.1, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = "source-over";
  },
  zoroastrianism(c) {
    c.beginPath();
    c.moveTo(12, 3.5);
    c.bezierCurveTo(17.5, 9, 17.5, 13.5, 15.6, 16.2);
    c.bezierCurveTo(14.8, 13.8, 13.6, 12.8, 13, 12.2);
    c.bezierCurveTo(13.4, 14.2, 12.6, 15.6, 12, 16.6);
    c.bezierCurveTo(11.4, 15.6, 10.6, 14.2, 11, 12.2);
    c.bezierCurveTo(10.4, 12.8, 9.2, 13.8, 8.4, 16.2);
    c.bezierCurveTo(6.5, 13.5, 6.5, 9, 12, 3.5);
    c.fill();
    c.fillRect(7.5, 17.6, 9, 1.8);
    c.fillRect(9, 19.4, 6, 1.4);
  },
  other(c) {
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 2.4 : 7.5;
      const a = -Math.PI / 2 + (i * Math.PI) / 4;
      c.lineTo(12 + Math.cos(a) * r, 12 + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  },
};

export interface IconImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** A faith marker: coloured disc, white symbol; landmarks get a gold ring. */
export function drawFaithIcon(faith: string, { pixelRatio = 2, landmark = false } = {}): IconImage {
  const css = landmark ? 34 : 24;
  const px = Math.round(css * pixelRatio);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const c = canvas.getContext("2d")!;
  c.scale(pixelRatio, pixelRatio);
  const mid = css / 2;

  // Disc with a soft shadow so it reads on bright imagery.
  c.shadowColor = "rgba(0,0,0,0.45)";
  c.shadowBlur = 2.5;
  c.shadowOffsetY = 0.6;
  c.fillStyle = faithColor(faith);
  c.beginPath();
  c.arc(mid, mid, mid - (landmark ? 3.2 : 1.6), 0, Math.PI * 2);
  c.fill();
  c.shadowColor = "transparent";
  c.lineWidth = landmark ? 2.4 : 1.4;
  c.strokeStyle = landmark ? "#ffd27a" : "rgba(255,255,255,0.92)";
  c.stroke();

  // Symbol, drawn on its own layer so cut-outs don't punch through the disc.
  const layer = document.createElement("canvas");
  layer.width = layer.height = px;
  const s = layer.getContext("2d")!;
  const scale = ((css - (landmark ? 9 : 6)) / 24) * pixelRatio;
  s.translate((px - 24 * scale) / 2, (px - 24 * scale) / 2);
  s.scale(scale, scale);
  s.fillStyle = s.strokeStyle = "#fff";
  (SYMBOLS[faith] ?? SYMBOLS.other)(s);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(layer, 0, 0);

  return { width: px, height: px, data: new Uint8Array(c.getImageData(0, 0, px, px).data.buffer) };
}

/** Every icon the map uses: faith-<key> and landmark-<key>. */
export function allFaithIcons(pixelRatio: number) {
  const out: { id: string; image: IconImage }[] = [];
  for (const f of [...FAITHS.map((f) => f.key), "mixed"]) {
    out.push({ id: `faith-${f}`, image: drawFaithIcon(f, { pixelRatio }) });
    out.push({ id: `landmark-${f}`, image: drawFaithIcon(f, { pixelRatio, landmark: true }) });
  }
  return out;
}

/** Small inline SVG-free preview for legends (data URL). */
export function faithIconUrl(faith: string, pixelRatio = 2) {
  const img = drawFaithIcon(faith, { pixelRatio });
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return canvas.toDataURL();
}
