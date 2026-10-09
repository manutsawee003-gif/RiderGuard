import React from 'react';
import { Alert, FlatList, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { openMap } from '../alert';
import { LoggedEvent, loadWindows } from '../storage';
import { colors, radius, space } from '../theme';

interface Props {
  events: LoggedEvent[];
  showRejected: boolean;
  onClear: () => void;
}

const VERDICT_TEXT: Record<string, string> = {
  phone_drop: 'Phone drop',
  not_riding: 'Not riding',
  low_score: 'Below threshold',
};

const OUTCOME_TEXT: Record<string, string> = {
  cancelled: 'Cancelled by rider (OK)',
  alert_sent: 'Alert sent',
  pending: 'Awaiting response',
};

function describe(e: LoggedEvent) {
  switch (e.type) {
    case 'crash':
      return { icon: '🚨', title: 'Crash detected', color: colors.danger, detail: OUTCOME_TEXT[e.outcome ?? 'pending'] };
    case 'harsh_brake':
      return {
        icon: '⚠️',
        title: 'Harsh braking',
        color: colors.accent,
        detail: `${e.fromKmh} → ${e.toKmh} km/h (${e.decelMs2} m/s²)`,
      };
    default:
      return {
        icon: '🛡️',
        title: 'Filtered out: ' + (VERDICT_TEXT[e.verdict ?? ''] ?? 'Not a crash'),
        color: colors.muted,
        detail: `Score ${e.features?.score ?? 0} · ${e.features?.peakG ?? 0}g`,
      };
  }
}

/** Export as CSV in two parts: event summary (for a risk map) and raw windows around crashes (ML dataset) */
async function exportCsv(events: LoggedEvent[]) {
  const head = 'id,type,time_iso,simulated,lat,lon,score,peak_g,peak_rot,speed_before,speed_after,verdict,outcome,from_kmh,to_kmh,decel';
  const rows = events.map((e) =>
    [
      e.id,
      e.type,
      new Date(e.t).toISOString(),
      e.simulated,
      e.lat ?? '',
      e.lon ?? '',
      e.features?.score ?? '',
      e.features?.peakG ?? '',
      e.features?.peakRotRadS ?? '',
      e.features?.speedBeforeKmh ?? '',
      e.features?.speedAfterKmh ?? '',
      e.verdict ?? '',
      e.outcome ?? '',
      e.fromKmh ?? '',
      e.toKmh ?? '',
      e.decelMs2 ?? '',
    ].join(','),
  );

  const windows = await loadWindows();
  const raw = ['event_id,label,t_ms,ax,ay,az,gx,gy,gz'];
  for (const w of windows) {
    const t0 = w.samples[0]?.t ?? 0;
    for (const s of w.samples) {
      raw.push(
        [w.eventId, w.label, s.t - t0, s.acc.x, s.acc.y, s.acc.z, s.gyro.x, s.gyro.y, s.gyro.z]
          .map((v) => (typeof v === 'number' ? Number(v.toFixed(4)) : v))
          .join(','),
      );
    }
  }

  await Share.share({
    title: 'RiderGuard export',
    message: `# events\n${[head, ...rows].join('\n')}\n\n# sensor_windows\n${raw.join('\n')}`,
  });
}

export function HistoryScreen({ events, showRejected, onClear }: Props) {
  const visible = showRejected ? events : events.filter((e) => e.type !== 'impact_rejected');
  const crashes = events.filter((e) => e.type === 'crash' && !e.simulated).length;
  const brakes = events.filter((e) => e.type === 'harsh_brake' && !e.simulated).length;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Event history</Text>
        <View style={styles.stats}>
          <Stat n={crashes} label="Crashes" color={colors.danger} />
          <Stat n={brakes} label="Harsh brakes" color={colors.accent} />
          <Stat n={events.length} label="Total" color={colors.text} />
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.action} onPress={() => exportCsv(events)}>
            <Text style={styles.actionText}>Export CSV</Text>
          </Pressable>
          <Pressable
            style={[styles.action, { borderColor: colors.border }]}
            onPress={() =>
              Alert.alert('Clear all history?', 'All saved events and sensor data will be deleted.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: onClear },
              ])
            }
          >
            <Text style={[styles.actionText, { color: colors.muted }]}>Clear</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: space(5), paddingTop: 0, gap: space(3) }}
        ListEmptyComponent={<Text style={styles.empty}>No events yet. Try a Demo mode button on the Home tab.</Text>}
        renderItem={({ item }) => {
          const d = describe(item);
          return (
            <Pressable
              style={styles.item}
              disabled={item.lat == null || item.lon == null}
              onPress={() => item.lat != null && item.lon != null && openMap(item.lat, item.lon)}
            >
              <Text style={styles.icon}>{d.icon}</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.row}>
                  <Text style={[styles.itemTitle, { color: d.color }]}>{d.title}</Text>
                  {item.simulated && <Text style={styles.simTag}>DEMO</Text>}
                </View>
                <Text style={styles.itemDetail}>{d.detail}</Text>
                {item.features?.reasons?.length ? (
                  <Text style={styles.reasons}>{item.features.reasons.join(' · ')}</Text>
                ) : null}
                <Text style={styles.time}>
                  {new Date(item.t).toLocaleString('en-GB')}
                  {item.lat != null ? '  · Tap to open map' : ''}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statN, { color }]}>{n}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: space(5) },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  stats: { flexDirection: 'row', gap: space(3), marginTop: space(4) },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: space(3), alignItems: 'center' },
  statN: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: space(1) },
  actions: { flexDirection: 'row', gap: space(3), marginTop: space(4) },
  action: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: space(3),
    alignItems: 'center',
  },
  actionText: { color: colors.accent, fontWeight: '700' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: space(10) },
  item: {
    flexDirection: 'row',
    gap: space(3),
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space(4),
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: { fontSize: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  itemTitle: { fontSize: 16, fontWeight: '700' },
  simTag: {
    color: colors.accentInk,
    backgroundColor: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: space(2),
    borderRadius: 6,
    overflow: 'hidden',
  },
  itemDetail: { color: colors.text, marginTop: space(1) },
  reasons: { color: colors.muted, fontSize: 12, marginTop: space(1) },
  time: { color: colors.muted, fontSize: 12, marginTop: space(2) },
});
