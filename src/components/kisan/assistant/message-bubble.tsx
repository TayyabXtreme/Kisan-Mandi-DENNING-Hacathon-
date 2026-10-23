import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle, RotateCcw, Volume2, VolumeX } from "lucide-react-native";
import type { UIMessage } from "@convex-dev/agent/react";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { Tap } from "../tap";
import { cleanText } from "./speech";
import { ToolCard, type ToolPart } from "./tool-cards";

const RTL = /^[\s\d.,:;!?()"'-]*[؀-ۿ]/;

export function MessageBubble({
  message,
  speaking,
  onSpeak,
  onRespond,
  respondingId,
  onRetry,
}: {
  message: UIMessage;
  speaking: boolean;
  onSpeak: () => void;
  onRespond: (approvalId: string, approved: boolean) => void;
  /** Approval id whose Confirm/Cancel request is in flight. */
  respondingId: string | null;
  /** Resend the question that failed (assistant failures only). */
  onRetry?: () => void;
}) {
  const mine = message.role === "user";
  const text = cleanText(message.text ?? "");
  const rtl = RTL.test(text);

  if (mine)
    return (
      <View style={[styles.wrap, styles.mineWrap]}>
        <View style={[styles.bubble, styles.mine]}>
          <Text style={[styles.text, styles.mineText, rtl && styles.rtl]}>{text}</Text>
        </View>
      </View>
    );

  const tools = message.parts.filter((p) => p.type.startsWith("tool-")) as unknown as ToolPart[];
  const failed = message.status === "failed";
  const streaming = message.status === "streaming" || message.status === "pending";

  return (
    <View style={[styles.wrap, styles.theirsWrap]}>
      {tools.map((part, i) => (
        <ToolCard
          key={`${part.type}${i}`}
          part={part}
          onRespond={onRespond}
          busy={!!part.approval && part.approval.id === respondingId}
        />
      ))}
      {!!text && (
        <View style={[styles.bubble, styles.theirs, tools.length > 0 && { marginTop: 6 }]}>
          <Text style={[styles.text, rtl && styles.rtl]}>{text}</Text>
          {!streaming && (
            <Tap
              onPress={onSpeak}
              accessibilityRole="button"
              accessibilityLabel={speaking ? "Stop reading" : "Read aloud"}
              hitSlop={10}
              style={styles.speaker}
            >
              {speaking ? (
                <VolumeX size={16} color={theme.green} strokeWidth={2.2} />
              ) : (
                <Volume2 size={16} color={theme.muted} strokeWidth={2.2} />
              )}
            </Tap>
          )}
        </View>
      )}
      {failed && (
        <View style={styles.failed}>
          <AlertTriangle size={15} color={theme.red} strokeWidth={2.2} />
          <Text style={styles.failedText}>
            Kisan Dost couldn&apos;t answer right now. The AI service may be busy.
          </Text>
          {onRetry && (
            <Tap onPress={onRetry} accessibilityRole="button" accessibilityLabel="Ask again" hitSlop={8}>
              <RotateCcw size={16} color={theme.red} strokeWidth={2.2} />
            </Tap>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginVertical: 4 },
  mineWrap: { alignItems: "flex-end" },
  theirsWrap: { alignItems: "flex-start" },
  bubble: { maxWidth: "84%", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { backgroundColor: theme.green, borderBottomRightRadius: 6 },
  theirs: {
    backgroundColor: theme.card,
    borderBottomLeftRadius: 6,
    paddingBottom: 8,
  },
  text: { fontFamily: fonts.regular, fontSize: 15.5, lineHeight: 22, color: theme.ink },
  mineText: { color: theme.card },
  rtl: { textAlign: "right", writingDirection: "rtl", fontFamily: undefined, fontSize: 17, lineHeight: 28 },
  speaker: { alignSelf: "flex-end", marginTop: 4, padding: 2 },
  failed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    maxWidth: "84%",
    backgroundColor: theme.redSoft,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  failedText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 13, color: theme.red },
});
