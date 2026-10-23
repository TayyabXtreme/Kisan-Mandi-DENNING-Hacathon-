import {
  DISTRICTS_BY_PROVINCE,
  FEATURED_DISTRICTS,
  provinceOf,
  type District,
  type Province,
} from "../../../convex/lib/kisan";
import type { SelectOption } from "./ui";

/**
 * Every Pakistan district/city for searchable pickers: Sindh mandi districts
 * first, then the rest grouped by province (the hint is searchable too).
 */
export const DISTRICT_OPTIONS: SelectOption<District>[] = [
  ...FEATURED_DISTRICTS.map((d) => ({ value: d as District, label: d, hint: "Sindh · has a mandi nearby" })),
  ...(Object.keys(DISTRICTS_BY_PROVINCE) as Province[]).flatMap((province) =>
    (DISTRICTS_BY_PROVINCE[province] as readonly District[])
      .filter((d) => !(FEATURED_DISTRICTS as readonly string[]).includes(d))
      .map((d) => ({ value: d, label: d, hint: province })),
  ),
];

/** "Hyderabad, Sindh" */
export const districtLabel = (district: string) => {
  const province = provinceOf(district);
  return province && province !== district ? `${district}, ${province}` : district;
};
