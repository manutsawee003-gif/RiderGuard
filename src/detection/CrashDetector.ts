import {
  DEFAULT_CONFIG,
  DetectorConfig,
  DetectorEvent,
  GpsSample,
  ImpactFeatures,
  ImuSample,
  Vec3,
} from './types';

const MS_TO_KMH = 3.6;
const IMU_BUFFER_MS = 12000; // enough history to cover before and after an impact
const GPS_BUFFER_MS = 30000;
const CRASH_COOLDOWN_MS = 15000;
const BRAKE_COOLDOWN_MS = 5000;

export const magnitude = (v: Vec3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(v);
}

export type DetectorPhase = 'idle' | 'evaluating' | 'cooldown';

/**
 * Crash detector implemented as a small state machine.
 *
 * Decision steps:
 *  1) |a| exceeds impactG -> open a "suspicious event" and keep recording for postImpactMs
 *  2) Compute features: peak impact, rotation, free-fall time, speed before/after, stillness afterwards
 *  3) Filter out phone drops / not riding, then sum a score; score >= crashScore means a real crash
 *
 * Harsh braking is detected separately from GPS deceleration and logged as a risk point.
 */
export class CrashDetector {
  private cfg: DetectorConfig;
  private imu: ImuSample[] = [];
  private gps: GpsSample[] = [];
  private pendingImpactT: number | null = null;
  private cooldownUntil = 0;
  private brakeCooldownUntil = 0;
  private listeners: ((e: DetectorEvent) => void)[] = [];

  constructor(cfg: Partial<DetectorConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
  }

  setConfig(cfg: Partial<DetectorConfig>) {
    this.cfg = { ...this.cfg, ...cfg };
  }

