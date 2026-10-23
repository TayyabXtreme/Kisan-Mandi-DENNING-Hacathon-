import { useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { CircleCheck, Headset, Send } from "lucide-react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Tap } from "@/components/kisan/tap";
import { TextField } from "@/components/kisan/text-field";
import { Button, FieldError, FieldLabel } from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api, ApiError } from "@/lib/api/client";
import { invalidate } from "@/lib/api/resources";
import { errorText } from "@/lib/form-errors";
import { SUPPORT_TOPICS, supportSchema, type SupportTopic } from "../../../../convex/lib/kisan";

export const TOPIC_TEXT: Record<SupportTopic, string> = {
  market: "A market",
  price: "Prices",
  account: "My account",
  other: "Something else",
};

/** Centered dialog: a farmer or buyer sends the admin a message. */
export function ContactAdminDialog({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [topic, setTopic] = useState<SupportTopic | undefined>();
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<{ topic?: string; message?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const reset = () => {
    setTopic(undefined);
    setMessage("");
    setErrors({});
    setSent(false);
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const send = async () => {
    const parsed = supportSchema.safeParse({ topic, message });
    if (!parsed.success) {
      const issues = parsed.error.issues;
      setErrors({
        topic: errorText(issues.find((i) => i.path[0] === "topic")?.message),
        message: errorText(issues.find((i) => i.path[0] === "message")?.message),
      });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await api.post("/support", parsed.data);
      await invalidate("/support");
      setSent(true);
    } catch (e) {
      setErrors({ form: e instanceof ApiError ? e.message : "Couldn't send your message. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.wrap}>
        <Tap style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" pressedStyle={{}} />
        <View style={styles.dialog} accessibilityViewIsModal>
          {sent ? (
            <>
              <View style={styles.icon}>
                <CircleCheck size={28} color={theme.green} strokeWidth={2.2} />
              </View>
              <Text style={styles.title} accessibilityRole="header">
                Message sent
              </Text>
              <Text style={styles.message}>
                The admin will get back to you on your phone or email soon.
              </Text>
              <View style={styles.actions}>
                <Button title="Done" variant="green" onPress={close} />
              </View>
            </>
          ) : (
            <>
              <View style={styles.icon}>
                <Headset size={26} color={theme.green} strokeWidth={2.2} />
              </View>
              <Text style={styles.title} accessibilityRole="header">
                Contact admin
              </Text>
              <Text style={styles.message}>
                Wrong price, missing market, or a problem with your account? Tell the admin.
              </Text>

              <View style={{ alignSelf: "stretch" }}>
                <FieldLabel>It&apos;s about</FieldLabel>
                <View style={styles.topics} accessibilityRole="radiogroup">
                  {SUPPORT_TOPICS.map((t) => {
                    const on = t === topic;
                    return (
                      <Tap
                        key={t}
                        onPress={() => {
                          setTopic(t);
                          if (errors.topic) setErrors((e) => ({ ...e, topic: undefined }));
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        style={[styles.topic, on && styles.topicOn]}
                      >
                        <Text style={[styles.topicText, on && { color: theme.green }]}>{TOPIC_TEXT[t]}</Text>
                      </Tap>
                    );
                  })}
                </View>
                <FieldError>{errors.topic}</FieldError>

                <FieldLabel>Message</FieldLabel>
                <TextField
                  value={message}
                  onChangeText={(t) => {
                    setMessage(t);
                    if (errors.message) setErrors((e) => ({ ...e, message: undefined }));
                  }}
                  placeholder="e.g. Onion price in Hala Mandi looks wrong today"
                  multiline
                  maxLength={500}
                  error={errors.message}
                  accessibilityLabel="Message"
                  style={styles.messageInput}
                />
                {!!errors.form && <Text style={styles.formError}>{errors.form}</Text>}
              </View>

              <View style={styles.actions}>
                <Button title="Send message" Icon={Send} variant="green" loading={busy} onPress={() => void send()} />
                <Button
                  title="Cancel"
                  variant="soft"
                  onPress={close}
                  disabled={busy}
                  style={{ backgroundColor: theme.card }}
                />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "rgba(20,15,10,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  dialog: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: theme.bg,
    borderRadius: 28,
    padding: 22,
    alignItems: "center",
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.greenSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: { fontFamily: fonts.bold, fontSize: 20, color: theme.ink, textAlign: "center" },
  message: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: theme.muted,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 2,
  },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  topic: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: theme.card,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  topicOn: { backgroundColor: theme.greenSoft, borderColor: theme.green },
  topicText: { fontFamily: fonts.semibold, fontSize: 13.5, color: theme.ink },
  messageInput: { minHeight: 96, textAlignVertical: "top" },
  formError: { marginTop: 12, textAlign: "center", fontFamily: fonts.medium, fontSize: 13, color: theme.red },
  actions: { gap: 10, marginTop: 22, alignSelf: "stretch" },
});
