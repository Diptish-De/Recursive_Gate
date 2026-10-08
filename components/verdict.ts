import { Clock, ShieldCheck, ShieldX, type LucideIcon } from "lucide-react";
import type { Verdict } from "@/lib/types";

// How each verdict looks everywhere in the UI. Colour never appears alone: always icon + word.
export const VERDICT: Record<
  Verdict,
  { label: string; stat: string; Icon: LucideIcon; text: string; chip: string; tint: string }
> = {
  ALLOW: {
    label: "Allowed",
    stat: "allowed",
    Icon: ShieldCheck,
    text: "text-allow",
    chip: "border-allow/30 bg-allow/10 text-allow hover:bg-allow/15",
    tint: "bg-allow/[0.07]",
  },
  BLOCK: {
    label: "Blocked",
    stat: "blocked",
    Icon: ShieldX,
    text: "text-block",
    chip: "border-block/30 bg-block/10 text-block hover:bg-block/15",
    tint: "bg-block/[0.07]",
  },
  ESCALATE: {
    label: "Needs approval",
    stat: "escalated",
    Icon: Clock,
    text: "text-escalate",
    chip: "border-escalate/30 bg-escalate/10 text-escalate hover:bg-escalate/15",
    tint: "bg-escalate/[0.07]",
  },
};
