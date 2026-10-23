import { useEffect, useState } from "react";
import { StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Mic, Pause, Play } from "lucide-react-native";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { Tap } from "../tap";

/** 8500 → "0:08" */
export const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Voice-note bubble body: play/pause, tap-to-seek bar and duration. */
export function VoicePlayer({ url, durationMs, mine }: { url: string | null; durationMs: number; mine: boolean }) {
  const player = useAudioPlayer(url ? { uri: url } : null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [width, setWidth] = useState(0);
  const total = status.duration > 0 ? status.duration * 1000 : durationMs;
  const position = status.currentTime * 1000;
  const progress = total > 0 ? Math.min(1, position / total) : 0;

  // Rewind when it finishes, so the next tap plays from the start.
  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      void player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  const toggle = async () => {
    if (!url) return;
    if (status.playing) {
      player.pause();
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (total > 0 && position >= total - 250) await player.seekTo(0);
    player.play();
  };

  const seek = (e: GestureResponderEvent) => {
    if (!url || width <= 0 || total <= 0) return;
    const fraction = Math.min(1, Math.max(0, e.nativeEvent.locationX / width));
    void player.seekTo((fraction * total) / 1000);
  };

  const accent = mine ? theme.green : theme.ink;
  const Icon = status.playing ? Pause : Play;
  return (
    <View style={styles.row}>
      <Tap
        onPress={() => void toggle()}
        disabled={!url}
        accessibilityRole="button"
        accessibilityLabel={!url ? "Voice note unavailable" : status.playing ? "Pause voice note" : "Play voice note"}
        style={[styles.play, { backgroundColor: url ? accent : theme.line }]}
      >
        <Icon size={18} color={theme.card} fill={theme.card} strokeWidth={2} />
      </Tap>
      <View style={{ flex: 1 }}>
        <Tap
          onPress={seek}
          disabled={!url}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={styles.track}
          accessibilityRole="adjustable"
          accessibilityLabel="Seek"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          pressedStyle={{}}
        >
          <View style={styles.rail} pointerEvents="none">
            <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: accent }]} />
          </View>
          <View
            pointerEvents="none"
            style={[styles.knob, { left: `${progress * 100}%`, backgroundColor: accent }]}
          />
        </Tap>
        <Text style={styles.time}>
          {!url ? "Voice note unavailable" : status.playing || position > 0 ? mmss(position) : mmss(total)}
        </Text>
      </View>
      <View style={[styles.mic, { backgroundColor: mine ? "#C9DEBE" : theme.sand }]}>
        <Mic size={16} color={accent} strokeWidth={2.2} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, width: 230, paddingVertical: 2 },
  play: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  track: { height: 22, justifyContent: "center" },
  rail: { height: 4, borderRadius: 2, backgroundColor: "rgba(43,33,24,0.15)", overflow: "hidden" },
  fill: { height: 4 },
  knob: { position: "absolute", width: 12, height: 12, borderRadius: 6, marginLeft: -6, top: 5 },
  time: { fontFamily: fonts.medium, fontSize: 11.5, color: theme.muted },
  mic: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
});
