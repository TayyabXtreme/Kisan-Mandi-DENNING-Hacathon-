import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { HandCoins } from "lucide-react-native";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { num, rs } from "@/lib/format";
import { TextField } from "../text-field";
import { Button, FieldLabel, Sheet } from "../ui";

type Listing = { askingPrice: number; quantity: number; crop: { name: string } };

/** Buyer proposes Rs/40kg × maund for the pinned listing. */
export function OfferSheet({
  visible,
  onClose,
  listing,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  listing: Listing;
  onSubmit: (offer: { price: number; quantity: number; body?: string }) => Promise<void>;
}) {
  const [price, setPrice] = useState(String(listing.askingPrice));
  const [qty, setQty] = useState(String(listing.quantity));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const p = Number(price.replace(/,/g, ""));
  const q = Number(qty.replace(/,/g, ""));

  const submit = async () => {
    if (!(p > 0)) return setError("Enter a price above 0.");
    if (!(q > 0)) return setError("Enter a quantity above 0.");
    if (q > listing.quantity) return setError(`The farmer has ${num(listing.quantity)} maund.`);
    setError("");
    setBusy(true);
    try {
      await onSubmit({ price: Math.round(p), quantity: q, body: note.trim() || undefined });
      onClose();
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the offer.");
    } finally {
      setBusy(false);
    }
  };

  const diff = p > 0 ? ((p - listing.askingPrice) / listing.askingPrice) * 100 : 0;
  return (
    <Sheet visible={visible} onClose={onClose} title="Make an offer" maxHeight="90%">
      <View style={styles.body}>
        <Text style={styles.sub}>
          {listing.crop.name} · asking {rs(listing.askingPrice)}/40kg · {num(listing.quantity)} maund
        </Text>
        <View style={styles.fields}>
          <FieldLabel>Your price per 40 kg</FieldLabel>
          <TextField
            prefix="Rs"
            value={price}
            onChangeText={setPrice}
            keyboardType="number-pad"
            bold
            accessibilityLabel="Offer price per 40 kg"
            hint={p > 0 && diff !== 0 ? `${Math.abs(diff).toFixed(1)}% ${diff < 0 ? "below" : "above"} the asking price` : undefined}
          />
          <FieldLabel>Quantity (maund)</FieldLabel>
          <TextField value={qty} onChangeText={setQty} keyboardType="decimal-pad" accessibilityLabel="Quantity in maund" />
          <FieldLabel>Note (optional)</FieldLabel>
          <TextField value={note} onChangeText={setNote} placeholder="e.g. I can collect on Friday" maxLength={500} />
        </View>
        {p > 0 && q > 0 && <Text style={styles.total}>Total {rs(p * q)}</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Button title="Send offer" Icon={HandCoins} variant="green" loading={busy} onPress={() => void submit()} style={{ marginTop: 12 }} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 22 },
  sub: { fontFamily: fonts.regular, fontSize: 13.5, color: theme.muted },
  fields: { backgroundColor: theme.bg, borderRadius: 20, padding: 14, paddingTop: 0, marginTop: 12 },
  total: { fontFamily: fonts.bold, fontSize: 16, color: theme.ink, marginTop: 12 },
  error: { fontFamily: fonts.medium, fontSize: 13, color: theme.red, marginTop: 8 },
});
