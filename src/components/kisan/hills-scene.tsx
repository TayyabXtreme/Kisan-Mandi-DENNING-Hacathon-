import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";
import { scene } from "@/constants/theme";

type Props = {
  width: number;
  height: number;
  /** Hide the wind turbine and plant for compact headers. */
  compact?: boolean;
};

/**
 * Sky, sun, rolling hills, a mustard field and a farmhouse. Drawn on a
 * 390×520 canvas anchored to the bottom, so it crops cleanly at any height.
 */
export function HillsScene({ width, height, compact = false }: Props) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 390 520"
      preserveAspectRatio="xMidYMax slice"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Rect x="0" y="0" width="390" height="520" fill={scene.sky} />

      {/* Clouds */}
      <G fill={scene.cloud}>
        <Ellipse cx="62" cy="128" rx="32" ry="7" />
        <Ellipse cx="66" cy="121" rx="15" ry="9" />
        <Ellipse cx="232" cy="96" rx="30" ry="7" />
        <Ellipse cx="226" cy="89" rx="14" ry="9" />
      </G>

      {/* Sun */}
      <Circle cx="300" cy="150" r="50" fill={scene.sunHalo} />
      <Circle cx="300" cy="150" r="36" fill={scene.sun} />

      {/* Hills */}
      <Path
        d="M0 318 C 70 286 150 292 220 316 C 280 336 340 300 390 288 L390 520 L0 520 Z"
        fill={scene.hillBack}
      />
      <Path
        d="M0 372 C 80 340 170 352 240 368 C 300 382 350 352 390 344 L390 520 L0 520 Z"
        fill={scene.hillFront}
      />

      {/* Wind turbine */}
      {!compact && (
        <G stroke={scene.pole} strokeWidth="3" strokeLinecap="round">
          <Line x1="352" y1="250" x2="352" y2="330" />
          <Line x1="352" y1="250" x2="334" y2="238" />
          <Line x1="352" y1="250" x2="370" y2="238" />
        </G>
      )}

      {/* Farmhouse */}
      <Path d="M243 320 L285 293 L327 320 Z" fill={scene.roof} />
      <Rect x="250" y="318" width="70" height="48" fill={scene.house} />
      <Rect x="258" y="328" width="12" height="9" fill={scene.window} />
      <Rect x="300" y="328" width="12" height="9" fill={scene.window} />
      <Rect x="277" y="338" width="16" height="28" fill={scene.window} />

      {/* Field */}
      <Path
        d="M0 408 C 110 392 270 392 390 404 L390 520 L0 520 Z"
        fill={scene.field}
      />
      <G stroke={scene.fieldStripe} strokeWidth="2.5" fill="none">
        <Path d="M0 438 C 120 424 270 424 390 434" />
        <Path d="M0 466 C 120 452 270 452 390 462" />
        <Path d="M0 496 C 120 482 270 482 390 492" />
      </G>

      {/* Plant */}
      {!compact && (
        <G>
          <Path d="M30 410 C 18 384 24 362 40 352 C 46 374 44 394 36 410 Z" fill={scene.leaf} />
          <Path d="M44 410 C 44 380 52 360 64 350 C 68 376 60 396 50 410 Z" fill={scene.leafDark} />
          <Path d="M54 410 C 62 388 76 372 94 364 C 88 388 76 402 60 410 Z" fill={scene.leaf} />
        </G>
      )}
    </Svg>
  );
}
