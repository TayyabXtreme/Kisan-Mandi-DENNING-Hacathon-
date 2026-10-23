import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { MapPin, Save, Send } from "lucide-react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DISTRICT_OPTIONS, districtLabel } from "@/components/kisan/districts";
import { TextField } from "@/components/kisan/text-field";
import {
  Button,
  CropIcon,
  CropName,
  FieldError,
  FieldLabel,
  ScreenTitle,
  SelectField,
  SelectSheet,
  StateView,
} from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api, ApiError } from "@/lib/api/client";
import { invalidate, useCrops, useMarkets, useMe, useResource, withQuery } from "@/lib/api/resources";
import type { PricesResponse } from "@/lib/api/types";
import { dayLong, num } from "@/lib/format";
import { errorText } from "@/lib/form-errors";
import { marketSchema, pricePublishSchema, type District } from "../../../../convex/lib/kisan";

/** Admin: edit one market's details and publish today's prices for it. */
export default function AdminMarket() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const markets = useMarkets();
  const crops = useCrops();
  const prices = useResource<PricesResponse>(id ? withQuery("/prices", { marketId: id }) : null);
  const market = markets.data?.items.find((m) => m.id === id);

  // Details form: undefined = untouched, so it shows the saved value.
  const [name, setName] = useState<string>();
  const [nameUr, setNameUr] = useState<string>();
  const [district, setDistrict] = useState<District>();
  const [districtOpen, setDistrictOpen] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsMsg, setDetailsMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // New prices typed by the admin, by crop id. Empty = keep the current one.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [publishing, setPublishing] = useState(false);
  const [priceMsg, setPriceMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (me.data && !me.data.isAdmin)
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.pad}>
          <ScreenTitle title="Market" />
          <StateView empty="Only the admin can open this page." />
        </View>
      </SafeAreaView>
    );

  if (!market)
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.pad}>
          <ScreenTitle title="Market" />
          {markets.loading ? (
            <StateView loading />
          ) : markets.error && !markets.data ? (
            <StateView error={markets.error} onRetry={() => void markets.refresh()} />
          ) : (
            <StateView empty="This market doesn't exist any more." />
          )}
        </View>
      </SafeAreaView>
    );

  const shownName = name ?? market.name;
  const shownNameUr = nameUr ?? market.nameUr;
  const shownDistrict = (district ?? market.district) as District;
  const detailsChanged =
    shownName !== market.name || shownNameUr !== market.nameUr || shownDistrict !== market.district;

  const saveDetails = async () => {
    const parsed = marketSchema.safeParse({
      name: shownName,
      nameUr: shownNameUr || undefined,
      district: shownDistrict,
    });
    if (!parsed.success) {
      setDetailsMsg({ ok: false, text: errorText(parsed.error.issues[0]?.message) ?? "Check the details." });
      return;
    }
    setSavingDetails(true);
    setDetailsMsg(null);
    try {
      await api.patch(`/markets/${market.id}`, parsed.data);
      await invalidate("/markets", "/prices");
      setName(undefined);
      setNameUr(undefined);
      setDistrict(undefined);
      setDetailsMsg({ ok: true, text: "Market details saved." });
    } catch (e) {
      setDetailsMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't save. Try again." });
    } finally {
      setSavingDetails(false);
    }
  };

  // Current price per crop in this market (latest on or before today).
  const current = new Map((prices.data?.items ?? []).map((row) => [row.crop.id, row]));
  const today = prices.data?.today;
  const filled = Object.entries(drafts).filter(([, v]) => v.trim() !== "");

  const publish = async () => {
    const parsed = pricePublishSchema.safeParse({
      marketId: market.id,
      items: filled.map(([cropId, price]) => ({ cropId, price: price.replace(/,/g, "") })),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const crop = typeof issue?.path[1] === "number" ? filled[issue.path[1]]?.[0] : undefined;
      const cropName = crops.data?.items.find((c) => c.id === crop)?.name;
      const text = errorText(issue?.message) ?? "Check the prices.";
      setPriceMsg({ ok: false, text: cropName ? `${cropName}: ${text}` : text });
      return;
    }
    setPublishing(true);
    setPriceMsg(null);
    try {
      const res = await api.post<{ saved: number }>("/admin/prices", parsed.data);
      await invalidate("/prices", "/alerts");
      setDrafts({});
      setPriceMsg({ ok: true, text: `${res.saved} ${res.saved === 1 ? "price" : "prices"} published for today.` });
    } catch (e) {
      setPriceMsg({ ok: false, text: e instanceof ApiError ? e.message : "Couldn't publish. Try again." });
    } finally {
      setPublishing(false);
    }
  };

  const published = prices.data?.publishedBy;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAwareScrollView
        bottomOffset={96}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.pad, { paddingBottom: 120 + insets.bottom }]}
      >
        <ScreenTitle title={market.name} />

        {/* Details */}
        <Text style={styles.section}>MARKET DETAILS</Text>
        <View style={styles.group}>
          <FieldLabel>Market name</FieldLabel>
          <TextField
            value={shownName}
            onChangeText={setName}
            autoCapitalize="words"
            maxLength={50}
            accessibilityLabel="Market name"
          />
          <FieldLabel>Urdu name (optional)</FieldLabel>
          <TextField
            value={shownNameUr}
            onChangeText={setNameUr}
            placeholder="مثلاً ہالا غلہ منڈی"
            maxLength={50}
            accessibilityLabel="Urdu name, optional"
          />
          <FieldLabel>District</FieldLabel>
          <SelectField
            Icon={MapPin}
            value={districtLabel(shownDistrict)}
            placeholder="Choose the district"
            onPress={() => setDistrictOpen(true)}
            accessibilityLabel={`District, ${shownDistrict}`}
          />
          {detailsMsg && (
            <Text style={[styles.msg, { color: detailsMsg.ok ? theme.green : theme.red }]}>{detailsMsg.text}</Text>
          )}
          <Button
            title="Save details"
            Icon={Save}
            variant="dark"
            small
            loading={savingDetails}
            disabled={!detailsChanged || savingDetails}
            onPress={() => void saveDetails()}
            style={{ marginTop: 16 }}
          />
        </View>

        {/* Prices */}
        <Text style={styles.section}>TODAY&apos;S PRICES · RS PER 40 KG</Text>
        <Text style={styles.hint}>
          {published
            ? `Last published by ${published.name} on ${dayLong(published.date)}.`
            : prices.data?.items.length
              ? "These prices update automatically each day until you publish your own."
              : "No prices yet. Enter today's prices to start this market."}{" "}
          Type only the prices that changed; the others stay as they are.
        </Text>

        {crops.loading || prices.loading ? (
          <StateView loading />
        ) : crops.error && !crops.data ? (
          <StateView error={crops.error} onRetry={() => void crops.refresh()} />
        ) : (
          <View style={styles.group}>
            {(crops.data?.items ?? []).map((crop, i, all) => {
              const row = current.get(crop.id);
              const stale = row && today && row.date !== today;
              return (
                <View key={crop.id} style={[styles.priceRow, i < all.length - 1 && styles.divider]}>
                  <CropIcon icon={crop.icon} category={crop.category} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <CropName name={crop.name} local={crop.nameUr} size={15} />
                    <Text style={styles.muted} numberOfLines={1}>
                      {row ? `Now Rs ${num(row.price)}${stale ? ` · ${dayLong(row.date)}` : ""}` : "No price yet"}
                    </Text>
                  </View>
                  <TextField
                    value={drafts[crop.id] ?? ""}
                    onChangeText={(t) => setDrafts((d) => ({ ...d, [crop.id]: t.replace(/[^\d.]/g, "") }))}
                    placeholder={row ? num(row.price) : "0"}
                    keyboardType="decimal-pad"
                    prefix="Rs"
                    maxLength={9}
                    accessibilityLabel={`New price for ${crop.name}`}
                    containerStyle={styles.priceInput}
                  />
                </View>
              );
            })}
          </View>
        )}
        <FieldError>{priceMsg && !priceMsg.ok ? priceMsg.text : undefined}</FieldError>
        {priceMsg?.ok && <Text style={[styles.msg, { color: theme.green }]}>{priceMsg.text}</Text>}
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          title={filled.length ? `Publish ${filled.length} ${filled.length === 1 ? "price" : "prices"}` : "Publish prices"}
          Icon={Send}
          variant="green"
          loading={publishing}
          disabled={!filled.length || publishing}
          onPress={() => void publish()}
        />
      </View>

      <SelectSheet
        visible={districtOpen}
        title="Market district"
        options={DISTRICT_OPTIONS}
        value={shownDistrict}
        searchable
        searchPlaceholder="Search district or city"
        onClose={() => setDistrictOpen(false)}
        onSelect={(d) => setDistrict(d)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  pad: { paddingHorizontal: 20, paddingTop: 12 },
  section: {
    marginTop: 8,
    marginBottom: 10,
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    letterSpacing: 0.6,
    color: theme.muted,
  },
  hint: { marginTop: -2, marginBottom: 12, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: theme.muted },
  // Fields sit on the page colour: TextField is white, so a white card hides it.
  group: { marginBottom: 20 },
  msg: { marginTop: 12, textAlign: "center", fontFamily: fonts.medium, fontSize: 13 },
  muted: { marginTop: 2, fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.line },
  priceInput: { width: 118 },
  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: theme.bg },
});
