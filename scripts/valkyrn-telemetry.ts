// The Valkyrn tuning tool (Valkyrn spec §10 Gate, §12): the scripted pilot against the hunter over the gate seeds.
// Usage:
//   npx tsx scripts/valkyrn-telemetry.ts [seed ...]
//       each duel's lines, then the gate summary, at the current tuning
//   npx tsx scripts/valkyrn-telemetry.ts --json
//       the gate over seeds 1 to 10 at the current tuning, as one JSON line (what sweep reads)
//   npx tsx scripts/valkyrn-telemetry.ts sweep [--layer a,b] [--hull a,b] [--level a,b] [--vhull a,b]
//       one line per combination over seeds 1 to 10. Part i freezes the defs, so each combination rewrites the four lines
//       GUN_HITS_PER_LAYER/_HULL/_LEVEL and VALKYRN_HULL in sim/tactical/tuning.ts, runs `--json` in a child process,
//       and the original text is restored afterwards (plan Decision 10). A list left out keeps the current value.
//       Line format:
//       layer=8 hull=3 level=6 vhull=30  median 231.4 s  crew 7 hunter 3 draw 0 cap 0  gun hit 17.9%  PASS
//       (or FAIL: <reasons>)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { GATE_SEEDS } from '../tests/helpers/scriptedDuel';
import { runValkyrnDuel, valkyrnGate, valkyrnLine } from '../tests/helpers/valkyrnGate';

const TUNING = 'src/renderer/src/sim/tactical/tuning.ts';
const KNOBS = { layer: 'GUN_HITS_PER_LAYER', hull: 'GUN_HITS_PER_HULL', level: 'GUN_HITS_PER_LEVEL', vhull: 'VALKYRN_HULL' } as const;
type Knob = keyof typeof KNOBS;
interface GateJson { medianS: number; crewWins: number; hunterWins: number; draws: number; cap: number; shots: number; hits: number; pass: boolean; reasons: string[] }

/** The one `export const NAME = <integer>;` line's pattern; throws unless it matches exactly once in `text`. */
function lineOf(text: string, name: string): RegExp {
  // String.raw keeps the backslash: in a plain template literal `\d` cooks to the letter d.
  const source = String.raw`^export const ${name} = (\d+);`;
  if ((text.match(new RegExp(source, 'gm')) ?? []).length !== 1) throw Error(`${TUNING}: expected one line 'export const ${name} = <integer>;'`);
  return new RegExp(source, 'm');
}
const valueOf = (text: string, name: string): number => Number(lineOf(text, name).exec(text)![1]);
const withValue = (text: string, name: string, v: number): string => text.replace(lineOf(text, name), `export const ${name} = ${v};`);

function gateJson(): GateJson {
  const runs = GATE_SEEDS.map((seed) => runValkyrnDuel(seed)), g = valkyrnGate(runs);
  return {
    medianS: g.medianS, crewWins: g.crewWins, hunterWins: g.hunterWins,
    draws: runs.filter((r) => r.telemetry.outcome === Outcome.Draw).length, cap: runs.filter((r) => r.telemetry.outcome === Outcome.Running).length,
    shots: runs.reduce((n, r) => n + r.gunShots, 0), hits: runs.reduce((n, r) => n + r.gunHits, 0), pass: g.pass, reasons: g.reasons
  };
}

const argv = process.argv.slice(2);
if (argv[0] === 'sweep') {
  const original = readFileSync(TUNING, 'utf8');
  const list = (flag: string, k: Knob): number[] => {
    const i = argv.indexOf(flag);
    if (i < 0) return [valueOf(original, KNOBS[k])];
    const v = argv[i + 1]!.split(',').map(Number);
    if (v.some((n) => !Number.isInteger(n) || n < 1)) throw Error(`${flag}: positive integers, comma separated`);
    return v;
  };
  const restore = (): void => writeFileSync(TUNING, original, 'utf8');
  process.on('SIGINT', () => { restore(); process.exit(130); });
  const layers = list('--layer', 'layer'), hulls = list('--hull', 'hull'), levels = list('--level', 'level'), vhulls = list('--vhull', 'vhull');
  try {
    for (const vhull of vhulls) for (const hull of hulls) for (const layer of layers) for (const level of levels) {
      const k: Record<Knob, number> = { layer, hull, level, vhull };
      let text = original;
      for (const key of Object.keys(KNOBS) as Knob[]) text = withValue(text, KNOBS[key], k[key]);
      writeFileSync(TUNING, text, 'utf8');
      const out = execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/valkyrn-telemetry.ts', '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
      const g = JSON.parse(out.trim().split('\n').at(-1)!) as GateJson;
      console.log(`layer=${layer} hull=${hull} level=${level} vhull=${vhull}  median ${g.medianS.toFixed(1)} s  crew ${g.crewWins} hunter ${g.hunterWins} draw ${g.draws} cap ${g.cap}  gun hit ${g.shots > 0 ? ((100 * g.hits) / g.shots).toFixed(1) : '0.0'}%  ${g.pass ? 'PASS' : `FAIL: ${g.reasons.join('; ')}`}`);
    }
  } finally {
    restore();
    if (readFileSync(TUNING, 'utf8') !== original) throw Error(`${TUNING} was not restored: restore it with git before anything else`);
  }
} else if (argv[0] === '--json') {
  console.log(JSON.stringify(gateJson()));
} else {
  const seeds = argv.length > 0 ? argv.map(Number) : GATE_SEEDS;
  if (seeds.some((n) => !Number.isInteger(n))) throw Error('usage: npx tsx scripts/valkyrn-telemetry.ts [seed ...] | --json | sweep [--layer a,b] [--hull a,b] [--level a,b] [--vhull a,b]');
  const runs = seeds.map((seed) => runValkyrnDuel(seed));
  for (const r of runs) console.log(valkyrnLine(r));
  const g = valkyrnGate(runs);
  console.log(`\n${g.summary}\n${g.pass ? 'PASS' : `FAIL: ${g.reasons.join('; ')}`}`);
}
