import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { buildAlertMessage, callEmergency, EMERGENCY_NUMBER, sendSmsAlert } from './src/alert';
import { MonitorEvent, useMonitor } from './src/hooks/useMonitor';
import { CountdownOverlay } from './src/screens/CountdownOverlay';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import {
  addWindow,
  clearHistory,
  CrashOutcome,
  DEFAULT_SETTINGS,
  labelWindow,
  loadEvents,
  loadSettings,
  LoggedEvent,
  newId,
  saveEvents,
  saveSettings,
  Settings,
} from './src/storage';
import { colors, radius, space } from './src/theme';

type Tab = 'home' | 'history' | 'settings';

interface ActiveCrash {
  event: LoggedEvent;
  reasons: string[];
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const [tab, setTab] = useState<Tab>('home');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeCrash, setActiveCrash] = useState<ActiveCrash | null>(null);
  const [alertSent, setAlertSent] = useState<LoggedEvent | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const activeRef = useRef<ActiveCrash | null>(null);
  activeRef.current = activeCrash;

  useEffect(() => {
    Promise.all([loadSettings(), loadEvents()]).then(([s, e]) => {
      setSettings(s);
      setEvents(e);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) saveEvents(events);
  }, [events, loaded]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 4500);
    return () => clearTimeout(t);
  }, [banner]);

  const updateSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  const logEvent = (e: LoggedEvent) => setEvents((prev) => [e, ...prev]);
  const setOutcome = (id: string, outcome: CrashOutcome) =>
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, outcome } : e)));

  const handleEvent = useCallback((e: MonitorEvent) => {
    const base = {
      id: newId(),
      t: e.t,
      simulated: e.simulated,
      lat: e.location?.lat ?? null,
      lon: e.location?.lon ?? null,
    };

    if (e.type === 'crash') {
      const logged: LoggedEvent = { ...base, type: 'crash', features: e.features, outcome: 'pending' };
      logEvent(logged);
      if (!e.simulated) addWindow({ eventId: logged.id, label: 'unlabeled', samples: e.window });
      if (!activeRef.current) setActiveCrash({ event: logged, reasons: e.features.reasons });
    } else if (e.type === 'harsh_brake') {
      logEvent({ ...base, type: 'harsh_brake', fromKmh: e.fromKmh, toKmh: e.toKmh, decelMs2: e.decelMs2 });
      if (e.simulated) setBanner(`Harsh braking ${e.fromKmh} → ${e.toKmh} km/h logged as a risk point`);
    } else {
      logEvent({ ...base, type: 'impact_rejected', features: e.features, verdict: e.verdict });
      if (e.simulated) {
        const why = e.verdict === 'phone_drop' ? 'classified as a phone drop' : `score ${e.features.score} is below the threshold`;
        setBanner(`No alert: ${why} (impact ${e.features.peakG}g)`);
      }
    }
  }, []);

  const monitor = useMonitor(settings.sensitivity, handleEvent);

  const onCancelCrash = () => {
    if (!activeCrash) return;
    setOutcome(activeCrash.event.id, 'cancelled');
    labelWindow(activeCrash.event.id, 'false_alarm');
    setActiveCrash(null);
    setBanner("Alert cancelled. Glad you're OK!");
  };

  const onCrashTimeout = async () => {
    if (!activeCrash) return;
    const ev = activeCrash.event;
    setOutcome(ev.id, 'alert_sent');
    labelWindow(ev.id, 'crash');
    setActiveCrash(null);
    setAlertSent(ev);
    const msg = buildAlertMessage({ riderName: settings.riderName, lat: ev.lat, lon: ev.lon, t: ev.t, simulated: ev.simulated });
    await sendSmsAlert(settings.contacts, msg);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        {tab === 'home' && (
          <HomeScreen
            running={monitor.running}
            live={monitor.live}
            error={monitor.error}
            contactsCount={settings.contacts.length}
            onToggle={monitor.running ? monitor.stop : monitor.start}
            onSimulate={monitor.simulate}
            onGoSettings={() => setTab('settings')}
          />
        )}
        {tab === 'history' && (
          <HistoryScreen
            events={events}
            showRejected={settings.showRejected}
            onClear={() => {
              clearHistory();
              setEvents([]);
            }}
          />
        )}
        {tab === 'settings' && <SettingsScreen settings={settings} onChange={updateSettings} />}
      </View>

      {banner && (
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerText}>{banner}</Text>
        </View>
      )}

      <SafeAreaView edges={['bottom']} style={styles.tabBar}>
        <TabButton label="Home" icon="🏍️" active={tab === 'home'} onPress={() => setTab('home')} />
        <TabButton label="History" icon="📋" active={tab === 'history'} onPress={() => setTab('history')} />
        <TabButton label="Settings" icon="⚙️" active={tab === 'settings'} onPress={() => setTab('settings')} />
      </SafeAreaView>

      <CountdownOverlay
        visible={!!activeCrash}
        seconds={activeCrash?.event.simulated ? Math.min(10, settings.countdownSec) : settings.countdownSec}
        simulated={!!activeCrash?.event.simulated}
        reasons={activeCrash?.reasons ?? []}
        onCancel={onCancelCrash}
        onTimeout={onCrashTimeout}
      />

      <Modal visible={!!alertSent} animationType="slide" onRequestClose={() => setAlertSent(null)}>
        <View style={styles.sentRoot}>
          <Text style={styles.sentTitle}>Alert sent</Text>
          <Text style={styles.sentBody}>
            {settings.contacts.length
              ? `${settings.contacts.map((c) => c.name).join(', ')} will receive your location`
              : 'No emergency contacts yet. Please add them in Settings.'}
          </Text>
          <Pressable style={styles.callBtn} onPress={() => callEmergency()}>
            <Text style={styles.callText}>Call {EMERGENCY_NUMBER}</Text>
            <Text style={styles.callHint}>Emergency medical services</Text>
          </Pressable>
          <Pressable style={styles.closeBtn} onPress={() => setAlertSent(null)}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TabButton({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.tab} onPress={onPress}>
      <Text style={[styles.tabIcon, !active && { opacity: 0.5 }]}>{icon}</Text>
      <Text style={[styles.tabLabel, active && { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: space(2) },
  tabIcon: { fontSize: 20 },
  tabLabel: { color: colors.muted, fontSize: 12, marginTop: 2, fontWeight: '600' },
  banner: {
    position: 'absolute',
    left: space(4),
    right: space(4),
    bottom: 84,
    backgroundColor: colors.cardHi,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    borderRadius: radius.sm,
    padding: space(4),
  },
  bannerText: { color: colors.text, fontSize: 14 },
  sentRoot: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: space(6) },
  sentTitle: { color: colors.text, fontSize: 30, fontWeight: '800', textAlign: 'center' },
  sentBody: { color: colors.muted, fontSize: 16, textAlign: 'center', marginTop: space(3), marginBottom: space(10) },
  callBtn: { backgroundColor: colors.danger, borderRadius: radius.lg, paddingVertical: space(6), alignItems: 'center' },
  callText: { color: '#fff', fontSize: 30, fontWeight: '800' },
  callHint: { color: '#FFD6D6', marginTop: space(1) },
  closeBtn: { marginTop: space(4), paddingVertical: space(4), alignItems: 'center' },
  closeText: { color: colors.muted, fontSize: 16 },
});
