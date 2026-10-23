import { useCallback, useEffect, useState } from "react";
import * as Speech from "expo-speech";

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿ]/;

/** Urdu or Sindhi script → Urdu voice (Sindhi has no system voice); else English. */
export function speechLanguage(text: string) {
  return ARABIC_SCRIPT.test(text) ? "ur-PK" : "en-US";
}

/** Drops markdown the model may still emit, for display and speech. */
export function cleanText(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

let voices: Promise<Speech.Voice[]> | null = null;
async function hasVoice(lang: string) {
  voices ??= Speech.getAvailableVoicesAsync().catch(() => []);
  const list = await voices;
  // An empty list means the platform doesn't report voices; just try.
  return list.length === 0 || list.some((v) => v.language.toLowerCase().startsWith(lang));
}

/** Reads text aloud; one at a time. `speakingKey` is the bubble being read. */
export function useSpeaker() {
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);

  useEffect(() => () => void Speech.stop(), []);

  const stop = useCallback(() => {
    void Speech.stop();
    setSpeakingKey(null);
  }, []);

  const speak = useCallback(async (key: string, text: string) => {
    const words = cleanText(text);
    if (!words) return;
    setSpeakingKey(key);
    const done = () => setSpeakingKey((k) => (k === key ? null : k));
    // On Android a stop that is still pending cancels the next utterance.
    await Speech.stop();
    let language = speechLanguage(words);
    // No Urdu voice installed: the default voice is better than silence.
    if (language === "ur-PK" && !(await hasVoice("ur"))) language = "en-US";
    Speech.speak(words, { language, rate: 0.95, onDone: done, onStopped: done, onError: done });
  }, []);

  return { speakingKey, speaking: speakingKey !== null, speak, stop };
}
