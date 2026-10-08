"use client";

// PROTOTYPE — three layouts for the open-games tab ("Offene Spiele"), switchable via
// `?variant=` on the existing /admin/referees route, plus the current layout
// for comparison. Question: which structure makes staffing open slots fastest?
// Opt-in: without `?variant=` the tab renders exactly as before, which is what
// lets this sit on production while the layouts are compared.

import { PrototypeSwitcher, usePrototypeVariant } from "@/components/prototype-switcher";
import { OpenSlotsTab } from "../open-slots-tab";
import { PROTOTYPE_READ_ONLY } from "./shared";
import { VariantAgenda } from "./variant-a-agenda";
import { VariantTriage } from "./variant-b-triage";
import { VariantBoard } from "./variant-c-board";

const VARIANTS = [
  { key: "A", name: "Agenda + Sheet" },
  { key: "B", name: "Triage" },
  { key: "C", name: "Wochenend-Board" },
  { key: "current", name: "Aktuell" },
] as const;

export function OpenSlotsPrototype() {
  const variant = usePrototypeVariant(VARIANTS);
  if (variant === null) return <OpenSlotsTab />;
  return (
    <>
      {PROTOTYPE_READ_ONLY && variant !== "current" && (
        <p className="bg-surface-low text-muted-foreground mb-3 rounded-md px-3 py-2 text-sm">
          Layout-Prototyp mit echten Daten, nur zur Ansicht: Zuweisen und Entfernen sind hier gesperrt.
          Besetzen weiterhin im aktuellen Layout (ohne <code>?variant=</code>).
        </p>
      )}
      {variant === "A" && <VariantAgenda />}
      {variant === "B" && <VariantTriage />}
      {variant === "C" && <VariantBoard />}
      {variant === "current" && <OpenSlotsTab />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </>
  );
}
