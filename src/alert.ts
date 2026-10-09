import * as SMS from 'expo-sms';
import { Linking } from 'react-native';
import { Contact } from './storage';

export const EMERGENCY_NUMBER = '1669'; // Thailand National Institute for Emergency Medicine

export function mapsLink(lat: number, lon: number) {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

export function buildAlertMessage(opts: {
  riderName: string;
  lat: number | null;
  lon: number | null;
  t: number;
  simulated?: boolean;
}) {
  const who = opts.riderName.trim() || 'A RiderGuard user';
  const time = new Date(opts.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const where =
    opts.lat != null && opts.lon != null ? `Location: ${mapsLink(opts.lat, opts.lon)}` : 'Location unavailable';
  const prefix = opts.simulated ? '[TEST] ' : '';
  return `${prefix}🚨 RiderGuard: ${who} may have had an accident at ${time} and is not responding. Please contact them urgently.\n${where}\nIf needed, call ${EMERGENCY_NUMBER}.`;
}

/**
 * Opens the SMS composer addressed to all emergency contacts.
 * Note: iOS and Android do not allow regular apps to send SMS silently without the user tapping Send.
 * A production version should send through a backend (e.g. Firebase Function + LINE Messaging API / SMS gateway).
 */
export async function sendSmsAlert(contacts: Contact[], message: string): Promise<boolean> {
  if (!contacts.length) return false;
  if (!(await SMS.isAvailableAsync())) return false;
  await SMS.sendSMSAsync(
    contacts.map((c) => c.phone),
    message,
  );
  return true;
}

export function callEmergency(number = EMERGENCY_NUMBER) {
  return Linking.openURL(`tel:${number}`);
}

export function openMap(lat: number, lon: number) {
  return Linking.openURL(mapsLink(lat, lon));
}
