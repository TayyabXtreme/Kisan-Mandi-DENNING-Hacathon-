import { View } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { fonts } from "@/constants/fonts";
import { theme } from "@/constants/theme";
import { day, num } from "@/lib/format";
import type { PricePoint } from "@/lib/api/types";

const Y_LABEL_WIDTH = 44;
const SECTIONS = 3;
const NICE_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];

/** Smallest nice step so SECTIONS steps from a rounded base cover min..max. */
function axis(min: number, max: number) {
  for (const step of NICE_STEPS) {
    const base = Math.floor(min / step) * step;
    if (base + step * SECTIONS >= max && max - min <= step * SECTIONS) {
      // Leave a little room under the lowest point when possible.
      const lowered = base - step > 0 && min - base < step * 0.2 && base + step * (SECTIONS - 1) >= max ? base - step : base;
      return { base: lowered, step };
    }
  }
  const step = Math.ceil((max - min || 1) / SECTIONS);
  return { base: min, step };
}

const RedDot = () => (
  <View
    style={{
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: theme.red,
      borderWidth: 1.5,
      borderColor: theme.card,
    }}
  />
);

const Ring = () => (
  <View
    style={{
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: theme.card,
      borderWidth: 2.5,
      borderColor: theme.green,
    }}
  />
);

/**
 * 14-day line (reference 04): green curve, red dot on the lowest day, a
 * hollow ring and dashed drop line on the latest day, labels first/mid/last.
 * Values are shifted by the axis base so the y-axis doesn't start at 0.
 */
export function PriceChart({ points, width }: { points: PricePoint[]; width: number }) {
  if (points.length < 2) return null;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const minIndex = prices.indexOf(min);
  const last = points.length - 1;
  const mid = Math.floor(last / 2);
  const { base, step } = axis(min, max);
  const height = 150;
  const initialSpacing = 8;
  const endSpacing = 12;
  const plotWidth = width - Y_LABEL_WIDTH - 4;
  const spacing = (plotWidth - initialSpacing - endSpacing) / last;

  const data = points.map((p, i) => ({
    value: p.price - base,
    label: i === 0 || i === mid || i === last ? day(p.date) : "",
    labelTextStyle: {
      width: 52,
      marginLeft: i === 0 ? 18 : i === last ? -26 : 0,
      color: theme.muted,
      fontFamily: fonts.regular,
      fontSize: 10.5,
    },
    hideDataPoint: i !== minIndex && i !== last,
    customDataPoint: i === last ? Ring : i === minIndex ? RedDot : undefined,
    showVerticalLine: i === last,
    verticalLineColor: theme.green,
    verticalLineThickness: 1.5,
    verticalLineStrokeDashArray: [4, 4],
    verticalLineUptoDataPoint: true,
  }));

  return (
    <View
      accessibilityLabel={`Price chart: low ${num(min)} on ${day(points[minIndex].date)}, latest ${num(prices[last])}`}
    >
      <LineChart
        data={data}
        width={plotWidth}
        height={height}
        spacing={spacing}
        initialSpacing={initialSpacing}
        endSpacing={endSpacing}
        maxValue={step * SECTIONS}
        noOfSections={SECTIONS}
        formatYLabel={(label: string) => num(Number(label) + base)}
        yAxisLabelWidth={Y_LABEL_WIDTH}
        yAxisTextStyle={{ color: theme.muted, fontFamily: fonts.regular, fontSize: 10.5 }}
        yAxisColor="transparent"
        xAxisColor="transparent"
        rulesColor={theme.line}
        rulesType="solid"
        color={theme.green}
        thickness={2.5}
        disableScroll
        isAnimated={false}
      />
    </View>
  );
}
