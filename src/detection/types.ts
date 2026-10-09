// Shared detection types. No React Native imports, so this runs and tests on plain Node.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** One IMU sample: acceleration in g (gravity included), rotation rate in rad/s, time in ms */
export interface ImuSample {
  t: number;
  acc: Vec3;
  gyro: Vec3;
}

/** One GPS sample: speed in m/s (null = unknown) */
export interface GpsSample {
  t: number;
  speed: number | null;
  lat: number;
  lon: number;
  accuracy?: number | null;
}

export interface DetectorConfig {
  /** Minimum impact that opens a "suspicious event" (g) */
  impactG: number;
  /** Very severe impact, earns an extra point (g) */
  severeImpactG: number;
  /** Peak rotation rate that indicates a flip or tumble (rad/s) */
  rotationRadS: number;
  /** Speed before the event must be at least this to count as riding (km/h) */
  minRidingKmh: number;
  /** After the event, speed below this means the bike has stopped (km/h) */
  stoppedKmh: number;
  /** |a| below this counts as free fall (g) */
  freeFallG: number;
  /** Free fall at least this long means the phone was dropped (ms) */
  freeFallMinMs: number;
  /** Std. deviation of |a| after the event below this means lying still (g) */
  stillnessStdG: number;
  /** How long to keep recording after the impact before deciding (ms) */
  postImpactMs: number;
  /** Minimum score that counts as a real crash */
  crashScore: number;
  /** Deceleration that counts as harsh braking (m/s^2) */
  harshBrakeMs2: number;
  /** Minimum speed before braking for it to count as harsh braking (km/h) */
  harshBrakeMinKmh: number;
}

export const DEFAULT_CONFIG: DetectorConfig = {
  impactG: 3.5,
  severeImpactG: 6,
  rotationRadS: 3,
  minRidingKmh: 10,
  stoppedKmh: 5,
  freeFallG: 0.35,
  freeFallMinMs: 120,
  stillnessStdG: 0.08,
  postImpactMs: 6000,
  crashScore: 4,
  harshBrakeMs2: 4,
  harshBrakeMinKmh: 20,
};

/** Sensitivity level the user picks in Settings */
export type Sensitivity = 'low' | 'normal' | 'high';

export function configForSensitivity(s: Sensitivity): DetectorConfig {
  switch (s) {
    case 'low':
      return { ...DEFAULT_CONFIG, impactG: 4.5, rotationRadS: 4, harshBrakeMs2: 5 };
    case 'high':
      return { ...DEFAULT_CONFIG, impactG: 2.8, rotationRadS: 2.5, harshBrakeMs2: 3.3 };
    default:
      return DEFAULT_CONFIG;
  }
}

/** Features computed from the window around an impact; used for the decision and saved as dataset */
export interface ImpactFeatures {
  peakG: number;
  peakRotRadS: number;
  freeFallMs: number;
  speedBeforeKmh: number | null;
  speedAfterKmh: number | null;
  postStdG: number;
  score: number;
  reasons: string[];
}

export type DetectorEvent =
  | {
      type: 'crash';
      t: number;
      features: ImpactFeatures;
      location: GpsSample | null;
      window: ImuSample[];
    }
  | {
      type: 'impact_rejected';
      t: number;
      verdict: 'phone_drop' | 'not_riding' | 'low_score';
      features: ImpactFeatures;
      location: GpsSample | null;
    }
  | {
      type: 'harsh_brake';
      t: number;
      decelMs2: number;
      fromKmh: number;
      toKmh: number;
      location: GpsSample | null;
    };
