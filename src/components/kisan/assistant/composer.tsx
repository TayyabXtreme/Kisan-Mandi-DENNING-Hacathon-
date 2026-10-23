import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Mic, SendHorizontal } from "lucide-react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { useVoiceInput } from "@/hooks/use-voice-input";
import type { Lang } from "../../../../convex/lib/kisan";
import { Tap } from "../tap";

const BARS = [0, 1, 2, 3, 4, 5, 6];
const MIN_HOLD_MS = 600;

/** One bouncing waveform bar (each bar owns its animation; no loops in worklets). */
function WaveBar({ index }: { index: number }) {
  const scale = useSharedValue(0.3);
  useEffect(() => {
    scale.value = withDelay(
      index * 90,
      withRepeat(withTiming(1, { duration: 380 + (index % 3) * 90 }), -1, true),
    );
    return () => cancelAnimation(scale);
  }, [index, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
  return <Animated.View style={[styles.bar, style]} />;
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Text field + send, or a hold-to-talk mic when the field is empty.
 * Release sends the transcript (Groq Whisper via api.ai.transcribe).
 */
export function Composer({
  onSend,
  disabled,
  language,
  onVoiceError,
  onVoiceStart,
}: {
  onSend: (text: string) => Promise<boolean>;
  disabled?: boolean;
  language: Lang;
  onVoiceError: (message: string) => void;
  onVoiceStart?: () => void;
}) {
  const [text, setText] = useState("");
  const voice = useVoiceInput();
  const holding = useRef(false);
  const starting = useRef<Promise<void> | null>(null);
  const startedAt = useRef<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const processing = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      holding.current = false;
    };
  }, []);

  const submit = async () => {
    const body = text.trim();
    if (!body || disabled || processing.current || voice.isBusy) return;
    processing.current = true;
    setSubmitting(true);
    try {
      if (await onSend(body)) setText("");
    } finally {
      processing.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  const pressIn = () => {
    if (disabled || voice.isBusy || processing.current || starting.current) return;
    holding.current = true;
    setHint(null);
    onVoiceStart?.();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    startedAt.current = null;
    starting.current = voice
      .start()
      .then(() => {
        if (mounted.current) startedAt.current = Date.now();
      })
      .catch((e: unknown) => {
        startedAt.current = null;
        if (mounted.current)
          onVoiceError(e instanceof Error ? e.message : "Couldn't start the microphone.");
      });
  };

  const pressOut = async () => {
    if (!holding.current) return;
    holding.current = false;
    processing.current = true;
    try {
      await starting.current;
      const began = startedAt.current;
      startedAt.current = null;
      if (began === null || !mounted.current) return;
      // A tap (including releasing during a permission prompt) isn't speech.
      // Finalize and discard it without consuming an AI request.
      if (Date.now() - began < MIN_HOLD_MS) {
        await voice.cancel();
        if (mounted.current) setHint("Hold the mic while you speak, then let go.");
        return;
      }
      // Whisper guesses English for short Urdu clips; pass the profile language.
      const transcript = await voice.stop(language === "en" ? undefined : language);
      if (!mounted.current) return;
      if (!transcript) {
        setHint("Didn't catch that. Try again a bit louder.");
        return;
      }
      // Keep the transcript available to edit/retry if the chat request fails.
      setText(transcript);
      setSubmitting(true);
      if (await onSend(transcript)) setText("");
    } catch (e) {
      if (mounted.current)
        onVoiceError(e instanceof Error ? e.message : "Couldn't hear that. Try again.");
    } finally {
      starting.current = null;
      processing.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  const typing = text.trim().length > 0;

  return (
    <View>
      {(voice.isBusy || hint) && (
        <View style={styles.voiceBar} accessibilityLiveRegion="polite">
          {voice.isRecording ? (
            <>
              <View style={styles.dot} />
              <Text style={styles.timer}>{clock(voice.durationMillis)}</Text>
              <View style={styles.wave}>
                {BARS.map((i) => (
                  <WaveBar key={i} index={i} />
                ))}
              </View>
              <Text style={styles.voiceHint}>Release to send</Text>
            </>
          ) : voice.isStarting || voice.isTranscribing ? (
            <>
              <ActivityIndicator size="small" color={theme.green} />
              <Text style={styles.voiceHint}>{voice.isStarting ? "Starting microphone…" : "Understanding your voice…"}</Text>
            </>
          ) : (
            <Text style={styles.voiceHint}>{hint}</Text>
          )}
        </View>
      )}
      <View style={styles.row}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Ask about prices, mandis, alerts…"
          placeholderTextColor={theme.muted}
          multiline
          maxLength={1000}
          editable={!voice.isBusy && !submitting}
          accessibilityLabel="Message to Kisan Dost"
          style={styles.input}
        />
        {typing ? (
          <Tap
            onPress={() => void submit()}
            disabled={disabled || voice.isBusy || submitting}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={[styles.round, { backgroundColor: disabled ? "#B1A99E" : theme.green }]}
          >
            <SendHorizontal size={22} color={theme.card} strokeWidth={2.2} />
          </Tap>
        ) : (
          <Tap
            onPressIn={pressIn}
            onPressOut={() => void pressOut()}
            disabled={disabled || voice.isTranscribing || submitting}
            accessibilityRole="button"
            accessibilityLabel="Hold to talk"
            accessibilityHint="Hold while you speak, release to send"
            pressedStyle={{ transform: [{ scale: 1.12 }] }}
            style={[
              styles.round,
              styles.mic,
              { backgroundColor: voice.isRecording ? theme.red : disabled ? "#B1A99E" : theme.green },
            ]}
          >
            <Mic size={24} color={theme.card} strokeWidth={2.2} />
          </Tap>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 12 },
  input: {
    flex: 1,
    minHeight: 50,
    maxHeight: 120,
    borderRadius: 25,
    backgroundColor: theme.card,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    fontFamily: fonts.regular,
    fontSize: 15.5,
    color: theme.ink,
  },
  round: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  mic: { width: 56, height: 56, borderRadius: 28, marginBottom: -3 },
  voiceBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.card,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.red },
  timer: { fontFamily: fonts.semibold, fontSize: 14, color: theme.ink, minWidth: 36 },
  wave: { flexDirection: "row", alignItems: "center", gap: 3, height: 24 },
  bar: { width: 4, height: 24, borderRadius: 2, backgroundColor: theme.green },
  voiceHint: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: theme.muted, textAlign: "right" },
});
