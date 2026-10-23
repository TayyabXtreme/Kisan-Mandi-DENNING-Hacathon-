// Shared KisanMandi building blocks, styled after references/. Screens should
// compose these instead of restyling buttons, chips, pills and sheets.
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import {
  Apple,
  ArrowLeft,
  Banana,
  Check,
  ChevronDown,
  Citrus,
  Droplet,
  Flower2,
  Leaf,
  Plus,
  Search,
  Soup,
  Sprout,
  Wheat,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { pct, num } from "@/lib/format";
import type { Category, Grade, MarketLabel } from "../../../convex/lib/kisan";
import { Tap } from "./tap";

// ---------- Buttons ----------

type ButtonVariant = "dark" | "green" | "soft" | "greenSoft" | "danger" | "dangerSolid";

const BUTTON_COLORS: Record<ButtonVariant, { bg: string; fg: string }> = {
  dark: { bg: theme.ink, fg: theme.card },
  green: { bg: theme.green, fg: theme.card },
  soft: { bg: theme.sand, fg: theme.ink },
  greenSoft: { bg: theme.greenSoft, fg: theme.green },
  danger: { bg: theme.redSoft, fg: theme.red },
  dangerSolid: { bg: theme.red, fg: theme.card },
};

/** Pill button. `Icon` sits before the title. */
export function Button({
  title,
  onPress,
  variant = "dark",
  Icon,
  loading,
  disabled,
  small,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  Icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = BUTTON_COLORS[variant];
  const inactive = disabled || loading;
  return (
    <Tap
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={[
        ui.button,
        small && ui.buttonSmall,
        { backgroundColor: disabled && variant === "dark" ? "#B1A99E" : c.bg },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {Icon && <Icon size={small ? 16 : 18} color={c.fg} strokeWidth={2.2} />}
          {/* One line, shrinking a little in narrow side-by-side layouts. */}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[ui.buttonText, small && ui.buttonTextSmall, { color: c.fg }]}
          >
            {title}
          </Text>
        </>
      )}
    </Tap>
  );
}

/** Round white icon button (back, close, calculator, share…). */
export function IconButton({
  Icon,
  onPress,
  label,
  style,
  color = theme.ink,
  bg = theme.card,
  size = 44,
}: {
  Icon: LucideIcon;
  onPress: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
  color?: string;
  bg?: string;
  size?: number;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={[
        ui.iconButton,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        style,
      ]}
    >
      <Icon size={size * 0.45} color={color} strokeWidth={2.2} />
    </Tap>
  );
}

/** Back arrow; falls back to `fallback` when there is no history. */
export function BackButton({
  fallback = "/prices",
  close,
  style,
}: {
  fallback?: Parameters<typeof router.replace>[0];
  /** Show an ✕ (for modals) instead of ←. */
  close?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <IconButton
      Icon={close ? X : ArrowLeft}
      label={close ? "Close" : "Go back"}
      style={style}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
    />
  );
}

/** Back button + bold title row used by form screens (06, 11, 12). */
export function ScreenTitle({
  title,
  close,
  right,
}: {
  title: string;
  close?: boolean;
  right?: ReactNode;
}) {
  return (
    <View style={ui.titleRow}>
      <BackButton close={close} />
      <Text style={ui.screenTitle} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}

// ---------- Chips, tags, badges ----------

/** Filter chip; selected = dark pill. */
export function Chip({
  label,
  selected,
  onPress,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[ui.chip, selected ? ui.chipOn : ui.chipOff, style]}
    >
      <Text style={[ui.chipText, { color: selected ? theme.card : theme.ink }]}>
        {label}
      </Text>
    </Tap>
  );
}

/** Small rounded label, e.g. TRIGGERED, Grade A, Selected. */
export function Tag({
  label,
  bg = theme.sand,
  color = theme.ink,
  upper,
  style,
}: {
  label: string;
  bg?: string;
  color?: string;
  upper?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[ui.tag, { backgroundColor: bg }, style]}>
      <Text
        style={[
          ui.tagText,
          { color },
          upper && { textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10.5 },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const GRADE_COLORS: Record<Grade, { bg: string; fg: string }> = {
  A: { bg: theme.greenSoft, fg: theme.green },
  B: { bg: theme.mustardSoft, fg: "#8A6A12" },
  C: { bg: theme.sand, fg: theme.muted },
};

export function GradeBadge({ grade, style }: { grade: Grade; style?: StyleProp<ViewStyle> }) {
  const c = GRADE_COLORS[grade];
  return <Tag label={`Grade ${grade}`} bg={c.bg} color={c.fg} style={style} />;
}

const LABELS: Record<MarketLabel, { text: string; bg: string; fg: string }> = {
  below: { text: "Below market", bg: theme.greenSoft, fg: theme.green },
  at: { text: "At market", bg: theme.sand, fg: theme.muted },
  above: { text: "Above market", bg: theme.redSoft, fg: theme.red },
};

/** Below / At / Above market (±5% of the cross-market average is "at"). */
export function MarketLabelBadge({
  label,
  style,
  onCard,
}: {
  label: MarketLabel;
  style?: StyleProp<ViewStyle>;
  /** White background, for use on a sand card. */
  onCard?: boolean;
}) {
  const c = LABELS[label];
  return (
    <Tag
      label={c.text}
      bg={onCard && label === "at" ? theme.card : c.bg}
      color={label === "at" && onCard ? theme.ink : c.fg}
      style={style}
    />
  );
}

/** ▲ 90 · 2.4% (green) / ▼ 120 · 1.9% (red) / — 0 · 0.0% (grey) */
export function PriceChangePill({
  change,
  changePct,
  suffix,
  style,
}: {
  change: number;
  changePct: number;
  /** e.g. "today" */
  suffix?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const up = change > 0;
  const down = change < 0;
  const bg = up ? theme.greenSoft : down ? theme.redSoft : theme.sand;
  const fg = up ? theme.green : down ? theme.red : theme.muted;
  const arrow = up ? "▲" : down ? "▼" : "—";
  return (
    <View
      style={[ui.pill, { backgroundColor: bg }, style]}
      accessibilityLabel={`${up ? "Up" : down ? "Down" : "No change"} ${num(Math.abs(change))} rupees, ${pct(changePct)}${suffix ? ` ${suffix}` : ""}`}
    >
      <Text style={[ui.pillText, { color: fg }]}>
        {arrow} {num(Math.abs(change))} · {pct(changePct)}
        {suffix ? ` ${suffix}` : ""}
      </Text>
    </View>
  );
}

// ---------- Crops ----------

const CROP_ICONS: Record<string, LucideIcon> = {
  wheat: Wheat,
  rice: Soup,
  cotton: Flower2,
  sugarcane: Leaf,
  onion: Droplet,
  tomato: Apple,
  mango: Citrus,
  banana: Banana,
};

export const CATEGORY_COLORS: Record<Category, { bg: string; fg: string }> = {
  grain: { bg: "#F6E8BF", fg: "#7A5A12" },
  cash: { bg: "#E2EBF2", fg: "#3C5A73" },
  vegetable: { bg: "#F8DFD9", fg: "#B4483A" },
  fruit: { bg: "#E3EEDA", fg: "#3F7A3F" },
};

export const CATEGORY_LABELS: Record<Category, { one: string; many: string }> = {
  grain: { one: "Grain", many: "Grains" },
  cash: { one: "Cash crop", many: "Cash crops" },
  vegetable: { one: "Vegetable", many: "Vegetables" },
  fruit: { one: "Fruit", many: "Fruits" },
};

/** Tinted rounded tile with the crop's icon. */
export function CropIcon({
  icon,
  category,
  size = 44,
  faded,
}: {
  icon: string;
  category: Category;
  size?: number;
  faded?: boolean;
}) {
  const Icon = CROP_ICONS[icon] ?? Sprout;
  const c = CATEGORY_COLORS[category];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.27,
        backgroundColor: c.bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: faded ? 0.5 : 1,
      }}
    >
      <Icon size={size * 0.45} color={c.fg} strokeWidth={2} />
    </View>
  );
}

/** "Wheat  گندم" — English name with the Urdu name beside it. */
export function CropName({
  name,
  local,
  size = 16,
  style,
  color = theme.ink,
}: {
  name: string;
  /** Urdu (or Sindhi) name */
  local?: string;
  size?: number;
  style?: StyleProp<TextStyle>;
  color?: string;
}) {
  return (
    <Text style={[{ fontFamily: fonts.bold, fontSize: size, color }, style]} numberOfLines={1}>
      {name}
      {!!local && (
        <Text style={{ fontFamily: undefined, fontSize: size * 0.95, color: theme.muted }}>
          {"  "}
          {local}
        </Text>
      )}
    </Text>
  );
}

// ---------- Segmented control ----------

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  activeColor = theme.ink,
  style,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T | undefined;
  onChange: (value: T) => void;
  /** theme.green for grade pickers, theme.ink for tabs. */
  activeColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[ui.segmented, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tap
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[ui.segment, on && { backgroundColor: activeColor }]}
          >
            <Text style={[ui.segmentText, { color: on ? theme.card : theme.muted }, on && { fontFamily: fonts.bold }]}>
              {o.label}
              {o.count !== undefined && (
                <Text style={{ fontFamily: fonts.regular, color: on ? theme.card : theme.muted }}>
                  {"  "}
                  {o.count}
                </Text>
              )}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

// ---------- Sheets & selects ----------

/**
 * Bottom sheet on a dimmed backdrop (RN Modal; no extra native deps). The
 * Modal itself doesn't animate: the backdrop fades in place over the screen
 * while only the white panel slides up, and both reverse before unmounting.
 */
export function Sheet({
  visible,
  onClose,
  title,
  right,
  children,
  maxHeight = "80%",
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  maxHeight?: ViewStyle["maxHeight"];
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));
  // Stays true through the closing animation, then unmounts the Modal.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 300 : 220,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, mounted, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[ui.backdrop, { opacity: progress }]}>
        <Tap style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" pressedStyle={{}} />
      </Animated.View>
      <Animated.View
        style={[ui.sheet, { paddingBottom: insets.bottom + 16, maxHeight, transform: [{ translateY }] }]}
      >
        <View style={ui.handle} />
        {(title || right) && (
          <View style={ui.sheetHeader}>
            <Text style={ui.sheetTitle} accessibilityRole="header">
              {title}
            </Text>
            {right}
          </View>
        )}
        {children}
      </Animated.View>
    </Modal>
  );
}

