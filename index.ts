const fs = require("fs");
import { spawn } from "node:child_process";
import { PNG } from "pngjs";
import simpleGit from "simple-git";

const CHAR_HEIGHT = 7;
const GAP = 1;
const FONT_ORDER = "#1234567890";

const CHAR_WIDTHS: { [key: string]: number } = {
  "#": 6,
  "1": 3,
  "2": 5,
  "3": 4,
  "4": 6,
  "5": 4,
  "6": 5,
  "7": 4,
  "8": 5,
  "9": 5,
  "0": 5,
};

// Calculate starting X position of each character
const CHAR_X_OFFSETS: { [key: string]: number } = {};
let xOffset = 0;
for (const char of FONT_ORDER) {
  CHAR_X_OFFSETS[char] = xOffset;
  xOffset += CHAR_WIDTHS[char]! + GAP;
}

function loadPNG(path: string): Promise<PNG> {
  return new Promise((resolve) => {
    const png = new PNG();
    fs.createReadStream(path)
      .pipe(png)
      .on("parsed", () => {
        resolve(png);
      });
  });
}

async function renderTextOntoImage(text: string, fontImg: PNG, targetImg: PNG, xStart: number, yStart: number): Promise<void> {
	const chars = text.split("");

  let drawX = xStart;

  for (const ch of text) {
    const charW = CHAR_WIDTHS[ch];
    const srcX = CHAR_X_OFFSETS[ch];
    if (charW === undefined || srcX === undefined) continue;

    for (let y = 0; y < CHAR_HEIGHT; y++) {
      for (let x = 0; x < charW; x++) {
        const srcIdx = ((y * fontImg.width) + (srcX + x)) << 2;
        const dstIdx = ((yStart + y) * targetImg.width + (drawX + x)) << 2;

        targetImg.data[dstIdx] = fontImg.data[srcIdx]!;
        targetImg.data[dstIdx + 1] = fontImg.data[srcIdx + 1]!;
        targetImg.data[dstIdx + 2] = fontImg.data[srcIdx + 2]!;
        targetImg.data[dstIdx + 3] = fontImg.data[srcIdx + 3]!;
      }
    }

    drawX += charW + 1;
  }

  // out.pack().pipe(fs.createWriteStream(outputPath));
}

const HALL_OF_SHAME = JSON.parse(fs.readFileSync("hallofshame.json", "utf8")) as number[];

type Color = [number, number, number, number]; // RGBA

function drawRect(png: PNG, x: number, y: number, w: number, h: number, rgba: Color): void {
	for (let yy = y; yy < y + h; yy++) {
		for (let xx = x; xx < x + w; xx++) {
			const idx = (yy * png.width + xx) << 2;
			png.data[idx] = rgba[0];
			png.data[idx + 1] = rgba[1];
			png.data[idx + 2] = rgba[2];
			png.data[idx + 3] = rgba[3];
		}
	}
}

const BLACK: Color = [0, 0, 0, 255];
const RED: Color = [237, 28, 36, 255];
const WHITE: Color = [255, 255, 255, 255];

function drawIntersectionPattern(canvas: PNG, centerX: number, centerY: number): void {
	const pattern = [
		{ dx: -1, dy: -1, color: BLACK },
		{ dx: 0, dy: -1, color: BLACK },
		{ dx: 1, dy: -1, color: BLACK },
		{ dx: -1, dy: 0, color: BLACK },
		{ dx: 0, dy: 0, color: RED },
		{ dx: 1, dy: 0, color: BLACK },
		{ dx: -1, dy: 1, color: BLACK },
		{ dx: 0, dy: 1, color: BLACK },
		{ dx: 1, dy: 1, color: BLACK },
	];

	for (const { dx, dy, color } of pattern) {
		const px = centerX + dx;
		const py = centerY + dy;
		if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;

		const idx = (py * canvas.width + px) << 2;
		canvas.data[idx] = color[0];
		canvas.data[idx + 1] = color[1];
		canvas.data[idx + 2] = color[2];
		canvas.data[idx + 3] = color[3];
	}
}

function drawAllIntersections(canvas: PNG, entryStarts: number[], rowStarts: number[], rows: number, entriesPerRow: number): void {
	const verticalBorders = [
		0, // left outer border
		entryStarts[1]! - 1,
		entryStarts[2]! - 2,
		entryStarts[3]! - 3,
		canvas.width - 1, // right outer border
	];

	const horizontalBorders = [
		0, // top outer border
		...rowStarts.slice(1).map(y => y - 1),
		canvas.height - 1, // bottom outer border
	];

	// Draw intersection patterns with edge adjustments
	for (const y of horizontalBorders) {
		for (const x of verticalBorders) {
			let adjustedX = x;
			let adjustedY = y;
			
			// Shift right if at left edge
			if (x === 0) adjustedX = x + 1;
			// Shift left if at right edge
			if (x === canvas.width - 1) adjustedX = x - 1;
			// Shift up if at top edge: INTENTIONAL
			if (y === 0) adjustedY = y - 1;
			// Shift up if at bottom edge
			if (y === canvas.height - 1) adjustedY = y - 1;
			
			drawIntersectionPattern(canvas, adjustedX, adjustedY);
		}
	}
}

