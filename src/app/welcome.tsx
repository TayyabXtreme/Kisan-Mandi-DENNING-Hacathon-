import { useEffect, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ScrollView,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowRight,
  Bell,
  Phone,
  Sprout,
  Store,
  TrendingUp,
  Wheat,
  type LucideIcon,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HillsScene } from "@/components/kisan/hills-scene";
import { Tap } from "@/components/kisan/tap";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { markWelcomeSeen } from "@/lib/welcome-seen";
import { APP_NAME } from "../../convex/lib/app_info";

type FloatingCard = {
  Icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  /** Small grey line above the value; omit for a single-line pill. */
  caption?: string;
  value: string;
  delta?: string;
};

type Slide = {
  key: string;
  title: string;
  body: string;
  /** Top-left card (large) and right card (pill). */
  cards: [FloatingCard, FloatingCard];
};

// Fictional sample figures, matching the seeded demo data's range.
const SLIDES: Slide[] = [
  {
    key: "prices",
    title: "Know today's mandi\nrate before you sell",
    body: "Live crop prices across Sindh markets, price alerts and direct sale to buyers.",
    cards: [
      {
        Icon: Wheat,
        iconBg: theme.mustard,
        iconColor: theme.ink,
        caption: "Wheat · Hyderabad",
        value: "Rs 3,850",
        delta: "▲ 2.4%",
      },
      {
        Icon: Bell,
        iconBg: theme.greenSoft,
        iconColor: theme.green,
        value: "Cotton hit Rs 8,200",
      },
    ],
  },
  {
    key: "compare",
    title: "Compare mandis,\nsell where it pays",
    body: "14-day price trends and the best market for your crop today.",
    cards: [
      {
        Icon: TrendingUp,
        iconBg: theme.greenSoft,
        iconColor: theme.green,
        caption: "Best place to sell",
        value: "Sukkur",
        delta: "+Rs 130",
      },
      {
        Icon: Bell,
        iconBg: theme.mustardSoft,
        iconColor: theme.ink,
        value: "Alert when ≥ Rs 4,100",
      },
    ],
  },
  {
    key: "sell",
    title: "Sell your produce\ndirect to buyers",
    body: "Post your crop and get calls and WhatsApp messages from buyers.",
    cards: [
      {
        Icon: Store,
        iconBg: theme.mustard,
        iconColor: theme.ink,
        caption: "Wheat · Grade A",
        value: "150 maund",
        delta: "At market",
      },
      {
        Icon: Phone,
        iconBg: theme.greenSoft,
        iconColor: theme.green,
        value: "A buyer called you",
      },
    ],
  },
];

const SHEET_RADIUS = 36;
const AUTO_ADVANCE_MS = 4500;

export default function Welcome() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const touched = useRef(false);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  // Gently rotate the slides until the user swipes.
  useEffect(() => {
    const timer = setInterval(() => {
      if (touched.current) return;
      // Programmatic scrolls skip onMomentumScrollEnd on iOS; read the offset.
      const next = (Math.round(scrollX.value / width) + 1) % SLIDES.length;
      (scrollRef.current as unknown as ScrollView | null)?.scrollTo({
        x: next * width,
        animated: true,
      });
      setIndex(next);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [width, scrollRef, scrollX]);

  const goToProfile = async () => {
    touched.current = true;
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await markWelcomeSeen();
    router.replace("/profile-setup");
  };

  const handleContinue = () => {
    if (index === SLIDES.length - 1) {
      void goToProfile();
      return;
    }

    touched.current = true;
    const next = index + 1;
    (scrollRef.current as unknown as ScrollView | null)?.scrollTo({
      x: next * width,
      animated: true,
    });
    setIndex(next);
  };

  const sheetHeight = Math.max(330, Math.round(height * 0.4)) + insets.bottom;
  const sceneHeight = height - sheetHeight + SHEET_RADIUS + 8;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={[StyleSheet.absoluteFill, { height: sceneHeight }]}>
        <HillsScene width={width} height={sceneHeight} />
        {SLIDES.map((slide, i) => (
          <SlideCards
            key={slide.key}
            slide={slide}
            index={i}
            width={width}
            sceneHeight={sceneHeight}
            scrollX={scrollX}
          />
        ))}
      </View>

      <Tap
        onPress={goToProfile}
        accessibilityRole="button"
        accessibilityLabel="Skip introduction"
        hitSlop={10}
        style={[styles.skip, { top: insets.top + 12 }]}
      >
        <Text style={styles.skipText}>Skip</Text>
      </Tap>

      <View
        style={[
          styles.sheet,
          { height: sheetHeight, paddingBottom: insets.bottom + 20 },
        ]}
      >
        <View style={styles.brand} accessibilityRole="header">
          <View style={styles.logo}>
            <Sprout size={18} color={theme.card} strokeWidth={2.4} />
          </View>
          <Text style={styles.brandText}>{APP_NAME}</Text>
        </View>

        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => {
            touched.current = true;
          }}
          onMomentumScrollEnd={(e) =>
            setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
          }
          style={styles.pager}
        >
          {SLIDES.map((slide) => (
            <View key={slide.key} style={[styles.page, { width }]}>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.body}>{slide.body}</Text>
            </View>
          ))}
        </Animated.ScrollView>

        <View
          style={styles.dots}
          accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}
        >
          {SLIDES.map((slide, i) => (
            <Dot key={slide.key} index={i} width={width} scrollX={scrollX} />
          ))}
        </View>

        <Tap
          onPress={handleContinue}
          accessibilityRole="button"
          accessibilityLabel={
            index === SLIDES.length - 1 ? "Get started" : "Next slide"
          }
          style={styles.button}
        >
          <Text style={styles.buttonText}>
            {index === SLIDES.length - 1 ? "Get Started" : "Next"}
          </Text>
          <ArrowRight size={18} color={theme.card} strokeWidth={2.2} />
        </Tap>
      </View>
    </View>
  );
}

