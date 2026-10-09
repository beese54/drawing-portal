// Regenerates backend/tests/fixtures/frontend_metadata_all_symbols.json with the
// FRONTEND'S OWN metadataBuilder.ts: one element per symbol in the library (plus
// dual-supply variants), chained by pipes snapped to real port positions, every
// optional property filled. backend/tests/test_fuzz_inputs.py asserts the backend
// accepts it, so a schema change that would reject a real drawing fails CI.
// Rerun after changing metadataBuilder.ts or adding a symbol. From the repo root:
//   node tasks/repro/frontend_metadata_fixture.mjs frontend backend/symbols/manifest.json
//        backend/tests/fixtures/frontend_metadata_all_symbols.json
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Absolute: the generated entry file lives in a temp dir, so relative imports
// would resolve against that dir instead of the repo.
const [front, manifestPath, outPath] = process.argv.slice(2).map((p) => resolve(p));
const dir = mkdtempSync(join(tmpdir(), 'mb-'));
const entry = join(dir, 'entry.ts');
const src = (p) => join(front, 'src', p).replace(/\\/g, '/');
writeFileSync(entry, `
export { buildMetadata } from '${src('utils/metadataBuilder.ts')}';
export { getElementPorts, getPortPosition, DUAL_SUPPLY_SYMBOLS } from '${src('utils/symbolPorts.ts')}';
`);
const esbuild = await import(pathToFileURL(join(front, 'node_modules/esbuild/lib/main.js')).href);
const out = join(dir, 'bundle.mjs');
await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out,
  loader: { '.svg': 'text', '.png': 'dataurl' }, logLevel: 'error' });
const M = await import(pathToFileURL(out).href);

const symbols = JSON.parse(readFileSync(manifestPath, 'utf8')).symbols;
const elements = [];
let n = 0;
const add = (s, extra = {}) => {
  const i = n++;
  elements.push({
    id: `el-${i}-${s.id}`, symbolId: s.id, symbolName: s.name,
    x: 100 + (i % 10) * 120, y: 100 + Math.floor(i / 10) * 120, rotation: 0, width: 60, height: 60,
    fittingType: 'basin_tap', efficiencyRating: 3, longBathCapacityL: 250, pumpRatedHeadM: 30,
    highestFittingElevationM: 45.5, carriesFluid: 'cold',
    tankProperties: {
      material: 'FRP', isSunkenTank: false, lengthM: 2, widthM: 1.5, heightM: 1.2,
      floorLevelMAmsl: 40, inletPipeDiameterM: 0.05, inletPipeMAmsl: 41, outletPipeDiameterM: 0.05,
      distanceOutletToBaseM: 0.08, overflowPipeDiameterM: 0.08, overflowPipeMAmsl: 41.1,
      warningPipeDiameterM: 0.025, warningPipeMAmsl: 41.05, supportHeightM: 0.5, occupants: 6,
    },
    ...extra,
  });
};
for (const s of symbols) add(s);
for (const s of symbols) if (M.DUAL_SUPPLY_SYMBOLS.has(s.id)) add(s, { dualSupply: true, carriesFluid: 'hot' });

// Chain consecutive elements: last port of one to first port of the next.
const pipes = [];
for (let i = 0; i + 1 < elements.length; i++) {
  const a = elements[i], b = elements[i + 1];
  const pa = M.getElementPorts(a), pb = M.getElementPorts(b);
  if (!pa.length || !pb.length) continue;
  const s = M.getPortPosition(a, pa[pa.length - 1]), e = M.getPortPosition(b, pb[0]);
  pipes.push({ id: `pipe-${i}`, pipeType: i % 2 ? 'hot' : 'cold', startX: s.x, startY: s.y, endX: e.x, endY: e.y });
}

const acks = { materialsAcknowledged: true, pumpDischargeMaterialAcknowledged: true,
  applianceCheckValveAcknowledged: true, bidetVacuumBreakerAcknowledged: true, tankPositionAcknowledged: true };
const meta = M.buildMetadata(elements, pipes, { upperMrl: 60, lowerMrl: 30 }, 1400, 1000, 'A1', 50, acks, {},
  [{ id: 'a1', text: 'note', x: 5, y: 5, fontSize: 12, color: '#000', maxWidth: 60, height: 8 }]);
writeFileSync(outPath, JSON.stringify(meta, null, 1) + '\n');
console.log(`elements=${meta.elements.length} pipes=${meta.pipes.length} ` +
  `connected_pipes=${meta.pipes.filter(p => p.start_connects_to && p.end_connects_to).length}`);
