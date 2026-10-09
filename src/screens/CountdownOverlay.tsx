import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { colors, radius, space } from '../theme';

interface Props {
  visible: boolean;
  seconds: number;
  simulated: boolean;
  reasons: string[];
  onCancel: () => void;
  onTimeout: () => void;
}

const VIBRATE_PATTERN = [0, 600, 400];
const VOICE = { language: 'en-US' };

/** Countdown shown after a crash is detected: the rider can confirm they are OK before an alert goes out */
export function CountdownOverlay({ visible, seconds, simulated, reasons, onCancel, onTimeout }: Props) {
  const [left, setLeft] = useState(seconds);
  const fired = useRef(false);

  useEffect(() => {
    if (!visible) return;
    fired.current = false;
    setLeft(seconds);
    Vibration.vibrate(VIBRATE_PATTERN, true);
    Speech.speak("Crash detected. If you are OK, tap I'm OK.", VOICE);

    const start = Date.now();
    let lastSpoken = seconds;
    const timer = setInterval(() => {
      const remain = Math.max(0, seconds - Math.floor((Date.now() - start) / 1000));
      setLeft(remain);
      const isNewSecond = remain !== lastSpoken;
      lastSpoken = remain;
      if (isNewSecond && remain > 0 && remain < seconds && (remain % 10 === 0 || remain <= 5)) {
        Speech.speak(remain <= 5 ? String(remain) : `Sending alert in ${remain} seconds`, VOICE);
      }
      if (remain === 0 && !fired.current) {
        fired.current = true;
        clearInterval(timer);
        Vibration.cancel();
        Speech.speak('Alerting your emergency contacts.', VOICE);
        onTimeout();
      }
    }, 250);

    return () => {
      clearInterval(timer);
      Vibration.cancel();
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, seconds]);

  const sendNow = () => {
    if (fired.current) return;
    fired.current = true;
    Vibration.cancel();
    Speech.stop();
    onTimeout();
  };

  const progress = seconds > 0 ? left / seconds : 0;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onCancel}>
      <View style={styles.root}>
        {simulated && <Text style={styles.simTag}>DEMO MODE</Text>}
        <Text style={styles.title}>Crash detected</Text>
        <Text style={styles.subtitle}>Your emergency contacts will receive your location in</Text>

        <View style={styles.ring}>
          <View style={[styles.ringFill, { height: `${progress * 100}%` }]} />
          <Text style={styles.count}>{left}</Text>
          <Text style={styles.unit}>seconds</Text>
        </View>

        {reasons.length > 0 && <Text style={styles.reasons}>{reasons.join(' · ')}</Text>}

        <Pressable style={({ pressed }) => [styles.safeBtn, pressed && { opacity: 0.85 }]} onPress={onCancel}>
          <Text style={styles.safeText}>I'm OK</Text>
          <Text style={styles.safeHint}>Cancel the alert</Text>
        </Pressable>

        <Pressable style={({ pressed }) => [styles.helpBtn, pressed && { opacity: 0.85 }]} onPress={sendNow}>
          <Text style={styles.helpText}>I need help now</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#2A0A0B',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(6),
  },
  simTag: {
    color: colors.accentInk,
    backgroundColor: colors.accent,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
    borderRadius: radius.sm,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: space(4),
    overflow: 'hidden',
  },
  title: { color: colors.text, fontSize: 32, fontWeight: '800' },
  subtitle: { color: '#E8B4B5', fontSize: 16, marginTop: space(2), textAlign: 'center' },
  ring: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 6,
    borderColor: colors.danger,
    marginVertical: space(8),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ringFill: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#5A1517' },
  count: { color: colors.text, fontSize: 84, fontWeight: '800', fontVariant: ['tabular-nums'] },
  unit: { color: '#E8B4B5', fontSize: 16, marginTop: -space(2) },
  reasons: { color: '#C99A9B', fontSize: 13, textAlign: 'center', marginBottom: space(6) },
  safeBtn: {
    alignSelf: 'stretch',
    backgroundColor: colors.ok,
    borderRadius: radius.lg,
    paddingVertical: space(6),
    alignItems: 'center',
  },
  safeText: { color: '#06210F', fontSize: 30, fontWeight: '800' },
  safeHint: { color: '#0E3A1D', fontSize: 14, marginTop: space(1) },
  helpBtn: {
    alignSelf: 'stretch',
    marginTop: space(4),
    borderWidth: 2,
    borderColor: colors.danger,
    borderRadius: radius.lg,
    paddingVertical: space(4),
    alignItems: 'center',
  },
  helpText: { color: colors.danger, fontSize: 18, fontWeight: '700' },
});
