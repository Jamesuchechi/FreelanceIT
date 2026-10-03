import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BROWSER_DIR = path.resolve('apps/web/dist/web/browser');

if (!fs.existsSync(BROWSER_DIR)) {
  console.error(`Directory not found: ${BROWSER_DIR}. Run build first.`);
  process.exit(1);
}

function getGzipSize(filePath) {
  const content = fs.readFileSync(filePath);
  return zlib.gzipSync(content).length;
}

const files = fs.readdirSync(BROWSER_DIR);
let totalInitialGzip = 0;
let errors = 0;

console.log('--- Bundle Size Verification ---');

for (const file of files) {
  if (file.endsWith('.js')) {
    const filePath = path.join(BROWSER_DIR, file);
    const size = getGzipSize(filePath);
    const sizeKb = (size / 1024).toFixed(2);

    // Initial bundle chunks (main, polyfills)
    if (file.startsWith('main-') || file.startsWith('polyfills-') || file === 'main.js') {
      totalInitialGzip += size;
      console.log(`Initial chunk: ${file} -> ${sizeKb} KB (gzipped)`);
    } else if (file.startsWith('chunk-') || file.includes('feature')) {
      console.log(`Lazy chunk: ${file} -> ${sizeKb} KB (gzipped)`);
      if (size > 100 * 1024) {
        console.error(`ERROR: Lazy chunk ${file} exceeds 100 KB budget! (${sizeKb} KB)`);
        errors++;
      }
    } else {
      console.log(`Other JS: ${file} -> ${sizeKb} KB (gzipped)`);
    }
  }
}

const totalInitialKb = (totalInitialGzip / 1024).toFixed(2);
console.log(`Total Initial JS: ${totalInitialKb} KB (Budget: <= 200 KB)`);

if (totalInitialGzip > 200 * 1024) {
  console.error(`ERROR: Initial bundle exceeds 200 KB budget! (${totalInitialKb} KB)`);
  errors++;
}

if (errors > 0) {
  console.error(`Bundle budget checks FAILED with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log('All bundle budget checks PASSED.');
}
