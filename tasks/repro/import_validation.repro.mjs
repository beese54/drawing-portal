/**
 * Repro + regression harness for the schematic JSON import boundary.
 *
 * There is no test runner in frontend/package.json, so this compiles
 * src/utils/importValidation.ts with the esbuild already in node_modules and
 * exercises it under Node. Run:  node tasks/repro/import_validation.repro.mjs
 *
 * Every case states what a user would see. A case marked SHOULD-THROW that does
 * not throw is a file the app accepts and then renders as a broken drawing.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const front = resolve(here, '../../frontend');
const src = join(front, 'src/utils/importValidation.ts');
const out = join(mkdtempSync(join(tmpdir(), 'iv-')), 'importValidation.mjs');

// esbuild's JS API rather than its CLI: Node refuses to spawn a .cmd shim without a shell.
const esbuild = await import(pathToFileURL(join(front, 'node_modules/esbuild/lib/main.js')).href);
await esbuild.build({ entryPoints: [src], bundle: true, format: 'esm', platform: 'neutral', outfile: out });
const IV = await import(pathToFileURL(out).href);

const valid = () => ({
  schema_version: '1.0',
  elements: [{ id: 'e1', symbol_id: 's', symbol_name: 'S', position: { canvas_x: 10, canvas_y: 20 }, width: 5, height: 5, rotation_deg: 0, scale_x: 1 }],
  pipes: [{ id: 'p1', pipe_type: 'cold', start: { canvas_x: 0, canvas_y: 0 }, end: { canvas_x: 1, canvas_y: 1 } }],
  annotations: [{ id: 'a1', text: 'x', position: { canvas_x: 1, canvas_y: 2 }, font_size: 3, color: '#1a1a1a', max_width: 60, height: 8 }],
  mrl_config: { lower_mrl: 0 },
  sheet_config: { paper_size: 'A1', drawing_scale: 50 },
});

const mutate = (fn) => { const d = valid(); fn(d); return d; };

/** [name, data, shouldThrow] */
const CASES = [
  ['a valid schematic still imports',            valid(),                                                          false],
  ['element position is an empty object',        mutate(d => { d.elements[0].position = {}; }),                     true],
  ['element canvas_x is a string',               mutate(d => { d.elements[0].position.canvas_x = 'abc'; }),         true],
  ['element canvas_y is null',                   mutate(d => { d.elements[0].position.canvas_y = null; }),          true],
  ['element canvas_x is 1e999 (JSON Infinity)',  mutate(d => { d.elements[0].position.canvas_x = Infinity; }),      true],
  ['element width is missing',                   mutate(d => { delete d.elements[0].width; }),                      true],
  ['element height is a string',                 mutate(d => { d.elements[0].height = '20'; }),                     true],
  ['pipe start is an empty object',              mutate(d => { d.pipes[0].start = {}; }),                           true],
  ['pipe end canvas_y is a string',              mutate(d => { d.pipes[0].end.canvas_y = 'x'; }),                   true],
  ['annotation is not an object',                mutate(d => { d.annotations[0] = 'hello'; }),                      true],
  ['annotation has no position',                 mutate(d => { delete d.annotations[0].position; }),                true],
  ['annotation canvas_x is a string',            mutate(d => { d.annotations[0].position.canvas_x = 'x'; }),        true],
  ['sheet_config paper_size is unknown',         mutate(d => { d.sheet_config.paper_size = 'Z9'; }),                true],
  ['sheet_config drawing_scale is unknown',      mutate(d => { d.sheet_config.drawing_scale = 7; }),                true],
  ['sheet_config absent (older 1.0 export)',     mutate(d => { delete d.sheet_config; }),                           false],
  ['annotations absent',                         mutate(d => { delete d.annotations; }),                            false],
  ['annotation max_width absent (older export)', mutate(d => { delete d.annotations[0].max_width; }),               false],
];

let failed = 0;
console.log('--- #1 numeric field validation ---');
for (const [name, data, shouldThrow] of CASES) {
  let threw = null;
  try { IV.validateSchematicShape(data); } catch (e) { threw = e; }
  const ok = shouldThrow ? threw !== null : threw === null;
  if (!ok) failed++;
  const detail = threw ? `refused: "${threw.message}"` : 'accepted';
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(42)} ${detail}`);
}

console.log('\n--- #3 dropped stamps are reported ---');
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const STAMP_CASES = [
  ['remote URL stamp',            { lpPeStamp: 'https://evil.example/stamp.png' },                    ['lpPeStamp']],
  ['mislabelled non-image bytes', { ownerStamp: 'data:image/png;base64,QUFBQUFBQUFBQUFBQUFBQQ==' },   ['ownerStamp']],
  ['two bad stamps at once',      { ownerStamp: 'http://x/y.png', lpPeStamp: 'nonsense' },            ['ownerStamp', 'lpPeStamp']],
  ['a genuine png stamp',         { lpPeStamp: PNG_1PX },                                             []],
  ['no stamp fields at all',      { projectName: 'Block 5' },                                         []],
];
for (const [name, tb, expected] of STAMP_CASES) {
  const dropped = [];
  IV.sanitizeTitleBlock(tb, (f) => dropped.push(f));
  const ok = JSON.stringify(dropped.sort()) === JSON.stringify([...expected].sort());
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(42)} reported: [${dropped.join(', ') || '—'}]  expected: [${expected.join(', ') || '—'}]`);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : failed + ' FAILING'} (${CASES.length + STAMP_CASES.length} cases)`);
process.exit(failed === 0 ? 0 : 1);
