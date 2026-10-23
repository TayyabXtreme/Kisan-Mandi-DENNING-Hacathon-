import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";
import type { Category } from "../../../../convex/lib/kisan";
import { CATEGORY_COLORS } from "../ui";

const GROUND = { mustard: "#E8C976", green: "#A9CC88", sky: "#E2EBF2" };

function Stalk({ x, h }: { x: number; h: number }) {
  // A wheat stalk: stem with paired grains.
  const top = 92 - h;
  const grains = [0, 9, 18, 27];
  return (
    <G stroke="#C9973A" strokeWidth={2.4} strokeLinecap="round" fill="none">
      <Line x1={x} y1={96} x2={x} y2={top} />
      {grains.map((g) => (
        <G key={g}>
          <Line x1={x} y1={top + 6 + g} x2={x - 7} y2={top + g} />
          <Line x1={x} y1={top + 6 + g} x2={x + 7} y2={top + g} />
        </G>
      ))}
    </G>
  );
}

function Wheat() {
  return (
    <>
      <Rect width="100" height="100" fill="#F6E8BF" />
      <Path d="M0 74 C 30 66 70 66 100 72 L100 100 L0 100 Z" fill={GROUND.mustard} />
      <Stalk x={28} h={58} />
      <Stalk x={50} h={68} />
      <Stalk x={72} h={54} />
    </>
  );
}

function Cotton() {
  return (
    <>
      <Rect width="100" height="100" fill={GROUND.sky} />
      <Path d="M0 76 C 30 66 70 68 100 74 L100 100 L0 100 Z" fill={GROUND.green} />
      <G stroke="#3D6B34" strokeWidth={2.4} strokeLinecap="round">
        <Line x1={34} y1={90} x2={34} y2={46} />
        <Line x1={52} y1={90} x2={52} y2={34} />
        <Line x1={68} y1={90} x2={68} y2={48} />
      </G>
      <G fill="#FFFFFF" stroke="#D6DEE6" strokeWidth={1}>
        <Circle cx={30} cy={42} r={8} />
        <Circle cx={39} cy={40} r={7} />
        <Circle cx={48} cy={30} r={8} />
        <Circle cx={57} cy={29} r={7} />
        <Circle cx={64} cy={44} r={8} />
        <Circle cx={72} cy={42} r={7} />
      </G>
    </>
  );
}

function Onion() {
  return (
    <>
      <Rect width="100" height="100" fill="#F8DFD9" />
      <Path d="M0 74 C 30 68 70 68 100 76 L100 100 L0 100 Z" fill={GROUND.mustard} />
      <Path d="M50 12 C 47 22 50 26 50 30" stroke="#3D6B34" strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Path d="M50 30 C 68 40 70 66 50 80 C 30 66 32 40 50 30 Z" fill="#A9483C" />
      <Path d="M50 34 C 58 46 58 64 50 76" stroke="#C7665A" strokeWidth={1.6} fill="none" />
      <Ellipse cx={64} cy={78} rx={9} ry={11} fill="#C0574A" />
    </>
  );
}

function Mango() {
  return (
    <>
      <Rect width="100" height="100" fill="#E3EEDA" />
      <Path d="M0 76 C 30 68 70 68 100 74 L100 100 L0 100 Z" fill={GROUND.green} />
      <Path d="M52 20 C 60 14 70 16 74 22 C 66 26 58 26 52 20 Z" fill="#3D6B34" />
      <Path d="M50 24 C 72 26 80 54 64 72 C 50 86 28 76 28 56 C 28 38 38 24 50 24 Z" fill="#E9A53A" />
      <Path d="M38 40 C 36 50 38 58 44 64" stroke="#F6C463" strokeWidth={3} fill="none" strokeLinecap="round" />
    </>
  );
}

function Generic({ category }: { category: Category }) {
  const c = CATEGORY_COLORS[category];
  return (
    <>
      <Rect width="100" height="100" fill={c.bg} />
      <Path d="M0 74 C 30 66 70 66 100 72 L100 100 L0 100 Z" fill={category === "fruit" ? GROUND.green : GROUND.mustard} />
      <G stroke={c.fg} strokeWidth={2.6} strokeLinecap="round" fill="none">
        <Line x1={50} y1={88} x2={50} y2={44} />
        <Path d="M50 60 C 38 56 32 46 34 38 C 44 40 50 48 50 60 Z" fill={c.fg} />
        <Path d="M50 52 C 62 48 68 38 66 30 C 56 32 50 40 50 52 Z" fill={c.fg} />
      </G>
    </>
  );
}

/** Small illustrated scene for a crop (marketplace cards, listing hero). */
export function CropArt({
  icon,
  category,
  size = 96,
  radius = 16,
  style,
}: {
  icon: string;
  category: Category;
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const art =
    icon === "wheat" || icon === "rice" ? (
      <Wheat />
    ) : icon === "cotton" ? (
      <Cotton />
    ) : icon === "onion" || icon === "tomato" ? (
      <Onion />
    ) : icon === "mango" ? (
      <Mango />
    ) : (
      <Generic category={category} />
    );
  return (
    <View
      style={[{ width: size, height: size, borderRadius: radius, overflow: "hidden" }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {art}
      </Svg>
    </View>
  );
}
