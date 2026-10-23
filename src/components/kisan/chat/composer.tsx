import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { ChevronLeft, Mic, Plus, SendHorizontal, Trash2 } from "lucide-react-native";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { Tap } from "../tap";
import { notify } from "./action-sheet";
import { mmss } from "./voice-player";

/** Drag this far left while holding the mic to cancel the recording. */
const CANCEL_DX = -90;
const MIN_VOICE_MS = 700;

type Props = {
  onSendText: (text: string) => Promise<void>;
  onSendVoice: (uri: string, durationMs: number) => Promise<void>;
  onAttach: () => void;
  sending: boolean;
};

const haptic = () => {
  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

/**
 * WhatsApp-style composer: + attach, text input, and a mic that turns into
 * send while typing. Hold the mic to record a voice note, release to send,
 * slide left to cancel.
 */
export function Composer({ onSendText, onSendVoice, onAttach, sending }: Props) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [dx, setDx] = useState(0);
  const [hint, setHint] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const { durationMillis } = useAudioRecorderState(recorder, 200);

  // Gesture bookkeeping, only touched from event handlers.
  const state = useRef({ pressing: false, started: false, cancelled: false, startedAt: 0, x0: 0 });

  const start = async () => {
    const s = state.current;
    s.cancelled = false;
    setHint(false);
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      notify("Microphone needed", "Allow microphone access to send voice notes.");
      return;
    }
    // The finger was lifted while the permission prompt was open.
    if (!s.pressing) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    if (!s.pressing) return;
    recorder.record();
    s.started = true;
    s.startedAt = Date.now();
    setRecording(true);
    haptic();
  };

  const finish = async (cancel: boolean) => {
    const s = state.current;
    const wasStarted = s.started;
    s.started = false;
    setRecording(false);
    setDx(0);
    if (!wasStarted) {
      // A quick tap: explain how it works.
      if (!cancel) setHint(true);
      return;
    }
    const elapsed = Date.now() - s.startedAt;
    try {
      await recorder.stop();
    } finally {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }
    if (cancel || elapsed < MIN_VOICE_MS) {
      if (!cancel) setHint(true);
      return;
    }
    if (recorder.uri) {
      haptic();
      await onSendVoice(recorder.uri, elapsed);
    }
  };

  // Gesture responder props (no GestureHandlerRootView in this app).
  const micHandlers = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      state.current.pressing = true;
      state.current.x0 = e.nativeEvent.pageX;
      start().catch(() => {
        state.current.started = false;
        setRecording(false);
        notify("Couldn't record", "Your microphone isn't available right now.");
      });
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const value = Math.min(0, e.nativeEvent.pageX - state.current.x0);
      setDx(value);
      if (value < CANCEL_DX && !state.current.cancelled) {
        state.current.cancelled = true;
        state.current.pressing = false;
        haptic();
        void finish(true);
      }
    },
    onResponderRelease: () => {
      state.current.pressing = false;
      if (!state.current.cancelled) void finish(false);
    },
    onResponderTerminate: () => {
      state.current.pressing = false;
      if (!state.current.cancelled) void finish(true);
    },
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setText("");
    try {
      await onSendText(body);
    } catch {
      setText(body); // keep it so the user can retry
    }
  };

  const typing = text.trim().length > 0;
  const cancelProgress = Math.min(1, dx / CANCEL_DX);

  return (
    <View>
      {hint && !recording && (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          Hold the mic to record, release to send.
        </Text>
      )}
      <View style={styles.wrap}>
        {recording ? (
          <View style={[styles.field, styles.recordingField]}>
            <View style={styles.redDot} />
            <Text style={styles.recTime}>{mmss(durationMillis)}</Text>
            <View style={[styles.slide, { opacity: 1 - cancelProgress * 0.6, transform: [{ translateX: dx / 3 }] }]}>
              {cancelProgress > 0.6 ? (
                <Trash2 size={16} color={theme.red} />
              ) : (
                <ChevronLeft size={16} color={theme.muted} />
              )}
              <Text style={styles.slideText}>Slide to cancel</Text>
            </View>
          </View>
        ) : (
          <View style={styles.field}>
            <Tap onPress={onAttach} accessibilityRole="button" accessibilityLabel="Attach photo or offer" hitSlop={6} style={styles.attach}>
              <Plus size={22} color={theme.ink} strokeWidth={2.2} />
            </Tap>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Message"
              placeholderTextColor={theme.muted}
              multiline
              maxLength={2000}
              style={styles.input}
              accessibilityLabel="Message"
            />
          </View>
        )}
        {typing && !recording ? (
          <Tap
            onPress={() => void send()}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={styles.action}
          >
            {sending ? <ActivityIndicator color={theme.card} /> : <SendHorizontal size={21} color={theme.card} strokeWidth={2.2} />}
          </Tap>
        ) : (
          <View
            {...micHandlers}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Hold to record a voice note"
            style={[styles.action, recording && styles.actionRecording]}
          >
            {sending ? <ActivityIndicator color={theme.card} /> : <Mic size={22} color={theme.card} strokeWidth={2.2} />}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingTop: 8 },
  field: {
    flex: 1,
    minHeight: 50,
    maxHeight: 140,
    borderRadius: 25,
    backgroundColor: theme.card,
    flexDirection: "row",
    alignItems: "flex-end",
    paddingLeft: 4,
    paddingRight: 14,
  },
  attach: { width: 42, height: 50, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: theme.ink,
    paddingTop: Platform.OS === "ios" ? 15 : 12,
    paddingBottom: Platform.OS === "ios" ? 15 : 12,
  },
  recordingField: { alignItems: "center", paddingLeft: 18, gap: 10 },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.red },
  recTime: { fontFamily: fonts.semibold, fontSize: 15, color: theme.ink, minWidth: 40 },
  slide: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  slideText: { fontFamily: fonts.medium, fontSize: 14, color: theme.muted },
  action: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.green,
    alignItems: "center",
    justifyContent: "center",
  },
  actionRecording: { transform: [{ scale: 1.25 }], backgroundColor: theme.red },
  hint: {
    alignSelf: "center",
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: theme.card,
    backgroundColor: theme.ink,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: "hidden",
    marginTop: 6,
  },
});
