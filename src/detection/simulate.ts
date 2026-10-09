// Synthetic sensor data, used both by the algorithm tests and the in-app Demo mode buttons
import { GpsSample, ImuSample } from './types';

export type ScenarioName = 'crash' | 'pothole' | 'phone_drop' | 'harsh_brake' | 'crash_no_gps';

export interface Scenario {
  name: ScenarioName;
  label: string;
  imu: ImuSample[];
  gps: GpsSample[];
}

const HZ = 50;
const DT = 1000 / HZ;

/** Seeded pseudo-random generator so test results are reproducible */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
}

interface Phase {
  /** Phase length (ms) */
  ms: number;
  /** Target |a| (g) and gyro magnitude (rad/s) as a function of time within the phase */
  acc: (tau: number) => number;
  gyro: (tau: number) => number;
  /** Random vibration amplitude (g) */
  noise: number;
}

function buildImu(phases: Phase[], t0: number, seed: number): ImuSample[] {
  const r = rng(seed);
  const out: ImuSample[] = [];
  let t = t0;
  for (const p of phases) {
    for (let tau = 0; tau < p.ms; tau += DT) {
      const mag = Math.max(0, p.acc(tau) + r() * 2 * p.noise);
      // Spread magnitude across axes (mostly z, as if the phone lies flat)
      const ax = r() * 0.1 * mag;
      const ay = r() * 0.1 * mag;
      const az = Math.sqrt(Math.max(0, mag * mag - ax * ax - ay * ay));
      const g = p.gyro(tau) + r() * 0.1;
      out.push({ t, acc: { x: ax, y: ay, z: az }, gyro: { x: g * 0.7, y: g * 0.5, z: g * 0.5 } });
      t += DT;
    }
  }
  return out;
}

function buildGps(t0: number, durMs: number, speedKmhAt: (t: number) => number | null): GpsSample[] {
  const out: GpsSample[] = [];
  let lat = 13.7563;
  let lon = 100.5018; // Bangkok
  for (let t = 0; t <= durMs; t += 1000) {
    const kmh = speedKmhAt(t);
    if (kmh !== null) lat += (kmh / 3.6) / 111_000; // move north by distance travelled
    out.push({ t: t0 + t, speed: kmh === null ? null : kmh / 3.6, lat, lon, accuracy: 5 });
  }
  return out;
}

const riding: Phase = { ms: 8000, acc: () => 1, gyro: () => 0.2, noise: 0.15 };
const still = (ms: number): Phase => ({ ms, acc: () => 1, gyro: () => 0.02, noise: 0.02 });
const spike = (peak: number, ms = 120): Phase => ({
  ms,
  acc: (tau) => 1 + (peak - 1) * Math.sin((Math.PI * tau) / ms),
  gyro: () => 1,
  noise: 0.1,
});
const tumble = (rad: number, ms = 1200): Phase => ({
  ms,
  acc: (tau) => 1.5 + Math.sin(tau / 80),
  gyro: () => rad,
  noise: 0.6,
});

export function makeScenario(name: ScenarioName, t0 = 0, seed = 42): Scenario {
  switch (name) {
    case 'crash': {
      // Riding 40 km/h -> 8g impact -> tumble -> lying still, speed drops to 0
      const imu = buildImu([riding, spike(8), tumble(6), still(9000)], t0, seed);
      const crashAt = 8000;
      const gps = buildGps(t0, 18000, (t) => (t < crashAt ? 40 : t < crashAt + 2000 ? 10 : 0));
      return { name, label: 'Crash while riding 40 km/h', imu, gps };
    }
    case 'crash_no_gps': {
      const imu = buildImu([riding, spike(9), tumble(7), still(9000)], t0, seed);
      const gps = buildGps(t0, 18000, () => null);
      return { name, label: 'Severe crash, no GPS signal', imu, gps };
    }
    case 'pothole': {
      // Hard pothole hit at 4.5g, keeps riding, speed unchanged
      const imu = buildImu([riding, spike(4.5, 80), riding], t0, seed);
      const gps = buildGps(t0, 16000, () => 40);
      return { name, label: 'Pothole, keeps riding', imu, gps };
    }
    case 'phone_drop': {
      // Parked -> phone slips, 0.35 s free fall -> hits ground -> tumbles -> still
      const freeFall: Phase = { ms: 350, acc: () => 0.05, gyro: () => 2, noise: 0.02 };
      const imu = buildImu([still(8000), freeFall, spike(7, 60), tumble(5, 400), still(9000)], t0, seed);
      const gps = buildGps(t0, 18000, () => 0);
      return { name, label: 'Phone dropped while parked', imu, gps };
    }
    case 'harsh_brake': {
      // 50 -> 15 km/h within 2 s (about 4.9 m/s^2), no impact
      const imu = buildImu([riding, riding], t0, seed);
      const gps = buildGps(t0, 16000, (t) => (t <= 8000 ? 50 : t <= 10000 ? 50 - ((t - 8000) / 2000) * 35 : 15));
      return { name, label: 'Harsh braking', imu, gps };
    }
  }
}

/** Merge IMU + GPS into one time-ordered stream to feed the detector */
export function interleave(s: Scenario): ({ kind: 'imu'; s: ImuSample } | { kind: 'gps'; s: GpsSample })[] {
  const all = [
    ...s.imu.map((x) => ({ kind: 'imu' as const, s: x })),
    ...s.gps.map((x) => ({ kind: 'gps' as const, s: x })),
  ];
  return all.sort((a, b) => a.s.t - b.s.t);
}
