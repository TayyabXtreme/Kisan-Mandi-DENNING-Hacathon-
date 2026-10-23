import { useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { CircleCheck, MapPin, Plus, Send, Store } from "lucide-react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { DISTRICT_OPTIONS, districtLabel } from "@/components/kisan/districts";
import { Tap } from "@/components/kisan/tap";
import { TextField } from "@/components/kisan/text-field";
import { Button, FieldError, FieldLabel, SelectField, SelectSheet } from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api, ApiError } from "@/lib/api/client";
import { invalidate } from "@/lib/api/resources";
import { errorText } from "@/lib/form-errors";
import type { MarketRequestResult } from "@/lib/api/types";
import { cropTitle, marketRequestSchema, type District } from "../../../../convex/lib/kisan";

/**
 * Centered dialog for a mandi that isn't listed yet. The admin adds it
 * straight away ("create"); farmers and buyers send the admin a request.
 */
export function AddMarketDialog({
  visible,
  mode,
  defaultDistrict,
  onAdded,
  onClose,
}: {
  visible: boolean;
  mode: "create" | "request";
  /** Pre-selected district, usually the user's own. */
  defaultDistrict?: District;
  /** Called with the new (or already listed) market id. */
  onAdded: (marketId: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [nameUr, setNameUr] = useState("");
  const [note, setNote] = useState("");
  // Request sent: the dialog shows a confirmation instead of the form.
  const [sent, setSent] = useState(false);
  const [district, setDistrict] = useState<District | undefined>();
  const [districtOpen, setDistrictOpen] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; district?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const chosenDistrict = district ?? defaultDistrict;

  const reset = () => {
    setName("");
    setNameUr("");
    setNote("");
    setSent(false);
    setDistrict(undefined);
    setErrors({});
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const save = async () => {
    const parsed = marketRequestSchema.safeParse({
      name,
      nameUr: nameUr || undefined,
      district: chosenDistrict,
      note: mode === "request" ? note || undefined : undefined,
    });
    if (!parsed.success) {
      const issues = parsed.error.issues;
      setErrors({
        name: errorText(
          issues.find((i) => i.path[0] === "name" || i.path[0] === "nameUr" || i.path[0] === "note")?.message,
        ),
        district: errorText(issues.find((i) => i.path[0] === "district")?.message),
      });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      if (mode === "create") {
        const res = await api.post<{ id: string; created: boolean }>("/markets", parsed.data);
        await invalidate("/markets");
        reset();
        onAdded(res.id);
        return;
      }
      const res = await api.post<MarketRequestResult>("/market-requests", parsed.data);
      if (res.status === "exists") {
        // Already listed: just select it.
        await invalidate("/markets");
        reset();
        onAdded(res.marketId);
        return;
      }
      await invalidate("/market-requests");
      setSent(true);
    } catch (e) {
      setErrors({
        form:
          e instanceof ApiError
            ? e.message
            : mode === "create"
              ? "Couldn't add market. Try again."
              : "Couldn't send your request. Try again.",
      });
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
                Request sent
              </Text>
              <Text style={styles.message}>
                The admin will review {cropTitle(name)} and add it to the list. Check back in the
                market picker soon.
              </Text>
              <View style={styles.actions}>
                <Button title="Done" variant="green" onPress={close} />
              </View>
            </>
          ) : (
            <>
            <View style={styles.icon}>
              <Store size={26} color={theme.green} strokeWidth={2.2} />
            </View>
            <Text style={styles.title} accessibilityRole="header">
              {mode === "create" ? "Add a market" : "Request a market"}
            </Text>
            <Text style={styles.message}>
              {mode === "create"
                ? "It goes straight into the market list for everyone."
                : "Can't find your mandi? Send it to the admin. Once approved, everyone can pick it."}
            </Text>
  
            <View style={{ alignSelf: "stretch" }}>
              <FieldLabel>Market name</FieldLabel>
              <TextField
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
                }}
                placeholder="e.g. Hala Grain Market"
                autoCapitalize="words"
                autoFocus
                maxLength={50}
                error={errors.name}
                accessibilityLabel="Market name"
              />
              <FieldLabel>Urdu name (optional)</FieldLabel>
              <TextField
                value={nameUr}
                onChangeText={setNameUr}
                placeholder="مثلاً ہالا غلہ منڈی"
                maxLength={50}
                accessibilityLabel="Urdu name, optional"
              />
  
              <FieldLabel>District</FieldLabel>
              <SelectField
                Icon={MapPin}
                value={chosenDistrict ? districtLabel(chosenDistrict) : undefined}
                placeholder="Choose the district"
                onPress={() => setDistrictOpen(true)}
                error={!!errors.district}
                accessibilityLabel={`District, ${chosenDistrict ?? "not chosen"}`}
              />
              <FieldError>{errors.district}</FieldError>
  
              {mode === "request" && (
                <>
                  <FieldLabel>Note for the admin (optional)</FieldLabel>
                  <TextField
                    value={note}
                    onChangeText={setNote}
                    placeholder="e.g. Near the bypass, open daily"
                    maxLength={200}
                    multiline
                    accessibilityLabel="Note for the admin, optional"
                  />
                </>
              )}
              {!!errors.form && <Text style={styles.formError}>{errors.form}</Text>}
            </View>
  
            <View style={styles.actions}>
              <Button
                title={mode === "create" ? "Add market" : "Send request"}
                Icon={mode === "create" ? Plus : Send}
                variant="green"
                loading={busy}
                onPress={() => void save()}
              />
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

      <SelectSheet
        visible={districtOpen}
        title="Market district"
        options={DISTRICT_OPTIONS}
        value={chosenDistrict}
        searchable
        searchPlaceholder="Search district or city"
        onClose={() => setDistrictOpen(false)}
        onSelect={(d) => {
          setDistrict(d);
          if (errors.district) setErrors((e) => ({ ...e, district: undefined }));
        }}
      />
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
    // Page colour, so the white text fields stand out.
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
  formError: { marginTop: 12, textAlign: "center", fontFamily: fonts.medium, fontSize: 13, color: theme.red },
  // Stacked full-width: side by side, "Add market" wraps on narrow phones.
  actions: { gap: 10, marginTop: 22, alignSelf: "stretch" },
});
