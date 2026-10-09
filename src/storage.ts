import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImpactFeatures, ImuSample, Sensitivity } from './detection/types';

export interface Contact {
  id: string;
  name: string;
  phone: string;
}

export interface Settings {
  riderName: string;
  contacts: Contact[];
  sensitivity: Sensitivity;
  countdownSec: number;
  showRejected: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  riderName: '',
  contacts: [],
  sensitivity: 'normal',
  countdownSec: 30,
  showRejected: false,
};

export type CrashOutcome = 'cancelled' | 'alert_sent' | 'pending';

export interface LoggedEvent {
  id: string;
  type: 'crash' | 'harsh_brake' | 'impact_rejected';
  t: number;
  simulated: boolean;
  lat: number | null;
  lon: number | null;
  /** crash / impact_rejected */
  features?: ImpactFeatures;
  verdict?: string;
  outcome?: CrashOutcome;
  /** harsh_brake */
  fromKmh?: number;
  toKmh?: number;
  decelMs2?: number;
}

/** Raw sensor window around an event, labelled by the rider's response (real crash / false alarm), for an ML training dataset */
export interface SensorWindow {
  eventId: string;
  label: 'crash' | 'false_alarm' | 'unlabeled';
  samples: ImuSample[];
}

const K_SETTINGS = 'rg.settings.v1';
const K_EVENTS = 'rg.events.v1';
const K_WINDOWS = 'rg.windows.v1';
const MAX_EVENTS = 500;
const MAX_WINDOWS = 30;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await readJson<Partial<Settings>>(K_SETTINGS, {})) };
}

export async function saveSettings(s: Settings) {
  await AsyncStorage.setItem(K_SETTINGS, JSON.stringify(s));
}

export async function loadEvents(): Promise<LoggedEvent[]> {
  return readJson<LoggedEvent[]>(K_EVENTS, []);
}

export async function saveEvents(events: LoggedEvent[]) {
  await AsyncStorage.setItem(K_EVENTS, JSON.stringify(events.slice(0, MAX_EVENTS)));
}

export async function loadWindows(): Promise<SensorWindow[]> {
  return readJson<SensorWindow[]>(K_WINDOWS, []);
}

export async function addWindow(w: SensorWindow) {
  const all = await loadWindows();
  await AsyncStorage.setItem(K_WINDOWS, JSON.stringify([w, ...all].slice(0, MAX_WINDOWS)));
}

export async function labelWindow(eventId: string, label: SensorWindow['label']) {
  const all = await loadWindows();
  await AsyncStorage.setItem(
    K_WINDOWS,
    JSON.stringify(all.map((w) => (w.eventId === eventId ? { ...w, label } : w))),
  );
}

export async function clearHistory() {
  await AsyncStorage.multiRemove([K_EVENTS, K_WINDOWS]);
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
