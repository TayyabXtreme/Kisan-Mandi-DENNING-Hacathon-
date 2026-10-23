import {
  Bug,
  Droplets,
  Ellipsis,
  FlaskConical,
  Sprout,
  Tractor,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import type { ExpenseCategory } from "../../../../convex/lib/kisan";

/** Names and icons for crop expense types (convex/lib/kisan.ts EXPENSE_CATEGORIES). */
export const EXPENSE_LABELS: Record<ExpenseCategory, { label: string; Icon: LucideIcon }> = {
  seed: { label: "Seed", Icon: Sprout },
  fertilizer: { label: "Fertilizer", Icon: FlaskConical },
  pesticide: { label: "Pesticide", Icon: Bug },
  labour: { label: "Labour", Icon: Users },
  irrigation: { label: "Water", Icon: Droplets },
  machinery: { label: "Machinery", Icon: Tractor },
  transport: { label: "Transport", Icon: Truck },
  other: { label: "Other", Icon: Ellipsis },
};