  onEvent(fn: (e: DetectorEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  reset() {
    this.imu = [];
    this.gps = [];
    this.pendingImpactT = null;
    this.cooldownUntil = 0;
    this.brakeCooldownUntil = 0;
  }

  get phase(): DetectorPhase {
    if (this.pendingImpactT !== null) return 'evaluating';
    const last = this.imu[this.imu.length - 1];
    if (last && last.t < this.cooldownUntil) return 'cooldown';
    return 'idle';
  }

  get lastLocation(): GpsSample | null {
    return this.gps[this.gps.length - 1] ?? null;
  }

  /** Current speed in km/h (null if no GPS fix yet) */
  get currentSpeedKmh(): number | null {
    const s = this.lastLocation?.speed;
    return s == null || s < 0 ? null : s * MS_TO_KMH;
  }

  pushImu(s: ImuSample) {
    this.imu.push(s);
    const cutoff = s.t - IMU_BUFFER_MS;
    while (this.imu.length && this.imu[0].t < cutoff) this.imu.shift();

    if (this.pendingImpactT === null) {
      if (s.t >= this.cooldownUntil && magnitude(s.acc) >= this.cfg.impactG) {
        this.pendingImpactT = s.t;
      }
      return;
    }

    if (s.t - this.pendingImpactT >= this.cfg.postImpactMs) {
      const t0 = this.pendingImpactT;
      this.pendingImpactT = null;
      this.evaluate(t0);
    }
  }

  pushGps(s: GpsSample) {
    this.gps.push(s);
    const cutoff = s.t - GPS_BUFFER_MS;
    while (this.gps.length && this.gps[0].t < cutoff) this.gps.shift();
    this.checkHarshBrake(s, this.gps);
  }

  // ---------------------------------------------------------------------------

  private checkHarshBrake(now: GpsSample, history: GpsSample[]) {
    if (now.speed == null || now.speed < 0 || now.t < this.brakeCooldownUntil) return;
    // Compare with a sample 1-3 s earlier (GPS usually updates at 1 Hz)
    for (let i = history.length - 2; i >= 0; i--) {
      const prev = history[i];
      const dt = (now.t - prev.t) / 1000;
      if (dt < 0.9) continue;
      if (dt > 3.1) break;
      if (prev.speed == null || prev.speed < 0) continue;
      const fromKmh = prev.speed * MS_TO_KMH;
      const decel = (prev.speed - now.speed) / dt;
      if (fromKmh >= this.cfg.harshBrakeMinKmh && decel >= this.cfg.harshBrakeMs2) {
        this.brakeCooldownUntil = now.t + BRAKE_COOLDOWN_MS;
        this.emit({
          type: 'harsh_brake',
          t: now.t,
          decelMs2: round(decel, 2),
          fromKmh: round(fromKmh, 1),
          toKmh: round(now.speed * MS_TO_KMH, 1),
          location: now,
        });
        return;
      }
    }
  }

  private evaluate(t0: number) {
    const f = this.computeFeatures(t0);
    const location = this.locationNear(t0);

    const riding = f.speedBeforeKmh !== null && f.speedBeforeKmh >= this.cfg.minRidingKmh;
    const knownNotRiding = f.speedBeforeKmh !== null && !riding;

    if (knownNotRiding) {
      const verdict = f.freeFallMs >= this.cfg.freeFallMinMs ? 'phone_drop' : 'not_riding';
      f.reasons.push(verdict === 'phone_drop' ? 'Free fall while not riding = phone dropped' : 'Not riding at time of impact');
      this.emit({ type: 'impact_rejected', t: t0, verdict, features: f, location });
      return;
    }
    // No GPS + long free fall + not enough other evidence = most likely a dropped phone
    if (f.speedBeforeKmh === null && f.freeFallMs >= this.cfg.freeFallMinMs && f.score < this.cfg.crashScore) {
      f.reasons.push('Free fall with no speed data = likely phone dropped');
      this.emit({ type: 'impact_rejected', t: t0, verdict: 'phone_drop', features: f, location });
      return;
    }

    if (f.score >= this.cfg.crashScore) {
      this.cooldownUntil = t0 + this.cfg.postImpactMs + CRASH_COOLDOWN_MS;
      const window = this.imu.filter((s) => s.t >= t0 - 3000 && s.t <= t0 + this.cfg.postImpactMs);
      this.emit({ type: 'crash', t: t0, features: f, location, window });
    } else {
      this.emit({ type: 'impact_rejected', t: t0, verdict: 'low_score', features: f, location });
    }
  }

  private computeFeatures(t0: number): ImpactFeatures {
    const c = this.cfg;
    const inRange = (a: number, b: number) => this.imu.filter((s) => s.t >= t0 + a && s.t <= t0 + b);

    const around = inRange(-500, 1000);
    const peakG = Math.max(0, ...around.map((s) => magnitude(s.acc)));
    const peakRot = Math.max(0, ...inRange(-1000, 1500).map((s) => magnitude(s.gyro)));

    // Longest continuous free-fall run before the impact
    let freeFallMs = 0;
    let runStart: number | null = null;
    for (const s of inRange(-1500, 0)) {
      if (magnitude(s.acc) < c.freeFallG) {
        if (runStart === null) runStart = s.t;
        freeFallMs = Math.max(freeFallMs, s.t - runStart);
      } else {
        runStart = null;
      }
    }

    const post = inRange(2000, c.postImpactMs).map((s) => magnitude(s.acc));
    const postStd = std(post);

    const before = this.gps.filter((g) => g.t >= t0 - 6000 && g.t <= t0 && g.speed != null && g.speed >= 0);
    const after = this.gps.filter((g) => g.t >= t0 + 2000 && g.speed != null && g.speed >= 0);
    const speedBefore = before.length ? Math.max(...before.map((g) => g.speed as number)) * MS_TO_KMH : null;
    const speedAfter = after.length ? (after[after.length - 1].speed as number) * MS_TO_KMH : null;

    const reasons: string[] = [];
    let score = 0;
    if (peakG >= c.impactG) {
      score += 1;
      reasons.push(`Impact ${peakG.toFixed(1)}g`);
    }
    if (peakG >= c.severeImpactG) {
      score += 1;
      reasons.push('Severe impact');
    }
    if (peakRot >= c.rotationRadS) {
      score += 1;
      reasons.push(`Tumble ${peakRot.toFixed(1)} rad/s`);
    }
    if (speedBefore !== null && speedAfter !== null && speedBefore >= c.minRidingKmh && speedAfter <= c.stoppedKmh) {
      score += 2;
      reasons.push(`Speed dropped ${speedBefore.toFixed(0)} -> ${speedAfter.toFixed(0)} km/h`);
    }
    if (post.length >= 10 && postStd <= c.stillnessStdG) {
      score += 1;
      reasons.push('Still after impact');
    }

    return {
      peakG: round(peakG, 2),
      peakRotRadS: round(peakRot, 2),
      freeFallMs,
      speedBeforeKmh: speedBefore === null ? null : round(speedBefore, 1),
      speedAfterKmh: speedAfter === null ? null : round(speedAfter, 1),
      postStdG: round(postStd, 3),
      score,
      reasons,
    };
  }

  private locationNear(t: number): GpsSample | null {
    let best: GpsSample | null = null;
    for (const g of this.gps) {
      if (!best || Math.abs(g.t - t) < Math.abs(best.t - t)) best = g;
    }
    return best;
  }

  private emit(e: DetectorEvent) {
    for (const l of this.listeners) l(e);
  }
}

function round(n: number, d: number) {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}
