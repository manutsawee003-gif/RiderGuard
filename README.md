# RiderGuard 🏍️

A motorcycle crash-detection app that uses only the phone's built-in sensors (accelerometer + gyroscope + GPS).
Built with React Native (Expo + TypeScript).

## Features

- **Multi-signal crash detection** — impact force, flip/tumble rotation, sudden loss of speed, and stillness after the impact
- **False-alarm filtering** — separates dropped phones (free-fall detection) and potholes (rider keeps going, speed does not drop)
- **Voice and vibration countdown** — the rider taps "I'm OK" to cancel
- **Emergency contact alert** by SMS with a Google Maps link, plus a one-tap call to 1669 (Thai emergency medical services)
- **Harsh-braking log** from GPS deceleration, stored as risk points (basis for a heatmap)
- **Demo mode** — feeds four synthetic scenarios into the real algorithm, so you can present without crashing
- **ML dataset collection** — raw sensor windows around each crash are labelled automatically from the rider's response (cancelled = false alarm, not cancelled = crash) and exported as CSV

## Setup and run

Requires Node.js 20+ and the **Expo Go** app on your phone. Sensors do not work in a simulator, so test on a real device.

```bash
# 1) Create a blank Expo project
npx create-expo-app@latest riderguard --template blank-typescript
cd riderguard

# 2) Install libraries (expo install picks versions that match your SDK)
npx expo install expo-sensors expo-location expo-speech expo-sms expo-keep-awake \
  @react-native-async-storage/async-storage react-native-safe-area-context

# 3) Copy these files over the new project: App.tsx, app.json, src/, scripts/
#    (if your app.json already has other settings, e.g. an icon, merge in the ios/android/plugins sections)

# 4) Start, then scan the QR code with Expo Go
npx expo start
```

Test the algorithm on a computer (no phone needed):

```bash
npx tsx scripts/test-detector.ts
```

## Project structure

```
App.tsx                         Tabs, event handling, post-alert screen
src/detection/types.ts          Data types + thresholds (tune them here)
src/detection/CrashDetector.ts  Detection algorithm (pure TypeScript, no React Native dependency)
src/detection/simulate.ts       Synthetic sensor data generator
src/hooks/useMonitor.ts         Reads IMU at 50 Hz + GPS at 1 Hz and feeds the detector
src/screens/                    Home, countdown, history, settings
src/alert.ts                    Alert message, SMS, call 1669
src/storage.ts                  Settings / history / dataset in AsyncStorage
scripts/test-detector.ts        Algorithm tests on synthetic data
```

## Algorithm

1. **Trigger**: |a| = √(ax² + ay² + az²) ≥ 3.5g opens a suspicious event; the app keeps recording for another 6 seconds.
2. **Feature scoring** over the window around the impact:

| Condition | Points |
|---|---|
| Impact ≥ 3.5g | +1 |
| Impact ≥ 6g | +1 |
| Peak angular velocity ≥ 3 rad/s (flip / tumble) | +1 |
| Speed ≥ 10 km/h before and ≤ 5 km/h after | +2 |
| Std. deviation of \|a\| from 2–6 s after impact ≤ 0.08g (lying still) | +1 |

3. **Filters before deciding**: if the rider was known not to be moving (< 10 km/h), the event is discarded; if there was free fall (|a| < 0.35g for ≥ 120 ms) it is classified as a phone drop.
4. **Score ≥ 4 = crash** → countdown → alert.
5. **Harsh braking**: GPS deceleration ≥ 4 m/s² while riding faster than 20 km/h.

The Low / Normal / High sensitivity setting adjusts the impact, rotation and braking thresholds.

## Limitations of this version (worth stating in your report)

- **Thresholds were tuned on synthetic data** and have not yet been calibrated against real rides.
- **Works only while the app is open** (the screen is kept on). Background operation is not supported yet.
- **The rider's phone must confirm the SMS**: iOS and Android do not let apps send SMS silently.
- Without GPS (indoors, under expressways) the app decides from motion sensors alone and needs the full 4 IMU points.

## Next steps

1. **Collect real data**: normal riding, rough roads, phone drops (onto a cushion), then export CSV.
2. **Evaluate**: confusion matrix, false alarms per riding hour, recall.
3. **Train an ML model**: use the existing features or raw windows to train a Random Forest / 1D-CNN in Python and compare it with the scoring rules.
4. **Backend**: Firebase/Supabase to send alerts automatically through the LINE Messaging API or an SMS gateway.
5. **Risk map**: aggregate harsh-braking events from many riders into a web heatmap.
6. **Background mode**: development build + Android foreground service.

> ⚠️ Never test by actually crashing a motorcycle. Use Demo mode, or drop the phone onto a mattress or cushion.
