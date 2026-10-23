import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import {
  Bell,
  Bot,
  ChevronRight,
  ClipboardList,
  Headset,
  LogOut,
  MessageCircle,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Sprout,
  Store,
  Trash2,
  type LucideIcon,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthSession } from "@/providers/auth-provider";
import { openKisanDost } from "@/components/kisan/assistant/kisan-dost-button";
import { ContactAdminDialog } from "@/components/kisan/support/contact-admin-dialog";
import { districtLabel } from "@/components/kisan/districts";
import { TAB_BAR_SPACE } from "@/components/kisan/floating-tab-bar";
import { Tap } from "@/components/kisan/tap";
import { Button, ConfirmDialog, SelectSheet, StateView, Tag } from "@/components/kisan/ui";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { api, ApiError } from "@/lib/api/client";
import { invalidate, useAlerts, useMarkets, useMe, useResource } from "@/lib/api/resources";
import type {
  ListResponse,
  MarketRequest,
  McpKeyStatus,
  Me,
  MyListingsResponse,
  SupportMessage,
} from "@/lib/api/types";
import { initials, phoneDisplay } from "@/lib/format";

/** Farmer and buyer profile: details, default mandi, alerts, log out. */
export default function ProfileTab() {
  const me = useMe();
  const { signOut } = useAuthSession();
  const markets = useMarkets();
  const isFarmer = me.data?.role === "farmer";
  const isAdmin = !!me.data?.isAdmin;
  const marketRequests = useResource<ListResponse<MarketRequest>>(isAdmin ? "/market-requests" : null);
  const messages = useResource<ListResponse<SupportMessage>>(isAdmin ? "/support" : null);
  const waiting = (marketRequests.data?.items.length ?? 0) + (messages.data?.items.length ?? 0);
  const [contactOpen, setContactOpen] = useState(false);
  const aiLink = useResource<{ key: McpKeyStatus | null }>("/mcp-key");
  const mine = useResource<MyListingsResponse>(isFarmer ? "/listings/mine?status=active" : null);
  const alerts = useAlerts(isFarmer);
  const [marketOpen, setMarketOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async (patch: Partial<Pick<Me, "marketId" | "emailAlerts">>) => {
    setSaving(true);
    setError("");
    try {
      await api.patch<Me>("/users/me", patch);
      await invalidate("/users/me", "/prices");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // Instant: the app drops the session now and tells the server in the
  // background, then opens the login form directly (no loading hops).
  const logOut = () => {
    setLogoutOpen(false);
    signOut();
    router.replace({ pathname: "/profile-setup", params: { mode: "login" } });
  };

  // Server deletes the account and everything it owns, then we sign out locally.
  const deleteAccount = async () => {
    setDeleting(true);
    setError("");
    try {
      await api.del("/users/me");
      setDeleteOpen(false);
      signOut();
      router.replace({ pathname: "/profile-setup", params: { mode: "register" } });
    } catch (e) {
      setDeleting(false);
      setDeleteOpen(false);
      setError(e instanceof ApiError ? e.message : "Couldn't delete your account. Try again.");
    }
  };

  if (!me.data)
    return (
      <SafeAreaView style={styles.root}>
        <StateView loading={me.loading} error={me.error} onRetry={() => void me.refresh()} />
      </SafeAreaView>
    );

  const user = me.data;
  const market = markets.data?.items.find((m) => m.id === user.marketId);
  const RoleIcon = isFarmer ? Sprout : ShoppingBag;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: TAB_BAR_SPACE + 12 }]}
        refreshControl={
          <RefreshControl
            refreshing={me.refreshing}
            onRefresh={() => {
              void me.refresh();
              if (isFarmer) void invalidate("/listings/mine", "/alerts");
            }}
            tintColor={theme.green}
            colors={[theme.green]}
          />
        }
      >
        <Text style={styles.heading} accessibilityRole="header">
          Profile
        </Text>

        {/* Identity card */}
        <View style={styles.card}>
          <View style={styles.identity}>
            <View style={[styles.avatar, { backgroundColor: isFarmer ? theme.greenSoft : theme.mustardSoft }]}>
              <Text style={[styles.avatarText, { color: isFarmer ? theme.green : theme.ink }]}>
                {initials(user.name) || "?"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {user.name}
              </Text>
              <View style={styles.roleRow}>
                <Tag
                  label={isFarmer ? "Farmer" : "Buyer"}
                  bg={isFarmer ? theme.greenSoft : theme.mustardSoft}
                  color={isFarmer ? theme.green : "#8A6A12"}
                />
                {!!user.district && <Text style={styles.muted}>{districtLabel(user.district)}</Text>}
              </View>
            </View>
            <View style={[styles.roleIcon, { backgroundColor: isFarmer ? theme.green : theme.mustardSoft }]}>
              <RoleIcon size={20} color={isFarmer ? theme.card : theme.ink} strokeWidth={2} />
            </View>
          </View>
          <Button
            title="Edit profile"
            Icon={Pencil}
            variant="soft"
            small
            onPress={() => router.push("/profile-setup")}
            style={{ marginTop: 16 }}
          />
        </View>

        {/* Role summary */}
        {isFarmer ? (
          <View style={styles.stats}>
            <Stat
              label="Active listings"
              value={mine.data?.counts.active}
              onPress={() => router.navigate("/listings")}
            />
            <Stat label="Sold" value={mine.data?.counts.sold} onPress={() => router.navigate("/listings")} />
            <Stat
              label="Alerts hit"
              value={alerts.data?.triggeredCount}
              highlight={!!alerts.data?.triggeredCount}
              onPress={() => router.navigate("/alerts")}
            />
          </View>
        ) : (
          <Tap style={styles.buyerCta} onPress={() => router.navigate("/marketplace")} accessibilityRole="button">
            <Store size={22} color={theme.ink} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Browse produce</Text>
              <Text style={styles.muted}>Buy direct from farmers across Sindh</Text>
            </View>
            <ChevronRight size={18} color={theme.muted} />
          </Tap>
        )}

        {/* Details */}
        <Text style={styles.section}>DETAILS</Text>
        <View style={styles.card}>
          <Row Icon={Phone} label="Phone" value={user.phone ? phoneDisplay(user.phone) : "—"} />
          <Row Icon={Mail} label="Email" value={user.email || "—"} />
          <Row Icon={MapPin} label="District" value={user.district ? districtLabel(user.district) : "—"} />
          <Row
            Icon={Store}
            label="My mandi"
            value={market?.name ?? "Choose"}
            onPress={() => setMarketOpen(true)}
            last
          />
        </View>

        {isAdmin && (
          <>
            <Text style={styles.section}>ADMIN</Text>
            <View style={styles.card}>
              <Row
                Icon={ShieldCheck}
                label="Admin panel"
                value={waiting ? `${waiting} waiting` : "Manage markets"}
                onPress={() => router.push("/admin")}
                last
              />
            </View>
          </>
        )}

        <Text style={styles.section}>AI ASSISTANTS</Text>
        <View style={styles.card}>
          <Row
            Icon={Bot}
            label="Connect"
            value={aiLink.data?.key ? "Connected" : "ChatGPT / Claude"}
            onPress={() => router.push("/connect-ai")}
            last
          />
        </View>

        <Text style={styles.section}>HELP</Text>
        <View style={styles.card}>
          <Row
            Icon={MessageCircle}
            label="Ask Kisan Dost"
            value="AI assistant"
            onPress={() => openKisanDost()}
            last={isAdmin}
          />
          {!isAdmin && (
            <Row
              Icon={Headset}
              label="Contact admin"
              value="Prices, markets, account"
              onPress={() => setContactOpen(true)}
              last
            />
          )}
        </View>

        {isFarmer && (
          <>
            <Text style={styles.section}>NOTIFICATIONS</Text>
            <View style={styles.card}>
              <View style={[styles.row, styles.rowLast]}>
                <View style={styles.rowIcon}>
                  <Bell size={18} color={theme.green} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Email me when alerts trigger</Text>
                  <Text style={styles.muted}>{user.email || "Add an email in Edit profile"}</Text>
                </View>
                <Switch
                  value={user.emailAlerts}
                  disabled={saving || !user.email}
                  onValueChange={(v) => void save({ emailAlerts: v })}
                  trackColor={{ true: theme.green, false: theme.line }}
                  thumbColor={theme.card}
                  accessibilityLabel="Email alerts"
                />
              </View>
            </View>
            <Tap style={[styles.buyerCta, { marginTop: 12 }]} onPress={() => router.push("/sell")} accessibilityRole="button">
              <ClipboardList size={22} color={theme.ink} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Sell produce</Text>
                <Text style={styles.muted}>Post a listing for buyers</Text>
              </View>
              <ChevronRight size={18} color={theme.muted} />
            </Tap>
          </>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Button
          title="Log out"
          Icon={LogOut}
          variant="danger"
          onPress={() => setLogoutOpen(true)}
          style={{ marginTop: 28 }}
        />
        <Tap
          onPress={() => setDeleteOpen(true)}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.deleteLink}
        >
          <Trash2 size={15} color={theme.red} strokeWidth={2.2} />
          <Text style={styles.deleteText}>Delete my account</Text>
        </Tap>
      </ScrollView>

      <ContactAdminDialog visible={contactOpen} onClose={() => setContactOpen(false)} />

      <ConfirmDialog
        visible={logoutOpen}
        Icon={LogOut}
        title="Log out?"
        message="You can log back in with your email and password or Google account."
        confirmTitle="Log out"
        destructive
        onConfirm={logOut}
        onClose={() => setLogoutOpen(false)}
      />

      <ConfirmDialog
        visible={deleteOpen}
        Icon={Trash2}
        title="Delete your account?"
        message="This permanently deletes your profile, listings, alerts, chats and requests. It can't be undone."
        confirmTitle="Delete"
        destructive
        loading={deleting}
        onConfirm={() => void deleteAccount()}
        onClose={() => !deleting && setDeleteOpen(false)}
      />

      <SelectSheet
        visible={marketOpen}
        title="My mandi"
        value={user.marketId ?? undefined}
        options={(markets.data?.items ?? []).map((m) => ({ value: m.id, label: m.name, hint: m.district }))}
        onSelect={(id) => void save({ marketId: id })}
        onClose={() => setMarketOpen(false)}
      />
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  highlight,
  onPress,
}: {
  label: string;
  value?: number;
  highlight?: boolean;
  onPress: () => void;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? "loading"}`}
      style={[styles.stat, highlight && { backgroundColor: theme.mustardSoft }]}
    >
      <Text style={styles.statValue}>{value ?? "–"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Tap>
  );
}

function Row({
  Icon,
  label,
  value,
  onPress,
  last,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <>
      <View style={styles.rowIcon}>
        <Icon size={18} color={theme.green} strokeWidth={2} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
      {onPress && <ChevronRight size={18} color={theme.muted} />}
    </>
  );
  return onPress ? (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.row, last && styles.rowLast]}
    >
      {body}
    </Tap>
  ) : (
    <View style={[styles.row, last && styles.rowLast]} accessibilityLabel={`${label}: ${value}`}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  heading: { fontFamily: fonts.bold, fontSize: 30, letterSpacing: -0.5, color: theme.ink, marginBottom: 16 },
  card: { backgroundColor: theme.card, borderRadius: 22, padding: 16 },
  identity: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.bold, fontSize: 20 },
  name: { fontFamily: fonts.bold, fontSize: 19, color: theme.ink },
  roleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" },
  roleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: theme.muted },
  stats: { flexDirection: "row", gap: 10, marginTop: 12 },
  stat: { flex: 1, backgroundColor: theme.card, borderRadius: 18, paddingVertical: 14, alignItems: "center" },
  statValue: { fontFamily: fonts.bold, fontSize: 22, color: theme.ink },
  statLabel: { fontFamily: fonts.medium, fontSize: 12, color: theme.muted, marginTop: 2 },
  buyerCta: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: theme.card,
    borderRadius: 18,
    padding: 16,
  },
  section: {
    fontFamily: fonts.bold,
    fontSize: 11.5,
    letterSpacing: 0.8,
    color: theme.muted,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.line,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontFamily: fonts.medium, fontSize: 14, color: theme.muted, width: 72 },
  rowValue: { flex: 1, fontFamily: fonts.semibold, fontSize: 14.5, color: theme.ink, textAlign: "right" },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, color: theme.ink },
  deleteLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    marginTop: 18,
    paddingVertical: 6,
  },
  deleteText: { fontFamily: fonts.semibold, fontSize: 13.5, color: theme.red },
  error: { marginTop: 16, textAlign: "center", fontFamily: fonts.medium, fontSize: 13, color: theme.red },
});
