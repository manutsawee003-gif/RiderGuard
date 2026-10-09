import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CrashDetector, DetectorPhase, magnitude } from '../detection/CrashDetector';
import { interleave, makeScenario, ScenarioName } from '../detection/simulate';
import { configForSensitivity, DetectorEvent, Sensitivity, Vec3 } from '../detection/types';

const SAMPLE_MS = 20; // 50 Hz
const UI_REFRESH_MS = 200; // refresh the UI 5x per second (never setState on every sample)
const KEEP_AWAKE_TAG = 'riderguard-monitor';

export interface LiveReading {
  accG: number;
  peakG: number;
  rotRadS: number;
  speedKmh: number | null;
  gpsAccuracy: number | null;
  phase: DetectorPhase;
}

export type MonitorEvent = DetectorEvent & { simulated: boolean };

const EMPTY: LiveReading = { accG: 0, peakG: 0, rotRadS: 0, speedKmh: null, gpsAccuracy: null, phase: 'idle' };

export function useMonitor(sensitivity: Sensitivity, onEvent: (e: MonitorEvent) => void) {
  const detector = useRef(new CrashDetector(configForSensitivity(sensitivity))).current;
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<LiveReading>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const lastGyro = useRef<Vec3>({ x: 0, y: 0, z: 0 });
  const lastAcc = useRef(0);
  const peakAcc = useRef(0);
  const subs = useRef<{ remove: () => void }[]>([]);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    detector.setConfig(configForSensitivity(sensitivity));
  }, [sensitivity, detector]);

  useEffect(() => detector.onEvent((e) => onEventRef.current({ ...e, simulated: false })), [detector]);

  const stop = useCallback(() => {
    subs.current.forEach((s) => s.remove());
    subs.current = [];
    deactivateKeepAwake(KEEP_AWAKE_TAG);
    setRunning(false);
    setLive(EMPTY);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const loc = await Location.requestForegroundPermissionsAsync();
      if (loc.status !== 'granted') {
        setError('Location permission denied. Detection still works, but is less accurate and cannot share your location.');
      }
      const motion = await Accelerometer.requestPermissionsAsync();
      if (motion.status !== 'granted') {
        setError('Motion sensor permission denied.');
        return;
      }
      if (!(await Accelerometer.isAvailableAsync()) || !(await Gyroscope.isAvailableAsync())) {
        setError('This device has no accelerometer or gyroscope.');
        return;
      }

      detector.reset();
      Accelerometer.setUpdateInterval(SAMPLE_MS);
      Gyroscope.setUpdateInterval(SAMPLE_MS);

      subs.current.push(
        Gyroscope.addListener((g) => {
          lastGyro.current = { x: g.x, y: g.y, z: g.z };
        }),
      );
      subs.current.push(
        Accelerometer.addListener((a) => {
          const acc = { x: a.x, y: a.y, z: a.z };
          const m = magnitude(acc);
          lastAcc.current = m;
          peakAcc.current = Math.max(peakAcc.current, m);
          // use the same clock as GPS so timestamps are comparable
          detector.pushImu({ t: Date.now(), acc, gyro: lastGyro.current });
        }),
      );

      if (loc.status === 'granted') {
        const watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
          (p) => {
            detector.pushGps({
              t: Date.now(),
              speed: p.coords.speed,
              lat: p.coords.latitude,
              lon: p.coords.longitude,
              accuracy: p.coords.accuracy,
            });
          },
        );
        subs.current.push(watcher);
      }

      const timer = setInterval(() => {
        setLive({
          accG: lastAcc.current,
          peakG: peakAcc.current,
          rotRadS: magnitude(lastGyro.current),
          speedKmh: detector.currentSpeedKmh,
          gpsAccuracy: detector.lastLocation?.accuracy ?? null,
          phase: detector.phase,
        });
        peakAcc.current = 0;
      }, UI_REFRESH_MS);
      subs.current.push({ remove: () => clearInterval(timer) });

      await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      setRunning(true);
    } catch (e) {
      stop();
      setError(`Could not start monitoring: ${String(e)}`);
    }
  }, [detector, stop]);

  useEffect(() => stop, [stop]);

  /** Feed synthetic data into a separate detector (does not disturb real monitoring) for demos */
  const simulate = useCallback(
    (name: ScenarioName) => {
      const sim = new CrashDetector(configForSensitivity(sensitivity));
      const t0 = Date.now() - 20000;
      const offSim = sim.onEvent((e) => onEventRef.current({ ...e, simulated: true }));
      for (const item of interleave(makeScenario(name, t0, Date.now() % 1000))) {
        if (item.kind === 'imu') sim.pushImu(item.s);
        else sim.pushGps(item.s);
      }
      offSim();
    },
    [sensitivity],
  );

  return { running, live, error, start, stop, simulate };
}
