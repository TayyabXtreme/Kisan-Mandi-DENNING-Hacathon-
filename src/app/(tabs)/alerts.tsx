import { useState } from "react";
import {
  Alert as NativeAlert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Bell, Plus, Trash2 } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TAB_BAR_SPACE } from "@/components/kisan/floating-tab-bar";
import { Tap } from "@/components/kisan/tap";
import {
  Button,
  CropIcon,
  IconButton,
  StateView,
  Tag,
} from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api, ApiError } from "@/lib/api/client";
import { invalidate, useAlerts } from "@/lib/api/resources";
import type { Alert } from "@/lib/api/types";
import { num, rs } from "@/lib/format";

/** "A", "A and B", "A, B and C" */
const joinNames = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const failMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Try again.";

/** 05 · Price Alerts (farmers). Every fetch re-evaluates the rules. */
export default function AlertsScreen() {
  const { data, error, loading, refreshing, refresh } = useAlerts();
  const alerts = data?.alerts ?? [];
  const triggered = alerts.filter((a) => a.status === "triggered");

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_SPACE + 16 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={theme.green}
            colors={[theme.green]}
          />
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} accessibilityRole="header">
              Price Alerts
            </Text>
            <Text style={styles.subtitle}>Checked every time prices refresh</Text>
          </View>
          <Button
            title="New"
            Icon={Plus}
            small
            onPress={() => router.push("/alert-form")}
            accessibilityLabel="New price alert"
          />
        </View>

        {triggered.length > 0 && (
          <View style={styles.banner} accessibilityRole="summary">
            <View style={styles.bannerIcon}>
              <Bell size={20} color={theme.mustard} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>
                {triggered.length} {triggered.length === 1 ? "alert" : "alerts"} triggered
              </Text>
              <Text style={styles.bannerBody}>
                {joinNames(triggered.map((a) => a.crop.name))}{" "}
                {triggered.length === 1 ? "hit your target" : "hit your targets"} today
              </Text>
            </View>
          </View>
        )}

        {!data ? (
          <StateView
            loading={loading}
            error={error}
            onRetry={() => void refresh()}
          />
        ) : alerts.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Bell size={26} color={theme.green} strokeWidth={2} />
            </View>
            <Text style={styles.emptyTitle}>No price alerts yet</Text>
            <Text style={styles.emptyBody}>
              Set a target price and we&apos;ll flag it here as soon as a mandi
              reaches it.
            </Text>
            <Button
              title="Create alert"
              Icon={Plus}
              onPress={() => router.push("/alert-form")}
              style={{ alignSelf: "stretch", marginTop: 8 }}
            />
          </View>
        ) : (
          alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  const [pending, setPending] = useState(false);
  // Show the new switch position right away while the request runs.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const active = optimistic ?? alert.active;
  const paused = alert.status === "paused";
  const triggered = alert.status === "triggered";

  const toggle = async (value: boolean) => {
    if (pending) return;
    setPending(true);
    setOptimistic(value);
    try {
      await api.patch(`/alerts/${alert.id}`, { active: value });
      await invalidate("/alerts");
    } catch (e) {
      NativeAlert.alert("Couldn't update alert", failMessage(e));
    } finally {
      setOptimistic(null);
      setPending(false);
    }
  };

  const remove = () =>
    NativeAlert.alert(
      "Delete alert?",
      `Stop watching ${alert.crop.name} at ${alert.market.name}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setPending(true);
            try {
              await api.del(`/alerts/${alert.id}`);
              await invalidate("/alerts");
            } catch (e) {
              NativeAlert.alert("Couldn't delete alert", failMessage(e));
            } finally {
              setPending(false);
            }
          },
        },
      ],
    );

  const status = triggered ? (
    <Tag label="Triggered" bg={theme.mustard} upper />
  ) : paused ? (
    <Tag label="Paused" bg={theme.sand} color={theme.muted} upper />
  ) : alert.toGo !== null ? (
    <Tag label={`Rs ${num(alert.toGo)} to go`} bg={theme.sand} color={theme.muted} upper />
  ) : null;

  return (
    <View style={[styles.card, triggered && styles.cardTriggered]}>
      <View style={styles.cardTop}>
        <Tap
          onPress={() =>
            router.push({ pathname: "/alert-form", params: { id: alert.id } })
          }
          accessibilityRole="button"
          accessibilityLabel={`Edit ${alert.crop.name} alert at ${alert.market.name}`}
          style={[styles.cardTitleRow, paused && styles.faded]}
          pressedStyle={{ opacity: 0.6 }}
        >
          <CropIcon icon={alert.crop.icon} category={alert.crop.category} size={42} />
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.cropName} numberOfLines={1}>
                {alert.crop.name}
              </Text>
              {status}
            </View>
            <Text style={styles.market} numberOfLines={1}>
              {alert.market.name}
            </Text>
          </View>
        </Tap>
        <Switch
          value={active}
          onValueChange={(v) => void toggle(v)}
          disabled={pending}
          trackColor={{ true: theme.green, false: "#DDD6CA" }}
          thumbColor={theme.card}
          ios_backgroundColor="#DDD6CA"
          accessibilityLabel={`${alert.crop.name} alert ${active ? "on" : "off"}`}
        />
      </View>

      <View style={[styles.box, paused && styles.faded]}>
        <View style={styles.boxCol}>
          <Text style={styles.caption}>
            {alert.condition === "above" ? "Above (≥)" : "Below (≤)"}
          </Text>
          <Text style={styles.value}>{rs(alert.targetPrice)}</Text>
        </View>
        <View style={styles.boxCol}>
          <Text style={styles.caption}>Latest</Text>
          <Text style={[styles.value, triggered && { color: theme.green }]}>
            {alert.latest !== null ? rs(alert.latest) : "—"}
          </Text>
        </View>
        <IconButton
          Icon={Trash2}
          color={theme.red}
          size={38}
          label={`Delete ${alert.crop.name} alert`}
          onPress={remove}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 },
  title: { fontFamily: fonts.bold, fontSize: 28, letterSpacing: -0.5, color: theme.ink },
  subtitle: { fontFamily: fonts.regular, fontSize: 13.5, color: theme.muted, marginTop: 2 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.mustard,
    borderRadius: 20,
    padding: 14,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: { fontFamily: fonts.bold, fontSize: 15, color: theme.ink },
  bannerBody: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.ink, marginTop: 2 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 22,
    padding: 16,
    gap: 14,
    borderWidth: 1.5,
    borderColor: theme.card,
  },
  cardTriggered: { borderColor: theme.mustard },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  faded: { opacity: 0.55 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cropName: { fontFamily: fonts.bold, fontSize: 16, color: theme.ink },
  market: { fontFamily: fonts.regular, fontSize: 13, color: theme.muted, marginTop: 2 },
  box: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.bg,
    borderRadius: 16,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
  },
  boxCol: { flex: 1 },
  caption: { fontFamily: fonts.regular, fontSize: 12, color: theme.muted },
  value: { fontFamily: fonts.bold, fontSize: 15.5, color: theme.ink, marginTop: 2 },
  empty: {
    backgroundColor: theme.card,
    borderRadius: 22,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: theme.greenSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 17, color: theme.ink },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: theme.muted,
    textAlign: "center",
  },
});
