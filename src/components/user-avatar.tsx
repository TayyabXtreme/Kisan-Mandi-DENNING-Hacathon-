import { useState } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { theme } from "@/constants/theme";
import { fonts } from "@/constants/fonts";

/** DiceBear 10.x styles (all tested). Preview: https://www.dicebear.com/styles */
export type AvatarStyle =
  | "notionists"
  | "adventurer"
  | "avataaars"
  | "lorelei"
  | "micah"
  | "thumbs"
  | "bottts"
  | "fun-emoji"
  | "initials";

/** A stable avatar image URL: the same seed always gives the same face. */
export function dicebearUrl(seed: string, style: AvatarStyle = "notionists", size = 128) {
  // Request 2x pixels so it stays sharp on high-density screens.
  return `https://api.dicebear.com/10.x/${style}/png?seed=${encodeURIComponent(seed)}&size=${Math.min(size * 2, 256)}`;
}

type Props = {
  /** Stable ID used as the DiceBear seed (e.g. users.authId or _id). */
  seed: string;
  name?: string;
  /** Real photo (e.g. the Google profile picture). Used first when present. */
  image?: string | null;
  size?: number;
  avatarStyle?: AvatarStyle;
  style?: StyleProp<ViewStyle>;
};

/**
 * Profile picture with fallbacks: real photo → DiceBear avatar → initials
 * (when offline or an image fails to load).
 */
export function UserAvatar({ seed, name, image, size = 48, avatarStyle, style }: Props) {
  const [failed, setFailed] = useState<string[]>([]);
  const sources = [image, dicebearUrl(seed, avatarStyle, size)].filter(
    (uri): uri is string => !!uri && !failed.includes(uri),
  );
  const uri = sources[0];
  const initials = (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name ? `${name}'s profile picture` : "Profile picture"}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
          backgroundColor: theme.greenSoft,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          cachePolicy="disk"
          transition={150}
          onError={() => setFailed((list) => [...list, uri])}
        />
      ) : (
        <Text style={{ fontFamily: fonts.bold, color: theme.green, fontSize: size * 0.38 }}>
          {initials || "?"}
        </Text>
      )}
    </View>
  );
}
