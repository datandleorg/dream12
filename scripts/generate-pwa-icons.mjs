/**
 * Generates square PWA icons from public/pwa-icon-source.png.
 * Run: node scripts/generate-pwa-icons.mjs
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const logoPath = path.join(publicDir, "pwa-icon-source.png");
const iconsDir = path.join(publicDir, "icons");
const BG = { r: 22, g: 28, b: 46, alpha: 1 }; // #161c2e

async function squareIcon(size, innerPadding) {
  const inner = size - innerPadding * 2;
  const logoBuf = await sharp(logoPath)
    .resize(inner, inner, { fit: "inside" })
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: logoBuf, gravity: "center" }])
    .png();
}

async function main() {
  await mkdir(iconsDir, { recursive: true });

  await (await squareIcon(192, 16)).toFile(path.join(iconsDir, "icon-192.png"));
  await (await squareIcon(512, 48)).toFile(path.join(iconsDir, "icon-512.png"));
  // Maskable safe zone ~80% — extra padding for adaptive icons
  await (await squareIcon(512, 88)).toFile(
    path.join(iconsDir, "icon-512-maskable.png"),
  );

  console.log("Wrote public/icons/icon-192.png, icon-512.png, icon-512-maskable.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
