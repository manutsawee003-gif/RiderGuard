import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { buildAlertMessage, sendSmsAlert } from '../alert';
import { Sensitivity } from '../detection/types';
import { newId, Settings } from '../storage';
import { colors, radius, space } from '../theme';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
}

const SENS: { key: Sensitivity; label: string; hint: string }[] = [
  { key: 'low', label: 'Low', hint: 'Rough / off-road' },
  { key: 'normal', label: 'Normal', hint: 'Recommended' },
  { key: 'high', label: 'High', hint: 'Slow riding / testing' },
];
const COUNTDOWNS = [15, 30, 60];

export function SettingsScreen({ settings, onChange }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  const addContact = () => {
    const p = phone.replace(/[^\d+]/g, '');
    if (!name.trim() || p.length < 9) {
      Alert.alert('Missing details', 'Please enter a valid name and phone number.');
      return;
    }
    set({ contacts: [...settings.contacts, { id: newId(), name: name.trim(), phone: p }] });
    setName('');
    setPhone('');
  };

  const testAlert = async () => {
    const msg = buildAlertMessage({ riderName: settings.riderName, lat: 13.7563, lon: 100.5018, t: Date.now(), simulated: true });
    const ok = await sendSmsAlert(settings.contacts, msg);
    if (!ok) Alert.alert('Could not send', settings.contacts.length ? 'This device cannot send SMS.' : 'No contacts added yet.');
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.section}>Rider name</Text>
      <TextInput
        style={styles.input}
        value={settings.riderName}
        onChangeText={(riderName) => set({ riderName })}
        placeholder="Name shown in the alert message"
        placeholderTextColor={colors.muted}
      />

      <Text style={styles.section}>Emergency contacts</Text>
      {settings.contacts.map((c) => (
        <View key={c.id} style={styles.contact}>
          <View style={{ flex: 1 }}>
            <Text style={styles.contactName}>{c.name}</Text>
            <Text style={styles.contactPhone}>{c.phone}</Text>
          </View>
          <Pressable onPress={() => set({ contacts: settings.contacts.filter((x) => x.id !== c.id) })} hitSlop={10}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={name}
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor={colors.muted}
        />
        <TextInput
          style={[styles.input, { flex: 1.2 }]}
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone number"
          keyboardType="phone-pad"
          placeholderTextColor={colors.muted}
        />
      </View>
      <Pressable style={styles.primary} onPress={addContact}>
        <Text style={styles.primaryText}>+ Add contact</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={testAlert}>
        <Text style={styles.secondaryText}>Send a test alert</Text>
      </Pressable>

      <Text style={styles.section}>Detection sensitivity</Text>
      <View style={styles.segment}>
        {SENS.map((s) => {
          const active = settings.sensitivity === s.key;
          return (
            <Pressable
              key={s.key}
              style={[styles.segItem, active && styles.segActive]}
              onPress={() => set({ sensitivity: s.key })}
            >
              <Text style={[styles.segLabel, active && { color: colors.accentInk }]}>{s.label}</Text>
              <Text style={[styles.segHint, active && { color: colors.accentInk }]}>{s.hint}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.section}>Countdown before alerting</Text>
      <View style={styles.segment}>
        {COUNTDOWNS.map((n) => {
          const active = settings.countdownSec === n;
          return (
            <Pressable key={n} style={[styles.segItem, active && styles.segActive]} onPress={() => set({ countdownSec: n })}>
              <Text style={[styles.segLabel, active && { color: colors.accentInk }]}>{n} s</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>Show filtered-out events</Text>
          <Text style={styles.switchHint}>e.g. potholes, phone drops (useful when tuning the algorithm)</Text>
        </View>
        <Switch
          value={settings.showRejected}
          onValueChange={(showRejected) => set({ showRejected })}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      </View>

      <Text style={styles.disclaimer}>
        RiderGuard is an assistive tool and cannot guarantee that every crash is detected. Always wear a helmet and ride safely.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space(5), paddingBottom: space(12) },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  section: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: space(7), marginBottom: space(2) },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    fontSize: 16,
  },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    padding: space(3),
    marginBottom: space(2),
  },
  contactName: { color: colors.text, fontWeight: '600', fontSize: 16 },
  contactPhone: { color: colors.muted, marginTop: 2 },
  remove: { color: colors.danger, fontWeight: '600' },
  addRow: { flexDirection: 'row', gap: space(2) },
  primary: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: space(3), alignItems: 'center', marginTop: space(3) },
  primaryText: { color: colors.accentInk, fontWeight: '800', fontSize: 16 },
  secondary: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: space(3),
    alignItems: 'center',
    marginTop: space(2),
  },
  secondaryText: { color: colors.text, fontWeight: '600' },
  segment: { flexDirection: 'row', gap: space(2) },
  segItem: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingVertical: space(3),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  segActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  segLabel: { color: colors.text, fontWeight: '700', fontSize: 16 },
  segHint: { color: colors.muted, fontSize: 11, marginTop: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: space(7), gap: space(3) },
  switchLabel: { color: colors.text, fontWeight: '600' },
  switchHint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  disclaimer: { color: colors.muted, fontSize: 12, marginTop: space(10), lineHeight: 18 },
});