function SlideCards({
  slide,
  index,
  width,
  sceneHeight,
  scrollX,
}: {
  slide: Slide;
  index: number;
  width: number;
  sceneHeight: number;
  scrollX: SharedValue<number>;
}) {
  // Each slide's cards fade and drift in as its page scrolls into view.
  const style = useAnimatedStyle(() => {
    const p = scrollX.value / width;
    return {
      opacity: interpolate(
        p,
        [index - 0.6, index, index + 0.6],
        [0, 1, 0],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          translateY: interpolate(
            p,
            [index - 1, index, index + 1],
            [14, 0, 14],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });
  const [main, pill] = slide.cards;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
    >
      <View style={[styles.cardMain, { top: sceneHeight * 0.27 }]}>
        <View style={[styles.cardIcon, { backgroundColor: main.iconBg }]}>
          <main.Icon size={18} color={main.iconColor} strokeWidth={2.2} />
        </View>
        <View>
          {!!main.caption && <Text style={styles.cardCaption}>{main.caption}</Text>}
          <View style={styles.cardRow}>
            <Text style={styles.cardValue}>{main.value}</Text>
            {!!main.delta && <Text style={styles.cardDelta}>{main.delta}</Text>}
          </View>
        </View>
      </View>
      <View style={[styles.cardPill, { top: sceneHeight * 0.45 }]}>
        <View style={[styles.pillIcon, { backgroundColor: pill.iconBg }]}>
          <pill.Icon size={14} color={pill.iconColor} strokeWidth={2.2} />
        </View>
        <Text style={styles.pillText}>{pill.value}</Text>
      </View>
    </Animated.View>
  );
}

function Dot({
  index,
  width,
  scrollX,
}: {
  index: number;
  width: number;
  scrollX: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const p = scrollX.value / width;
    const range = [index - 1, index, index + 1];
    return {
      width: interpolate(p, range, [6, 22, 6], Extrapolation.CLAMP),
      backgroundColor: interpolateColor(p, range, [
        theme.line,
        theme.green,
        theme.line,
      ]),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

const shadow = {
  shadowColor: "#2B2118",
  shadowOpacity: 0.1,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.sky },
  skip: {
    position: "absolute",
    right: 20,
    zIndex: 2,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  skipText: { fontFamily: fonts.semibold, fontSize: 13, color: theme.ink },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.card,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingTop: 30,
    // Above the scene's elevated cards, so they never cover the button.
    zIndex: 1,
    elevation: 6,
    alignItems: "center",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: theme.green,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: { fontFamily: fonts.bold, fontSize: 17, color: theme.ink },
  pager: { flexGrow: 0, marginTop: 18 },
  page: { paddingHorizontal: 28, alignItems: "center" },
  title: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.5,
    color: theme.ink,
    textAlign: "center",
  },
  body: {
    marginTop: 12,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: theme.muted,
    textAlign: "center",
    maxWidth: 320,
  },
  dots: { flexDirection: "row", gap: 6, marginTop: 20, height: 6 },
  dot: { height: 6, borderRadius: 3 },
  button: {
    marginTop: "auto",
    alignSelf: "stretch",
    marginHorizontal: 28,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  buttonText: { fontFamily: fonts.bold, fontSize: 16, color: theme.card },
  cardMain: {
    position: "absolute",
    left: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: 16,
    paddingVertical: 12,
    paddingLeft: 10,
    paddingRight: 16,
    ...shadow,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCaption: { fontFamily: fonts.regular, fontSize: 12, color: theme.muted },
  cardRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 2 },
  cardValue: { fontFamily: fonts.bold, fontSize: 15, color: theme.ink },
  cardDelta: { fontFamily: fonts.semibold, fontSize: 12, color: theme.green },
  cardPill: {
    position: "absolute",
    right: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.card,
    borderRadius: 14,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 14,
    ...shadow,
  },
  pillIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 12.5, color: theme.ink },
});
