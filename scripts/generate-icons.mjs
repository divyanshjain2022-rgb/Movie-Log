import sharp from "sharp";
import fs from "fs";

const BG = "#09090b";
const GOLD_A = "#fbbf24";
const GOLD_B = "#f59e0b";

// A clapperboard: dark slate bar with gold teeth over a solid gold body.
// Geometry is deliberately chunky — this has to survive being drawn at 48px
// in a home-screen grid, where thin strokes and interior detail turn to mush.
function mark(scale = 1, dx = 0, dy = 0) {
  return `
  <g transform="translate(${256 + dx} ${256 + dy}) scale(${scale}) translate(-256 -288)">
    <rect x="86" y="168" width="340" height="248" rx="30" fill="url(#gold)"/>
    <g clip-path="url(#board)">
      <rect x="86" y="168" width="340" height="88" fill="${BG}"/>
      <g fill="url(#gold)">
        <path d="M124 160 h44 l-30 104 h-44 Z"/>
        <path d="M204 160 h44 l-30 104 h-44 Z"/>
        <path d="M284 160 h44 l-30 104 h-44 Z"/>
        <path d="M364 160 h44 l-30 104 h-44 Z"/>
      </g>
    </g>
    <path d="M232 296 l72 44 -72 44 Z" fill="${BG}"/>
  </g>`;
}

const defs = `
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GOLD_A}"/>
      <stop offset="1" stop-color="${GOLD_B}"/>
    </linearGradient>
    <clipPath id="board">
      <rect x="86" y="168" width="340" height="248" rx="30"/>
    </clipPath>
  </defs>`;

// purpose "any": Android shows it unmasked, so the rounded corners must be ours.
const anyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${defs}
  <rect width="512" height="512" rx="112" fill="${BG}"/>${mark(1)}</svg>`;

// purpose "maskable": full bleed, mark inside the 80% safe circle.
const maskableIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${defs}
  <rect width="512" height="512" fill="${BG}"/>${mark(0.66)}</svg>`;

// iOS masks apple-touch-icon itself and dislikes transparency.
const appleIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${defs}
  <rect width="512" height="512" fill="${BG}"/>${mark(0.86)}</svg>`;

const jobs = [
  [anyIcon, "public/icon-192.png", 192],
  [anyIcon, "public/icon-512.png", 512],
  [maskableIcon, "public/icon-maskable-512.png", 512],
  [appleIcon, "public/apple-icon-180.png", 180],
  [anyIcon, "public/favicon-96.png", 96],
];

for (const [svg, out, size] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(out);
  console.log(`${out}  ${size}x${size}  ${fs.statSync(out).size} bytes`);
}
