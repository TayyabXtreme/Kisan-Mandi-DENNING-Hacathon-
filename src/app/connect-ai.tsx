import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { formatDistanceToNow } from "date-fns";
import { Bot, Check, Copy, Link2, Plug, RefreshCw, ShieldAlert, Unplug } from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Tap } from "@/components/kisan/tap";
import { Button, ConfirmDialog, ScreenTitle, StateView } from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api, ApiError } from "@/lib/api/client";
import { useResource } from "@/lib/api/resources";
import type { McpKeyStatus } from "@/lib/api/types";

type App = "claude" | "chatgpt" | "other";

const APPS: { value: App; label: string }[] = [
  { value: "claude", label: "Claude" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "other", label: "Other apps" },
];

const EXAMPLES = [
  "What's the wheat price in my mandi today?",
  "Where is onion selling for the most right now?",
  "Show me the tomato price trend for the last 2 weeks.",
  "Find basmati rice listings in Hyderabad, cheapest first.",
];

/** Connect the user's KisanMandi account to ChatGPT / Claude (MCP). */
export default function ConnectAi() {
  const insets = useSafeAreaInsets();
  const status = useResource<{ key: McpKeyStatus | null }>("/mcp-key");
  // The full link is only known right after it is created.
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"create" | "revoke" | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"regenerate" | "revoke" | null>(null);
  const [app, setApp] = useState<App>("claude");
  const key = status.data?.key ?? null;

  const create = async () => {
    setConfirm(null);
    setBusy("create");
    setError("");
    try {
      const res = await api.post<{ url: string }>("/mcp-key", {});
      setLink(res.url);
      setCopied(false);
      await status.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create your link. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    setConfirm(null);
    setBusy("revoke");
    setError("");
    try {
      await api.del("/mcp-key");
      setLink(null);
      await status.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't disconnect. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    if (process.env.EXPO_OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
  };

  const shownLink = link ?? "<your KisanMandi link>";

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 32 }]}>
        <ScreenTitle title="Connect AI" />

        {/* Intro */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Bot size={26} color={theme.card} strokeWidth={2.2} />
          </View>
          <Text style={styles.heroTitle}>Use KisanMandi in ChatGPT or Claude</Text>
          <Text style={styles.heroText}>
            Connect your account and ask about mandi prices, trends, the best market to sell in, the
            marketplace{"\n"}and your own alerts and listings, right from your AI chat.
          </Text>
        </View>

        {/* Link */}
        <Text style={styles.section}>YOUR LINK</Text>
        {status.loading ? (
          <StateView loading />
        ) : status.error && !status.data ? (
          <StateView error={status.error} onRetry={() => void status.refresh()} />
        ) : link ? (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: theme.green }]} />
              <Text style={styles.statusText}>Link ready. Copy it now.</Text>
            </View>
            <View style={styles.linkBox}>
              <Text style={styles.linkText} selectable>
                {link}
              </Text>
            </View>
            <Button
              title={copied ? "Copied" : "Copy link"}
              Icon={copied ? Check : Copy}
              variant={copied ? "greenSoft" : "green"}
              onPress={() => void copy(link)}
              style={{ marginTop: 12 }}
            />
            <View style={styles.warning}>
              <ShieldAlert size={16} color="#8A6A12" strokeWidth={2.2} />
              <Text style={styles.warningText}>
                Keep it private: anyone with this link can read your KisanMandi data. It&apos;s shown only
                once. If you lose it, create a new one.
              </Text>
            </View>
          </View>
        ) : key ? (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: theme.green }]} />
              <Text style={styles.statusText}>Connected</Text>
            </View>
            <Text style={styles.meta}>
              Link {key.prefix}… · created {formatDistanceToNow(key.createdAt, { addSuffix: true })}
              {"\n"}
              {key.lastUsedAt
                ? `Last used by an AI app ${formatDistanceToNow(key.lastUsedAt, { addSuffix: true })}`
                : "Not used yet"}
            </Text>
            <View style={styles.actions}>
              <Button
                title="New link"
                Icon={RefreshCw}
                variant="soft"
                small
                loading={busy === "create"}
                disabled={!!busy}
                onPress={() => setConfirm("regenerate")}
                style={{ flex: 1 }}
              />
              <Button
                title="Disconnect"
                Icon={Unplug}
                variant="danger"
                small
                loading={busy === "revoke"}
                disabled={!!busy}
                onPress={() => setConfirm("revoke")}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: theme.line }]} />
              <Text style={styles.statusText}>Not connected</Text>
            </View>
            <Text style={styles.meta}>
              Create your personal link, then paste it into Claude or ChatGPT. You can disconnect at any time.
            </Text>
            <Button
              title="Create my link"
              Icon={Link2}
              variant="green"
              loading={busy === "create"}
              onPress={() => void create()}
              style={{ marginTop: 14 }}
            />
          </View>
        )}
        {!!error && <Text style={styles.error}>{error}</Text>}

        {/* Setup */}
        <Text style={styles.section}>HOW TO CONNECT</Text>
        <View style={styles.tabs} accessibilityRole="tablist">
          {APPS.map((a) => {
            const on = a.value === app;
            return (
              <Tap
                key={a.value}
                onPress={() => setApp(a.value)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.tab, on && styles.tabOn]}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                  {a.label}
                </Text>
              </Tap>
            );
          })}
        </View>

        <View style={styles.card}>
          {app === "claude" && (
            <>
              <Step n={1}>Open claude.ai or the Claude app and go to Settings → Connectors.</Step>
              <Step n={2}>Tap “Add custom connector”.</Step>
              <Step n={3}>Name it KisanMandi and paste your link as the server URL. Tap Add.</Step>
              <Step n={4} last>
                In a new chat, open the tools menu and turn KisanMandi on. Then just ask.
              </Step>
              <Text style={styles.subhead}>Claude Code (terminal)</Text>
              <Code text={`claude mcp add --transport http kisanmandi ${shownLink}`} onCopy={link ? copy : undefined} />
            </>
          )}
          {app === "chatgpt" && (
            <>
              <Step n={1}>Open chatgpt.com → Settings → Apps & Connectors → Advanced settings, and turn on Developer mode.</Step>
              <Step n={2}>Back in Apps & Connectors, tap Create.</Step>
              <Step n={3}>
                Name: KisanMandi. MCP server URL: paste your link. Authentication: No authentication. Tick “I trust this
                app” and tap Create.
              </Step>
              <Step n={4} last>
                In a chat, choose Developer mode from the + menu and add KisanMandi. Then just ask.
              </Step>
              <Text style={styles.note}>ChatGPT custom connectors need a Plus, Pro, Business or Enterprise plan.</Text>
            </>
          )}
          {app === "other" && (
            <>
              <Text style={styles.stepText}>
                Any app that supports MCP over HTTP (Cursor, VS Code, Windsurf, Claude Desktop…) can use your link. Add
                it as a remote server, for example:
              </Text>
              <Code
                text={JSON.stringify({ mcpServers: { kisanmandi: { url: shownLink } } }, null, 2)}
                onCopy={link ? copy : undefined}
              />
              <Text style={styles.note}>
                Apps that want a header instead can use the URL without the key and send
                “Authorization: Bearer km_…”.
              </Text>
            </>
          )}
        </View>

        {/* Examples */}
        <Text style={styles.section}>TRY ASKING</Text>
        <View style={styles.card}>
          {EXAMPLES.map((q, i) => (
            <View key={q} style={[styles.example, i < EXAMPLES.length - 1 && styles.divider]}>
              <Plug size={15} color={theme.green} strokeWidth={2.2} />
              <Text style={styles.exampleText}>“{q}”</Text>
            </View>
          ))}
          <Text style={styles.note}>The AI can only read your data. It can&apos;t change prices, alerts or listings.</Text>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirm === "regenerate"}
        Icon={RefreshCw}
        title="Create a new link?"
        message="Your current link stops working right away. You'll need to paste the new one into Claude or ChatGPT."
        confirmTitle="New link"
        onConfirm={() => void create()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        visible={confirm === "revoke"}
        Icon={Unplug}
        title="Disconnect AI apps?"
        message="Claude, ChatGPT and any other app using your link lose access to your KisanMandi data at once."
        confirmTitle="Disconnect"
        destructive
        onConfirm={() => void revoke()}
        onClose={() => setConfirm(null)}
      />
    </SafeAreaView>
  );
}

