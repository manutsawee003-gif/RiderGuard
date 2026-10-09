// Test the detection algorithm with synthetic data:  npx tsx scripts/test-detector.ts
import { CrashDetector } from '../src/detection/CrashDetector';
import { interleave, makeScenario, ScenarioName } from '../src/detection/simulate';
import { DetectorEvent } from '../src/detection/types';

const expectations: Record<ScenarioName, DetectorEvent['type']> = {
  crash: 'crash',
  crash_no_gps: 'crash',
  pothole: 'impact_rejected',
  phone_drop: 'impact_rejected',
  harsh_brake: 'harsh_brake',
};

let failed = 0;
for (const name of Object.keys(expectations) as ScenarioName[]) {
  const sc = makeScenario(name);
  const det = new CrashDetector();
  const events: DetectorEvent[] = [];
  det.onEvent((e) => events.push(e));
  for (const item of interleave(sc)) {
    if (item.kind === 'imu') det.pushImu(item.s);
    else det.pushGps(item.s);
  }
  const types = events.map((e) => e.type);
  const expected = expectations[name];
  const crashed = types.includes('crash');
  const ok = expected === 'crash' ? crashed : !crashed && types.includes(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${sc.label.padEnd(28)} -> ${types.join(', ') || '(no events)'}`);
  for (const e of events) {
    if (e.type === 'crash' || e.type === 'impact_rejected') {
      const f = e.features;
      const verdict = e.type === 'impact_rejected' ? ` [${e.verdict}]` : '';
      console.log(`      score=${f.score}${verdict}  ${f.reasons.join(' | ')}`);
    } else if (e.type === 'harsh_brake') {
      console.log(`      ${e.fromKmh} -> ${e.toKmh} km/h, ${e.decelMs2} m/s²`);
    }
  }
}

console.log(failed ? `\n${failed} scenario(s) failed` : '\nAll scenarios passed');
declare const process: { exit(code: number): never };
if (failed) process.exit(1);
