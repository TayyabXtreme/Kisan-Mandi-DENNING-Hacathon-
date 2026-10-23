import { useMemo, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CalendarDays, CircleAlert, Mic, Square } from "lucide-react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AddCropDialog } from "@/components/kisan/sell/add-crop-dialog";
import { DateSheet } from "@/components/kisan/sell/date-sheet";
import { Tap } from "@/components/kisan/tap";
import { DISTRICT_OPTIONS } from "@/components/kisan/districts";
import { TextField } from "@/components/kisan/text-field";
import {
  Button,
  FieldLabel,
  IconButton,
  ScreenTitle,
  Segmented,
  SelectField,
  SelectSheet,
  StateView,
} from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { api, ApiError } from "@/lib/api/client";
import { invalidate, useCrops, useMe, useResource, withQuery } from "@/lib/api/resources";
import type { CompareResponse, ListingBody, ListingDetail } from "@/lib/api/types";
import { errorText } from "@/lib/form-errors";
import { day, dayFull, num, todayPK } from "@/lib/format";
import {
  GRADES,
  listingSchema,
  marketLabel,
  normalizePhone,
  type District,
  type Grade,
} from "../../convex/lib/kisan";

type Form = {
  cropId: string;
  district: District | undefined;
  quantity: string;
  askingPrice: string;
  grade: Grade | undefined;
  availableFrom: string;
  contactPhone: string;
};
type Field = keyof Form;

const LABEL_TEXT = { below: "Below market", at: "At market", above: "Above market" } as const;

/** 3001234567 → "300 1234 567" */
const formatPhone = (digits: string) =>
  [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7, 10)].filter(Boolean).join(" ");

/** Keeps digits and one decimal point. */
const numeric = (text: string) => {
  const cleaned = text.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
};

type ParsedListing = {
  crop: string | null;
  quantity: number | null;
  askingPrice: number | null;
  grade: Grade | null;
  district: District | null;
  availableFrom: string | null;
};