function Step({ n, children, last }: { n: number; children: ReactNode; last?: boolean }) {
  return (
    <View style={[styles.step, !last && { marginBottom: 12 }]}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{children}</Text>
    </View>
  );
}

/** Monospace snippet; copyable once the real link is known. */
function Code({ text, onCopy }: { text: string; onCopy?: (text: string) => void }) {
  return (
    <View style={styles.code}>
      <Text style={styles.codeText} selectable>
        {text}
      </Text>
      {onCopy && (
        <Tap onPress={() => onCopy(text)} accessibilityRole="button" accessibilityLabel="Copy" hitSlop={8} style={styles.codeCopy}>
          <Copy size={15} color={theme.green} strokeWidth={2.2} />
        </Tap>
      )}
    </View>
  );
}

const MONO = process.env.EXPO_OS === "ios" ? "Menlo" : "monospace";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  pad: { paddingHorizontal: 20, paddingTop: 12 },
  hero: { backgroundColor: theme.greenSoft, borderRadius: 24, padding: 20 },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: theme.green,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroTitle: { fontFamily: fonts.bold, fontSize: 19, color: theme.ink, letterSpacing: -0.2 },
  heroText: { marginTop: 6, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: theme.ink },
  section: {
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
    fontFamily: fonts.bold,
    fontSize: 11.5,
    letterSpacing: 0.8,
    color: theme.muted,
  },
  card: { backgroundColor: theme.card, borderRadius: 22, padding: 16 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { fontFamily: fonts.semibold, fontSize: 15, color: theme.ink },
  meta: { marginTop: 8, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: theme.muted },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  linkBox: { marginTop: 12, backgroundColor: theme.bg, borderRadius: 14, padding: 12 },
  linkText: { fontFamily: MONO, fontSize: 12.5, lineHeight: 18, color: theme.ink },
  warning: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: theme.mustardSoft,
  },
  warningText: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18, color: "#6B5310" },
  error: { marginTop: 10, textAlign: "center", fontFamily: fonts.medium, fontSize: 13, color: theme.red },
  tabs: { flexDirection: "row", backgroundColor: theme.sand, borderRadius: 22, padding: 4, marginBottom: 12 },
  tab: { flex: 1, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  tabOn: { backgroundColor: theme.ink },
  tabText: { fontFamily: fonts.semibold, fontSize: 13.5, color: theme.ink },
  tabTextOn: { color: theme.card },
  step: { flexDirection: "row", gap: 12 },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { fontFamily: fonts.bold, fontSize: 12.5, color: theme.green },
  stepText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: theme.ink },
  subhead: { marginTop: 18, marginBottom: 8, fontFamily: fonts.semibold, fontSize: 13.5, color: theme.ink },
  code: { marginTop: 10, backgroundColor: theme.bg, borderRadius: 14, padding: 12, paddingRight: 40 },
  codeText: { fontFamily: MONO, fontSize: 12, lineHeight: 18, color: theme.ink },
  codeCopy: { position: "absolute", top: 10, right: 10, padding: 4 },
  note: { marginTop: 12, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: theme.muted },
  example: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line },
  exampleText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: theme.ink },
});
