import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScenarioName } from '../detection/simulate';
import { LiveReading } from '../hooks/useMonitor';
import { colors, radius, space } from '../theme';

interface Props {
  running: boolean;
  live: LiveReading;
  error: string | null;
  contactsCount: number;
  onToggle: () => void;
  onSimulate: (s: ScenarioName) => void;
  onGoSettings: () => void;
}

const DEMOS: { key: ScenarioName; label: string; hint: string }[] = [
  { key: 'crash', label: 'Crash', hint: 'Should alert' },
  { key: 'pothole', label: 'Pothole', hint: 'Should not alert' },
  { key: 'phone_drop', label: 'Phone drop', hint: 'Should not alert' },
  { key: 'harsh_brake', label: 'Harsh braking', hint: 'Logs a risk point' },
];

const PHASE_TEXT: Record<LiveReading['phase'], string> = {
  idle: 'Monitoring',
  evaluating: 'Analysing impact…',
  cooldown: 'Detection paused briefly',
};

export function HomeScreen({ running, live, error, contactsCount, onToggle, onSimulate, onGoSettings }: Props) {
  const statusColor = !running ? colors.muted : live.phase === 'evaluating' ? colors.accent : colors.ok;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.brand}>RiderGuard</Text>
      <Text style={styles.tagline}>Crash detection that alerts the people you love</Text>

      {contactsCount === 0 && (
        <Pressable style={styles.warn} onPress={onGoSettings}>
          <Text style={styles.warnText}>No emergency contacts yet. Tap to add one.</Text>
        </Pressable>
      )}

      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.bigBtn,
          { borderColor: statusColor, backgroundColor: running ? '#10241A' : colors.card },
          pressed && { transform: [{ scale: 0.98 }] },
        ]}
      >
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Text style={styles.bigBtnText}>{running ? 'Stop' : 'Start ride'}</Text>
        <Text style={styles.bigBtnSub}>{running ? PHASE_TEXT[live.phase] : 'Tap to start detection'}</Text>
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.grid}>
        <Tile label="Speed" value={live.speedKmh == null ? '–' : live.speedKmh.toFixed(0)} unit="km/h" />
        <Tile label="Peak G-force" value={running ? live.peakG.toFixed(2) : '–'} unit="g" warn={live.peakG >= 2.5} />
        <Tile label="Rotation" value={running ? live.rotRadS.toFixed(2) : '–'} unit="rad/s" warn={live.rotRadS >= 2} />
        <Tile
          label="GPS"
          value={live.gpsAccuracy == null ? '–' : `±${live.gpsAccuracy.toFixed(0)}`}
          unit={live.gpsAccuracy == null ? '' : 'm'}
        />
      </View>

      <Text style={styles.section}>Demo mode</Text>
      <Text style={styles.sectionHint}>Feeds synthetic sensor data into the same algorithm used on real rides, so you can demo without crashing.</Text>
      <View style={styles.demoGrid}>
        {DEMOS.map((d) => (
          <Pressable
            key={d.key}
            onPress={() => onSimulate(d.key)}
            style={({ pressed }) => [styles.demo, pressed && { backgroundColor: colors.cardHi }]}
          >
            <Text style={styles.demoLabel}>{d.label}</Text>
            <Text style={styles.demoHint}>{d.hint}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.footnote}>
        Mount the phone on the handlebar or keep it in a close-fitting pocket, and leave the app open while riding (the screen stays on).
      </Text>
    </ScrollView>
  );
}

function Tile({ label, value, unit, warn }: { label: string; value: string; unit: string; warn?: boolean }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={[styles.tileValue, warn && { color: colors.accent }]}>
        {value}
        <Text style={styles.tileUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space(5), paddingBottom: space(10) },
  brand: { color: colors.accent, fontSize: 30, fontWeight: '800', letterSpacing: 0.5 },
  tagline: { color: colors.muted, fontSize: 14, marginTop: space(1), marginBottom: space(5) },
  warn: {
    backgroundColor: '#3A2A08',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space(3),
    marginBottom: space(4),
  },
  warnText: { color: colors.accent, fontWeight: '600' },
  bigBtn: {
    borderWidth: 3,
    borderRadius: radius.lg,
    paddingVertical: space(10),
    alignItems: 'center',
  },
  dot: { width: 14, height: 14, borderRadius: 7, marginBottom: space(3) },
  bigBtnText: { color: colors.text, fontSize: 30, fontWeight: '800' },
  bigBtnSub: { color: colors.muted, fontSize: 15, marginTop: space(2) },
  error: { color: colors.danger, marginTop: space(3) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3), marginTop: space(5) },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space(4),
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileLabel: { color: colors.muted, fontSize: 13 },
  tileValue: { color: colors.text, fontSize: 28, fontWeight: '700', marginTop: space(1), fontVariant: ['tabular-nums'] },
  tileUnit: { color: colors.muted, fontSize: 14, fontWeight: '400' },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: space(8) },
  sectionHint: { color: colors.muted, fontSize: 13, marginTop: space(1), marginBottom: space(3) },
  demoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  demo: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space(4),
    borderWidth: 1,
    borderColor: colors.border,
  },
  demoLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
  demoHint: { color: colors.muted, fontSize: 12, marginTop: space(1) },
  footnote: { color: colors.muted, fontSize: 12, marginTop: space(8), lineHeight: 18 },
});
