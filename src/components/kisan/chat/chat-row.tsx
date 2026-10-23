import { StyleSheet, Text, View } from "react-native";
import { Check, CheckCheck } from "lucide-react-native";
import { format, isToday, isYesterday, differenceInCalendarDays } from "date-fns";
import { UserAvatar } from "@/components/user-avatar";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import type { ChatRow as Row } from "@/lib/api/types";
import { Tap } from "../tap";
import { CropIcon } from "../ui";

/** WhatsApp-style list time: 9:30 AM · Yesterday · Mon · 12/10/26 */
export function listTime(ms: number, now = Date.now()) {
  const d = new Date(ms);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  if (differenceInCalendarDays(now, d) < 7) return format(d, "EEE");
  return format(d, "d/M/yy");
}

/** One row in the Chats tab. */
export function ChatListRow({
  row,
  onPress,
  onLongPress,
}: {
  row: Row;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const name = row.other?.name ?? "Deleted user";
  const unread = row.unread > 0;
  return (
    <Tap
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`Chat with ${name}${row.listing ? ` about ${row.listing.crop.name}` : ""}. ${row.lastMessage}${unread ? `. ${row.unread} unread` : ""}`}
      accessibilityHint="Long press to archive"
      style={styles.row}
      pressedStyle={{ backgroundColor: theme.sand }}
    >
      <View>
        <UserAvatar seed={row.other?.authId ?? row.id} name={name} image={row.other?.image} size={52} />
        {row.listing && (
          <View style={styles.cropBadge}>
            <CropIcon icon={row.listing.crop.icon} category={row.listing.crop.category} size={22} />
          </View>
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.time, unread && styles.timeUnread]}>{listTime(row.lastMessageAt)}</Text>
        </View>
        <Text style={styles.listing} numberOfLines={1}>
          {row.listing
            ? `${row.listing.crop.name} · Grade ${row.listing.grade}${row.listing.status === "sold" ? " · Sold" : ""}`
            : "Listing removed"}
        </Text>
        <View style={styles.bottom}>
          {row.lastFromMe &&
            (row.lastRead ? (
              <CheckCheck size={16} color={theme.green} strokeWidth={2.2} />
            ) : (
              <Check size={16} color={theme.muted} strokeWidth={2.2} />
            ))}
          <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
            {row.lastMessage || "Say salam 👋"}
          </Text>
          {unread && (
            <View style={styles.unread}>
              <Text style={styles.unreadText}>{row.unread > 99 ? "99+" : row.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 12 },
  cropBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.bg,
  },
  body: { flex: 1, gap: 2 },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: theme.ink },
  time: { fontFamily: fonts.regular, fontSize: 12, color: theme.muted },
  timeUnread: { fontFamily: fonts.semibold, color: theme.green },
  listing: { fontFamily: fonts.medium, fontSize: 12.5, color: theme.muted },
  bottom: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 },
  preview: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: theme.muted },
  previewUnread: { fontFamily: fonts.medium, color: theme.ink },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: theme.green,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadText: { fontFamily: fonts.bold, fontSize: 11.5, color: theme.card },
});
