import { useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { Sprout } from "lucide-react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Tap } from "@/components/kisan/tap";
import { TextField } from "@/components/kisan/text-field";
import { Button, CATEGORY_COLORS, FieldError, FieldLabel } from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api, ApiError } from "@/lib/api/client";
import { invalidate } from "@/lib/api/resources";
import { errorText } from "@/lib/form-errors";
import { CATEGORIES, cropSchema, type Category } from "../../../../convex/lib/kisan";

const CATEGORY_TEXT: Record<Category, string> = {
  grain: "Grain",
  cash: "Cash crop",
  vegetable: "Vegetable",
  fruit: "Fruit",
};

/** Centered dialog to add a crop that isn't in the list yet. */
export function AddCropDialog({
  visible,
  onAdded,
  onClose,
}: {
  visible: boolean;
  /** Called with the new (or already existing) crop id. */
  onAdded: (cropId: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [nameUr, setNameUr] = useState("");
  const [category, setCategory] = useState<Category | undefined>();
  const [errors, setErrors] = useState<{ name?: string; category?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setNameUr("");
    setCategory(undefined);
    setErrors({});
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const save = async () => {
    const parsed = cropSchema.safeParse({ name, nameUr: nameUr || undefined, category });
    if (!parsed.success) {
      const issues = parsed.error.issues;
      setErrors({
        name: errorText(issues.find((i) => i.path[0] === "name" || i.path[0] === "nameUr")?.message),
        category: errorText(issues.find((i) => i.path[0] === "category")?.message),
      });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const res = await api.post<{ id: string; created: boolean }>("/crops", parsed.data);
      await invalidate("/crops");
      reset();
      onAdded(res.id);
    } catch (e) {
      setErrors({ form: e instanceof ApiError ? e.message : "Couldn't add crop. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.wrap}>
        <Tap style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" pressedStyle={{}} />
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={styles.icon}>
            <Sprout size={26} color={theme.green} strokeWidth={2.2} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Add your crop
          </Text>
          <Text style={styles.message}>It will be saved to the list, so next time just pick it.</Text>

          <View style={{ alignSelf: "stretch" }}>
            <FieldLabel>Crop name</FieldLabel>
            <TextField
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
              }}
              placeholder="e.g. Chilli"
              autoCapitalize="words"
              autoFocus
              maxLength={40}
              error={errors.name}
              accessibilityLabel="Crop name"
              containerStyle={styles.field}
            />
            <FieldLabel>Urdu name (optional)</FieldLabel>
            <TextField
              value={nameUr}
              onChangeText={setNameUr}
              placeholder="مثلاً مرچ"
              maxLength={40}
              accessibilityLabel="Urdu name, optional"
              containerStyle={styles.field}
            />

            <FieldLabel>Type</FieldLabel>
            <View style={styles.categories} accessibilityRole="radiogroup">
              {CATEGORIES.map((c) => {
                const on = c === category;
                const color = CATEGORY_COLORS[c];
                return (
                  <Tap
                    key={c}
                    onPress={() => {
                      setCategory(c);
                      if (errors.category) setErrors((e) => ({ ...e, category: undefined }));
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={[
                      styles.category,
                      { backgroundColor: on ? color.bg : theme.card, borderColor: on ? color.fg : "transparent" },
                    ]}
                  >
                    <Text style={[styles.categoryText, { color: on ? color.fg : theme.ink }]}>{CATEGORY_TEXT[c]}</Text>
                  </Tap>
                );
              })}
            </View>
            <FieldError>{errors.category}</FieldError>
            {!!errors.form && <Text style={styles.formError}>{errors.form}</Text>}
          </View>

          <View style={styles.actions}>
            <Button title="Cancel" variant="soft" onPress={close} disabled={busy} style={{ flex: 1, backgroundColor: theme.card }} />
            <Button title="Add crop" variant="green" loading={busy} onPress={() => void save()} style={{ flex: 1 }} />
          </View>
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
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 380,
    // Page colour, so the white text fields and chips stand out.
    backgroundColor: theme.bg,
    borderRadius: 28,
    padding: 24,
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
  field: { alignSelf: "stretch" },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  category: { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 9 },
  categoryText: { fontFamily: fonts.semibold, fontSize: 13.5 },
  formError: { marginTop: 12, textAlign: "center", fontFamily: fonts.medium, fontSize: 13, color: theme.red },
  actions: { flexDirection: "row", gap: 10, marginTop: 22, alignSelf: "stretch" },
});
