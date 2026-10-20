import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import QRCode from 'qrcode';
import { telegramFromQR } from '../core.mjs';

test('bundled scanner reads a Telegram profile QR and extracts its contact', async () => {
  const source = await readFile(new URL('../vendor/jsQR.js', import.meta.url), 'utf8');
  const sandbox = { self: {} };
  vm.runInNewContext(source, sandbox);
  const decode = sandbox.self.jsQR;
  assert.equal(typeof decode, 'function');
  const qr = QRCode.create('https://t.me/Dara_123');
  const scale = 6, quiet = 4, side = (qr.modules.size + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const qx = Math.floor(x / scale) - quiet, qy = Math.floor(y / scale) - quiet;
      const black = qx >= 0 && qy >= 0 && qx < qr.modules.size && qy < qr.modules.size && qr.modules.get(qx, qy);
      const i = (y * side + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = black ? 0 : 255;
      pixels[i + 3] = 255;
    }
  }
  const result = decode(pixels, side, side, { inversionAttempts: 'attemptBoth' });
  assert.equal(result.data, 'https://t.me/Dara_123');
  assert.equal(telegramFromQR(result.data), 'Dara_123');
});