/** Centered confirm dialog in the app theme (replaces the native Alert). */
export function ConfirmDialog({
  visible,
  title,
  message,
  Icon,
  confirmTitle = "Confirm",
  cancelTitle = "Cancel",
  destructive,
  loading,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  Icon?: LucideIcon;
  confirmTitle?: string;
  cancelTitle?: string;
  destructive?: boolean;
  /** Keeps the dialog open with a spinner on the confirm button. */
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const close = () => {
    if (!loading) onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={ui.dialogWrap}>
        <Tap style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" pressedStyle={{}} />
        <View style={ui.dialog} accessibilityViewIsModal>
          {Icon && (
            <View style={[ui.dialogIcon, { backgroundColor: destructive ? theme.redSoft : theme.greenSoft }]}>
              <Icon size={26} color={destructive ? theme.red : theme.green} strokeWidth={2.2} />
            </View>
          )}
          <Text style={ui.dialogTitle} accessibilityRole="header">
            {title}
          </Text>
          {!!message && <Text style={ui.dialogMessage}>{message}</Text>}
          <View style={ui.dialogActions}>
            <Button title={cancelTitle} variant="soft" onPress={close} disabled={loading} style={{ flex: 1 }} />
            <Button
              title={confirmTitle}
              variant={destructive ? "dangerSolid" : "dark"}
              loading={loading}
              onPress={onConfirm}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export type SelectOption<T extends string> = { value: T; label: string; hint?: string };

/** Bottom-sheet list with a check on the selected row. */
export function SelectSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
  searchable,
  searchPlaceholder = "Search",
  onAdd,
  addLabel = "Add new",
}: {
  visible: boolean;
  title: string;
  options: SelectOption<T>[];
  value: T | undefined;
  onSelect: (value: T) => void;
  onClose: () => void;
  /** Show a search box that filters by label and hint (long lists). */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Adds a "+" button to the header; the sheet closes before it runs. */
  onAdd?: () => void;
  addLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q),
      )
    : options;
  const close = () => {
    setQuery("");
    onClose();
  };
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={title}
      maxHeight={searchable ? "85%" : "70%"}
      right={
        onAdd && (
          <Tap
            onPress={() => {
              close();
              onAdd();
            }}
            accessibilityRole="button"
            accessibilityLabel={addLabel}
            hitSlop={6}
            style={ui.addButton}
          >
            <Plus size={16} color={theme.green} strokeWidth={2.6} />
            <Text style={ui.addButtonText}>{addLabel}</Text>
          </Tap>
        )
      }
    >
      {searchable && (
        <View style={ui.search}>
          <Search size={18} color={theme.muted} strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={theme.muted}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel={searchPlaceholder}
            style={ui.searchInput}
          />
          {!!query && (
            <Tap onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={8}>
              <X size={16} color={theme.muted} strokeWidth={2.2} />
            </Tap>
          )}
        </View>
      )}
      <FlatList
        data={shown}
        keyExtractor={(o) => o.value}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        ListEmptyComponent={<Text style={[ui.stateText, { padding: 24 }]}>No matches for “{query}”.</Text>}
        renderItem={({ item }) => {
          const on = item.value === value;
          return (
            <Tap
              onPress={() => {
                onSelect(item.value);
                close();
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={ui.option}
              pressedStyle={{ backgroundColor: theme.sand }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[ui.optionText, on && { fontFamily: fonts.semibold }]}>{item.label}</Text>
                {!!item.hint && <Text style={ui.optionHint}>{item.hint}</Text>}
              </View>
              {on && <Check size={18} color={theme.green} strokeWidth={2.6} />}
            </Tap>
          );
        }}
      />
    </Sheet>
  );
}

/** White field that opens a SelectSheet. */
export function SelectField({
  value,
  placeholder,
  onPress,
  Icon,
  error,
  style,
  accessibilityLabel,
}: {
  value?: string;
  placeholder: string;
  onPress: () => void;
  Icon?: LucideIcon;
  error?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${placeholder}: ${value ?? "not chosen"}`}
      style={[ui.field, error && { borderColor: theme.red }, style]}
    >
      {Icon && <Icon size={18} color={theme.green} strokeWidth={2} />}
      <Text style={[ui.fieldText, !value && { color: theme.muted }]} numberOfLines={1}>
        {value ?? placeholder}
      </Text>
      <ChevronDown size={18} color={theme.ink} strokeWidth={2} />
    </Tap>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={ui.label}>{children}</Text>;
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <Text style={ui.error}>{children}</Text>;
}

// ---------- States ----------

/** Loading spinner, error with retry, or empty message. */
export function StateView({
  loading,
  error,
  onRetry,
  empty,
  style,
}: {
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  empty?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[ui.state, style]}>
      {loading ? (
        <ActivityIndicator color={theme.green} accessibilityLabel="Loading" />
      ) : error ? (
        <>
          <Text style={ui.stateText}>{error.message}</Text>
          {onRetry && <Button title="Try again" small onPress={onRetry} />}
        </>
      ) : (
        <Text style={ui.stateText}>{empty}</Text>
      )}
    </View>
  );
}

export const ui = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonSmall: { height: 42, borderRadius: 21, paddingHorizontal: 16, gap: 6 },
  buttonText: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 16, textAlign: "center" },
  buttonTextSmall: { fontSize: 14 },
  iconButton: { alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  screenTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 22, color: theme.ink, letterSpacing: -0.3 },
  chip: { height: 38, borderRadius: 19, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: theme.ink },
  chipOff: { backgroundColor: theme.card },
  chipText: { fontFamily: fonts.semibold, fontSize: 14 },
  tag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  tagText: { fontFamily: fonts.bold, fontSize: 11.5 },
  pill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-end" },
  pillText: { fontFamily: fonts.bold, fontSize: 11.5 },
  segmented: { flexDirection: "row", backgroundColor: theme.card, borderRadius: 18, padding: 4 },
  segment: { flex: 1, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  segmentText: { fontFamily: fonts.semibold, fontSize: 14 },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(20,15,10,0.55)" },
  dialogWrap: {
    flex: 1,
    backgroundColor: "rgba(20,15,10,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.card,
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
  },
  dialogIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  dialogTitle: { fontFamily: fonts.bold, fontSize: 20, color: theme.ink, textAlign: "center" },
  dialogMessage: {
    fontFamily: fonts.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: theme.muted,
    textAlign: "center",
    marginTop: 8,
  },
  dialogActions: { flexDirection: "row", gap: 10, marginTop: 22, alignSelf: "stretch" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: theme.line, marginBottom: 12 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    marginBottom: 8,
  },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 20, color: theme.ink },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.greenSoft,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addButtonText: { fontFamily: fonts.semibold, fontSize: 13.5, color: theme.green },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 22,
    marginBottom: 8,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.sand,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: theme.ink, paddingVertical: 0 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 22, paddingVertical: 14 },
  optionText: { fontFamily: fonts.regular, fontSize: 16, color: theme.ink },
  optionHint: { fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginTop: 2 },
  field: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: theme.card,
    borderWidth: 1.2,
    borderColor: theme.card,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fieldText: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: theme.ink },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: theme.ink, marginTop: 16, marginBottom: 8 },
  error: { marginTop: 6, fontFamily: fonts.medium, fontSize: 12.5, color: theme.red },
  state: { paddingVertical: 48, alignItems: "center", justifyContent: "center", gap: 14 },
  stateText: { fontFamily: fonts.regular, fontSize: 14.5, color: theme.muted, textAlign: "center", maxWidth: 280 },
});
