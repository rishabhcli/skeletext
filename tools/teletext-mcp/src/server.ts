// stdio entry point: newline-delimited JSON-RPC in, newline-delimited JSON-RPC out.
import { createInterface } from 'node:readline';
import { handleLine } from './protocol.js';

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (line.trim() === '') return;
  const out = handleLine(line);
  if (out !== null) process.stdout.write(out + '\n');
});