/** 11 · Sell produce — new listing, or edit with ?id. */
export default function Sell() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = typeof id === "string" && id ? id : null;
  const insets = useSafeAreaInsets();
  // Pakistan date, fixed for this screen's lifetime (lazy init keeps render pure).
  const [today] = useState(() => todayPK(Date.now()));

  const me = useMe();
  const crops = useCrops();
  const detail = useResource<ListingDetail>(editId ? `/listings/${editId}` : null);

  const [form, setForm] = useState<Form>({
    cropId: "",
    district: undefined,
    quantity: "",
    askingPrice: "",
    grade: "A",
    availableFrom: today,
    contactPhone: "",
  });
  const [keepDate, setKeepDate] = useState<string | undefined>();
  const [prefilled, setPrefilled] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; field?: string } | null>(null);
  const [sheet, setSheet] = useState<"crop" | "addCrop" | "district" | "date" | null>(null);

  // Prefill once data arrives (adjusting state while rendering, not in an effect).
  const prefillKey = editId ? `edit:${editId}` : "new";
  if (prefilled !== prefillKey) {
    if (editId && detail.data) {
      const l = detail.data;
      setForm({
        cropId: l.crop.id,
        district: l.district,
        quantity: String(l.quantity),
        askingPrice: String(l.askingPrice),
        grade: l.grade,
        availableFrom: l.availableFrom,
        contactPhone: normalizePhone(l.contactPhone),
      });
      setKeepDate(l.availableFrom);
      setPrefilled(prefillKey);
    } else if (!editId && me.data && crops.data) {
      const profile = me.data;
      const firstCrop = crops.data.items[0]?.id ?? "";
      setForm((f) => ({
        ...f,
        cropId: f.cropId || firstCrop,
        district: f.district ?? profile.district ?? undefined,
        contactPhone: f.contactPhone || normalizePhone(profile.phone ?? ""),
      }));
      setPrefilled(prefillKey);
    }
  }

  const set = <K extends Field>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setTouched((t) => ({ ...t, [key]: true }));
    if (serverError?.field === key) setServerError(null);
  };

  // Field errors from the shared schema (same rules as the server).
  const result = useMemo(
    () =>
      listingSchema(today, keepDate).safeParse({
        ...form,
        quantity: form.quantity === "" ? Number.NaN : Number(form.quantity),
        askingPrice: form.askingPrice === "" ? Number.NaN : Number(form.askingPrice),
      }),
    [form, today, keepDate],
  );
  const errors: Partial<Record<Field, string>> = {};
  if (!result.success)
    for (const issue of result.error.issues) {
      const key = issue.path[0] as Field;
      errors[key] ??= issue.message;
    }
  // Inline errors appear once a field is touched (or after a submit attempt).
  const shown = (key: Field) =>
    submitted || touched[key] || (key === "availableFrom" && form.availableFrom < today && form.availableFrom !== keepDate)
      ? errors[key]
      : undefined;
  const valid = result.success;

  const compare = useResource<CompareResponse>(
    form.cropId ? withQuery("/prices/compare", { cropId: form.cropId }) : null,
  );
  const avg = compare.data?.average ?? null;
  const price = Number(form.askingPrice);
  const priceHint =
    avg && price > 0 ? `${LABEL_TEXT[marketLabel(price, avg)]} · avg ${num(avg)}` : avg ? `Market avg ${num(avg)}` : undefined;

  const crop = crops.data?.items.find((c) => c.id === form.cropId);

  const submit = async () => {
    setSubmitted(true);
    if (!result.success || busy) return;
    setBusy(true);
    setServerError(null);
    const body: ListingBody = {
      cropId: form.cropId,
      quantity: Number(form.quantity),
      askingPrice: Math.round(Number(form.askingPrice)),
      district: form.district!,
      grade: form.grade!,
      availableFrom: form.availableFrom,
      contactPhone: normalizePhone(form.contactPhone),
    };
    try {
      if (editId) await api.patch(`/listings/${editId}`, body);
      else await api.post("/listings", body);
      await invalidate("/listings");
      if (router.canGoBack()) router.back();
      else router.replace("/listings");
    } catch (e) {
      setServerError(
        e instanceof ApiError
          ? { message: errorText(e.code) ?? e.message, field: e.field }
          : { message: "Couldn't save your listing. Please try again." },
      );
    } finally {
      setBusy(false);
    }
  };

  // ---- Voice fill: speak the listing, Bedrock extracts the fields ----
  const voice = useVoiceInput();
  const [voiceState, setVoiceState] = useState<{ status: "idle" | "parsing" | "done" | "error"; text?: string }>({
    status: "idle",
  });
  const toggleVoice = async () => {
    try {
      if (!voice.isRecording) {
        setVoiceState({ status: "idle" });
        await voice.start();
        return;
      }
      const lang = me.data?.language;
      const transcript = await voice.stop(lang === "en" ? undefined : lang);
      if (!transcript) {
        setVoiceState({ status: "error", text: "Didn't catch that. Try again." });
        return;
      }
      setVoiceState({ status: "parsing", text: transcript });
      const parsed = await api.post<ParsedListing>("/ai/parse-listing", { text: transcript });
      const match = crops.data?.items.find((c) => c.name.toLowerCase() === parsed.crop?.toLowerCase());
      const next: Partial<Form> = {};
      if (match) next.cropId = match.id;
      if (parsed.quantity && parsed.quantity > 0) next.quantity = String(parsed.quantity);
      if (parsed.askingPrice && parsed.askingPrice > 0) next.askingPrice = String(Math.round(parsed.askingPrice));
      if (parsed.grade) next.grade = parsed.grade;
      if (parsed.district) next.district = parsed.district;
      if (parsed.availableFrom && /^\d{4}-\d{2}-\d{2}$/.test(parsed.availableFrom)) next.availableFrom = parsed.availableFrom;
      setForm((f) => ({ ...f, ...next }));
      setTouched((t) => ({ ...t, ...Object.fromEntries(Object.keys(next).map((k) => [k, true])) }));
      setVoiceState({
        status: "done",
        text: Object.keys(next).length ? `Filled from: “${transcript}”. Check and post.` : `Heard “${transcript}” but found no details.`,
      });
    } catch (e) {
      setVoiceState({
        status: "error",
        text: e instanceof Error ? e.message : "Voice input failed. Try again.",
      });
    }
  };
  const voiceLine = voice.isRecording
    ? "Listening… say crop, quantity, price, grade and date. Tap again to stop."
    : voice.isTranscribing
      ? "Transcribing…"
      : voiceState.status === "parsing"
        ? "Reading your listing…"
        : voiceState.text;

  const loadingEdit = !!editId && !detail.data;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <ScreenTitle
          title={editId ? "Edit listing" : "Sell produce"}
          close
          right={
            <IconButton
              Icon={voice.isRecording ? Square : Mic}
              label={voice.isRecording ? "Stop recording" : "Fill by voice"}
              bg={voice.isRecording ? theme.red : theme.card}
              color={voice.isRecording ? theme.card : theme.green}
              onPress={() => void toggleVoice()}
            />
          }
        />
      </View>

      {loadingEdit ? (
        <StateView loading={!detail.error} error={detail.error} onRetry={() => void detail.refresh()} />
      ) : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {!!voiceLine && (
            <View style={[styles.voice, voiceState.status === "error" && !voice.isRecording && { backgroundColor: theme.redSoft }]}>
              {(voice.isTranscribing || voiceState.status === "parsing") && <ActivityIndicator size="small" color={theme.green} />}
              <Text style={styles.voiceText}>{voiceLine}</Text>
            </View>
          )}

          <View style={styles.row}>
            <View style={styles.col}>
              <FieldLabel>Crop</FieldLabel>
              <SelectField
                value={crop ? `${crop.name}  ${crop.nameUr}` : undefined}
                placeholder="Choose"
                onPress={() => setSheet("crop")}
                error={!!shown("cropId")}
              />
            </View>
            <View style={styles.col}>
              <FieldLabel>District</FieldLabel>
              <SelectField
                value={form.district}
                placeholder="Choose"
                onPress={() => setSheet("district")}
                error={!!shown("district")}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <FieldLabel>Quantity (maund)</FieldLabel>
              <TextField
                value={form.quantity}
                onChangeText={(t) => set("quantity", numeric(t))}
                keyboardType="decimal-pad"
                placeholder="0"
                accessibilityLabel="Quantity in maund"
                error={errorText(shown("quantity"))}
                editable={!busy}
              />
            </View>
            <View style={styles.col}>
              <FieldLabel>Price / 40 kg</FieldLabel>
              <TextField
                prefix="Rs"
                bold
                value={form.askingPrice}
                onChangeText={(t) => set("askingPrice", numeric(t).split(".")[0])}
                keyboardType="number-pad"
                placeholder="0"
                accessibilityLabel="Asking price in rupees per 40 kilograms"
                error={errorText(shown("askingPrice"))}
                valid={Number(form.askingPrice) > 0}
                hint={priceHint}
                editable={!busy}
              />
            </View>
          </View>

          <FieldLabel>Grade</FieldLabel>
          <Segmented
            value={form.grade}
            onChange={(g) => set("grade", g)}
            activeColor={theme.green}
            options={GRADES.map((g) => ({ value: g, label: g }))}
          />

          <FieldLabel>Available from</FieldLabel>
          <Tap
            onPress={() => setSheet("date")}
            accessibilityRole="button"
            accessibilityLabel={`Available from ${dayFull(form.availableFrom)}`}
            style={[styles.dateField, !!shown("availableFrom") && { borderColor: theme.red }]}
          >
            <Text style={styles.dateText}>{dayFull(form.availableFrom)}</Text>
            <CalendarDays size={20} color={theme.ink} strokeWidth={1.8} />
          </Tap>
          {!!shown("availableFrom") && (
            <View style={styles.dateError}>
              <CircleAlert size={14} color={theme.red} strokeWidth={2.2} />
              <Text style={styles.dateErrorText}>
                Date can&apos;t be in the past. Pick today ({day(today)}) or later.
              </Text>
            </View>
          )}

          <FieldLabel>Contact phone</FieldLabel>
          <TextField
            prefix="+92"
            value={formatPhone(form.contactPhone)}
            onChangeText={(t) => set("contactPhone", normalizePhone(t).slice(0, 10))}
            keyboardType="phone-pad"
            placeholder="300 0000 123"
            maxLength={12}
            accessibilityLabel="Contact phone"
            error={errorText(shown("contactPhone"))}
            editable={!busy}
          />

          {!!serverError && <Text style={styles.serverError}>{serverError.message}</Text>}
        </KeyboardAwareScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Button
          title={editId ? "Save changes" : "Post listing"}
          onPress={() => void submit()}
          disabled={!valid || loadingEdit}
          loading={busy}
        />
      </View>

      <SelectSheet
        visible={sheet === "crop"}
        title="Crop"
        value={form.cropId || undefined}
        options={(crops.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.name}  ${c.nameUr}` }))}
        onSelect={(v) => set("cropId", v)}
        onClose={() => setSheet(null)}
        addLabel="Add crop"
        // iOS can't present a modal while another is still sliding away.
        onAdd={() => setTimeout(() => setSheet("addCrop"), Platform.OS === "ios" ? 400 : 0)}
      />
      <AddCropDialog
        visible={sheet === "addCrop"}
        onAdded={(cropId) => {
          set("cropId", cropId);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      <SelectSheet
        visible={sheet === "district"}
        title="District"
        value={form.district}
        options={DISTRICT_OPTIONS}
        searchable
        searchPlaceholder="Search district or city"
        onSelect={(v) => set("district", v)}
        onClose={() => setSheet(null)}
      />
      {sheet === "date" && (
        <DateSheet
          visible
          value={form.availableFrom}
          today={today}
          keepDate={keepDate}
          onSelect={(d) => set("availableFrom", d)}
          onClose={() => setSheet(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  row: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  dateField: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: theme.card,
    borderWidth: 1.2,
    borderColor: theme.card,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateText: { fontFamily: fonts.regular, fontSize: 16, color: theme.ink },
  dateError: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  dateErrorText: { flex: 1, fontFamily: fonts.medium, fontSize: 12.5, color: theme.red },
  voice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.greenSoft,
    borderRadius: 14,
    padding: 12,
    marginBottom: 4,
  },
  voiceText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: theme.ink },
  serverError: { marginTop: 16, textAlign: "center", fontFamily: fonts.medium, fontSize: 13, color: theme.red },
  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: theme.bg },
});