async function drawHallOfShame() {
	const ENTRY_W = 32;
	const ENTRY_H = 9;
	const entriesPerRow = 4;
	const rows = Math.ceil(HALL_OF_SHAME.length / entriesPerRow) + 1;

	const canvas = new PNG({ width: 130, height: 1 + rows * (ENTRY_H + 1) });
	const font = await loadPNG("font.png");

	drawRect(canvas, 0, 0, 1, canvas.height, BLACK);
	drawRect(canvas, canvas.width - 1, 0, 1, canvas.height, BLACK);
	drawRect(canvas, 0, canvas.height - 2, canvas.width, 2, BLACK);

	// Calculate entry positions
	const entryStarts = [];
	let posX = 1; // after outer left border
	for (let e = 0; e < entriesPerRow; e++) {
		entryStarts.push(posX);
		const w = e === 0 ? ENTRY_W - 1 : ENTRY_W;
		posX += w;
		if (e < entriesPerRow - 1) {
			posX += 1;
		}
	}

	const rowStarts = [];
	for (let r = 0; r < rows; r++) {
		rowStarts.push(r * (ENTRY_H + 1));
	}

	// Draw grid content and internal borders
	for (let row = 0; row < rows; row++) {
		const y = row * (ENTRY_H + 1);
		drawRect(canvas, 1, y, 1, ENTRY_H, BLACK); // row left border shifted right by 1

		let x = 2; // start after row left border (+1 for outer border +1 for row border)

		for (let entry = 0; entry < entriesPerRow; entry++) {
			const entryWidth = entry == 0 ? ENTRY_W - 1 : ENTRY_W; // first entry is smaller to fit artwork

			if (entry > 0) {
				drawRect(canvas, x, y, 1, ENTRY_H, BLACK); // border between entries
				x += 1;
			}

			drawRect(canvas, x, y, entryWidth - 1, ENTRY_H, [255, 255, 255, 255]); // white fill

			const idx = row * entriesPerRow + entry;
			const text = HALL_OF_SHAME[idx] ? "#" + HALL_OF_SHAME[idx] : ""; // e.g. "#123"

			if (text) {
				await renderTextOntoImage(text, font, canvas, x + 1, y + 1);
			}

			x += entryWidth - 1;
		}

		drawRect(canvas, x, y, 1, ENTRY_H, BLACK); // row right border shifted right by 1

		if (row < rows - 1) {
			drawRect(canvas, 1, y + ENTRY_H, canvas.width - 2, 1, BLACK); // horizontal gap (skip outer borders)
		}
	}

	// Draw intersection patterns separately
	drawAllIntersections(canvas, entryStarts, rowStarts, rows, entriesPerRow);

	canvas.pack().pipe(fs.createWriteStream("hall_of_shame.png"));
}

async function renderImageOnImage(png: PNG, imagePath: string, x: number, y: number): Promise<void> {
	const img = await loadPNG(imagePath);
	for (let yy = 0; yy < img.height; yy++) {
		for (let xx = 0; xx < img.width; xx++) {
			const srcIdx = (yy * img.width + xx) << 2;
			const dstIdx = ((y + yy) * png.width + (x + xx)) << 2;

			png.data[dstIdx] = img.data[srcIdx]!;
			png.data[dstIdx + 1] = img.data[srcIdx + 1]!;
			png.data[dstIdx + 2] = img.data[srcIdx + 2]!;
			png.data[dstIdx + 3] = img.data[srcIdx + 3]!;
		}
	}
}

function runCommand(cmd: string, args: string[] = [], options: any = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit', ...options });

    proc.on('close', (code) => {
      if (code === 0) resolve(code);
      else reject(new Error(`Process exited with code ${code}`));
    });

    proc.on('error', reject);
  });
}

console.log("Drawing Hall of Shame...");
await drawHallOfShame();

console.log("Cloning wplace-overlay repository...");
await simpleGit().clone("https://github.com/cfpwastaken/wplace-overlay.git", "wplace-overlay", ["--depth=1"]);
console.log("Rendering image onto canvas...");
const PIC_PATH = "wplace-overlay/src/tiles/1100/672_orig.png";
const pic = await loadPNG(PIC_PATH);
await renderImageOnImage(pic, "hall_of_shame.png", 383, 0);
console.log("Saving final image...");
pic.pack().pipe(fs.createWriteStream(PIC_PATH));

console.log("Generating overlay...");
await runCommand("python3", ["border.py", "1100/672"], { cwd: "wplace-overlay/src/tiles" });

console.log("Committing changes...");
// Set commit author for the overlay repository
await simpleGit("wplace-overlay").addConfig("user.name", "Wplace DE Bot");
await simpleGit("wplace-overlay").addConfig("user.email", "wplace@example.com");
await simpleGit("wplace-overlay").add("./src/tiles/1100/672_orig.png");
await simpleGit("wplace-overlay").add("./src/tiles/1100/672.png");
await simpleGit("wplace-overlay").commit("tiles(hallofshame): update hall of shame");
console.log("Pushing changes to repository...");
await simpleGit("wplace-overlay").push("origin", "main");

console.log("Deletion of temporary files...");
fs.rmSync("wplace-overlay", { recursive: true, force: true });