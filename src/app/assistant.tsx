import { useEffect, useRef, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { UIMessage } from "@convex-dev/agent/react";
import { SquarePen, Volume2, VolumeX, WifiOff } from "lucide-react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Composer } from "@/components/kisan/assistant/composer";
import { MessageBubble } from "@/components/kisan/assistant/message-bubble";
import { useSpeaker } from "@/components/kisan/assistant/speech";
import { Chip, IconButton, ScreenTitle, StateView } from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { useAssistant } from "@/hooks/use-assistant";
import { useMe } from "@/lib/api/resources";

const SUGGESTIONS = [
  "Aaj Hyderabad mein gandum ka rate kya hai?",
  "Where should I sell my cotton?",
  "Is tomato going up or down this week?",
  "Set an alert when tomato goes above 3,000",
];

/** Kisan Dost: farming assistant chat with voice (docs/plan.md §6). */
export default function AssistantScreen() {
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const insets = useSafeAreaInsets();
  const language = useMe().data?.language ?? "en";
  // A pre-filled question (e.g. "is this offer fair?") gets its own thread.
  const chat = useAssistant({ fresh: !!prompt });
  const speaker = useSpeaker();
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const list = useRef<FlatList<UIMessage>>(null);
  const sentPrompt = useRef(false);
  const spoken = useRef(new Set<string>());
  const items = chat.messages;
  const last = items.at(-1);

  const { threadId, send } = chat;
  useEffect(() => {
    if (prompt && threadId && !sentPrompt.current) {
      sentPrompt.current = true;
      void send(prompt);
    }
  }, [prompt, threadId, send]);

  // Auto-speak: read each finished reply once.
  useEffect(() => {
    if (!autoSpeak || !last || last.role !== "assistant" || last.status !== "success") return;
    if (spoken.current.has(last.key) || !last.text) return;
    spoken.current.add(last.key);
    speaker.speak(last.key, last.text);
  }, [autoSpeak, last, speaker]);

  // Replies already on screen when auto-speak is turned on are not read.
  const toggleAutoSpeak = () => {
    items.forEach((m) => spoken.current.add(m.key));
    if (autoSpeak) speaker.stop();
    setAutoSpeak(!autoSpeak);
  };

  const respond = async (approvalId: string, approved: boolean) => {
    setRespondingId(approvalId);
    await chat.respond(approvalId, approved);
    setRespondingId(null);
  };

  const lastUserText = items.findLast((m) => m.role === "user")?.text;
  const errorMessage =
    chat.error?.code === "RATE_LIMITED"
      ? "You've asked a lot this hour. Please try again a little later."
      : chat.error?.message;

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <ScreenTitle
          title="Kisan Dost"
          right={
            <View style={styles.headerActions}>
              <IconButton
                Icon={autoSpeak ? Volume2 : VolumeX}
                label={autoSpeak ? "Stop reading replies aloud" : "Read replies aloud"}
                onPress={toggleAutoSpeak}
              />
              <IconButton
                Icon={SquarePen}
                label="New conversation"
                onPress={() => {
                  speaker.stop();
                  void chat.newChat();
                }}
              />
            </View>
          }
        />
      </View>

      {!chat.threadId && chat.error ? (
        <StateView error={chat.error} onRetry={() => void chat.retryStart()} style={styles.flex} />
      ) : chat.loading ? (
        <StateView loading style={styles.flex} />
      ) : (
        <FlatList
          ref={list}
          style={styles.flex}
          data={items}
          keyExtractor={(m) => m.key}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          onStartReached={() => chat.canLoadMore && chat.loadMore()}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Assalam-o-Alaikum!</Text>
              <Text style={styles.emptyText}>
                Ask me about today&apos;s mandi rates, the best market to sell in, price trends, or
                set an alert. Type, or hold the mic and speak in Urdu, Sindhi or English.
              </Text>
            </View>
          }
          ListFooterComponent={
            chat.thinking && last?.role === "user" ? (
              <Text style={styles.thinking}>Kisan Dost is thinking…</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              speaking={speaker.speakingKey === item.key}
              onSpeak={() =>
                speaker.speakingKey === item.key
                  ? speaker.stop()
                  : speaker.speak(item.key, item.text ?? "")
              }
              onRespond={(approvalId, approved) => void respond(approvalId, approved)}
              respondingId={respondingId}
              onRetry={lastUserText ? () => void chat.send(lastUserText) : undefined}
            />
          )}
        />
      )}

      {chat.threadId && errorMessage && (
        <View style={styles.error} accessibilityLiveRegion="polite">
          <WifiOff size={15} color={theme.red} strokeWidth={2.2} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {chat.threadId && !chat.loading && items.length === 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
          style={styles.chipsRow}
        >
          {SUGGESTIONS.map((s) => (
            <Chip key={s} label={s} onPress={() => void chat.send(s)} />
          ))}
        </ScrollView>
      )}

      <View style={{ paddingBottom: insets.bottom + 10, paddingTop: 6 }}>
        <Composer
          key={chat.threadId}
          onSend={chat.send}
          disabled={!chat.threadId || chat.loading || chat.sending}
          language={language}
          onVoiceStart={() => {
            speaker.stop();
            chat.clearError();
          }}
          onVoiceError={(message) => chat.setVoiceError(message)}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  flex: { flex: 1 },
  header: { paddingHorizontal: 16 },
  headerActions: { flexDirection: "row", gap: 8 },
  listContent: { paddingVertical: 8, flexGrow: 1 },
  empty: { paddingHorizontal: 28, paddingTop: 40, alignItems: "center", gap: 10 },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 22, color: theme.ink },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: theme.muted,
    textAlign: "center",
  },
  thinking: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: theme.muted,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  chipsRow: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 4,
    backgroundColor: theme.redSoft,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 13, color: theme.red },
});
