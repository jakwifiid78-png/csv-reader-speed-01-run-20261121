// Driver for this entry. The harness runs `node main.ts` under Node 22:
// it reads every case out of cases.json, answers each one on its own with
// the fast reader in solve.js, and writes the answers back as one JSON
// array, in the cases' order. The input and output folders come from the
// environment outside a container (MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR)
// and default to /input and /output inside one.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// Keep V8's incremental marking off while the reader runs, the same tuning
// the house baseline uses, so the timed work is not interrupted by it.
setFlagsFromString('--no-incremental-marking');

const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8')) as {
  id: string;
  input: unknown;
}[];

const answers: unknown[] = new Array(cases.length);
for (let i = 0; i < cases.length; i++) {
  answers[i] = run(cases[i].input);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
