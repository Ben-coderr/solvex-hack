import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Vibration } from 'react-native';
import { i18n, type Locale } from '../i18n';

/**
 * Countdown alarm: sound + vibration + voice, all three (docs/06 §7). The alarm plays on the MEDIA stream with
 * playsInSilentMode, so the ringer switch does not mute it (Android) — a media volume at zero still does: the
 * onboarding says so and Settings has a test button. Voice: device TTS in the UI language if the phone has that
 * language's data, else the recorded clip (assets/audio/voice_*.m4a).
 */
const ALARM = require('../../assets/audio/alarm.m4a');
const VOICE: Record<Locale, number> = {
  ar: require('../../assets/audio/voice_ar.m4a'),
  fr: require('../../assets/audio/voice_fr.m4a'),
  en: require('../../assets/audio/voice_en.m4a'),
};
const TTS_LANG: Record<Locale, string> = { ar: 'ar', fr: 'fr-FR', en: 'en-US' };
const VIBRATE = [0, 600, 400];

let alarm: AudioPlayer | null = null;
let voice: AudioPlayer | null = null;
let voiceTimer: ReturnType<typeof setInterval> | null = null;
let ttsOk: Partial<Record<Locale, boolean>> = {};

async function hasTts(locale: Locale): Promise<boolean> {
  if (ttsOk[locale] !== undefined) return ttsOk[locale]!;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    ttsOk[locale] = voices.some((v) => v.language.toLowerCase().startsWith(locale));
  } catch {
    ttsOk[locale] = false;
  }
  return ttsOk[locale]!;
}

async function sayOnce(locale: Locale) {
  if (alarm) alarm.volume = 0.35; // duck the alarm under the voice
  const restore = () => { if (alarm) alarm.volume = 1; };
  if (await hasTts(locale)) {
    Speech.speak(i18n.t('countdown.voice'), { language: TTS_LANG[locale], rate: 0.95, onDone: restore, onError: restore, onStopped: restore });
    return;
  }
  voice?.remove();
  voice = createAudioPlayer(VOICE[locale]);
  voice.volume = 1;
  voice.play();
  setTimeout(restore, 4_500);
}

export async function startAlarm(opts: { voiceEveryMs?: number } = {}) {
  await stopAlarm();
  await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix', shouldPlayInBackground: true }).catch(() => {});
  Vibration.vibrate(VIBRATE, true);
  alarm = createAudioPlayer(ALARM);
  alarm.loop = true;
  alarm.volume = 1;
  alarm.play();
  const locale = (i18n.language as Locale) ?? 'fr';
  void sayOnce(locale);
  voiceTimer = setInterval(() => void sayOnce(locale), opts.voiceEveryMs ?? 10_000);
}

export async function stopAlarm() {
  if (voiceTimer) clearInterval(voiceTimer);
  voiceTimer = null;
  Vibration.cancel();
  await Speech.stop().catch(() => {});
  alarm?.remove();
  voice?.remove();
  alarm = null;
  voice = null;
}

/** Settings → "Test the alarm (3 s)". */
export async function testAlarm() {
  await startAlarm({ voiceEveryMs: 60_000 });
  setTimeout(() => void stopAlarm(), 3_000);
}
