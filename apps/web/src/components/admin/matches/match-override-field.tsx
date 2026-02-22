"use client";

import { Controller, type Control, type FieldPath } from "react-hook-form";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import { Switch } from "@dragons/ui/components/switch";
import { Button } from "@dragons/ui/components/button";
import { DatePicker } from "@dragons/ui/components/date-picker";
import { TimePicker } from "@dragons/ui/components/time-picker";
import { X, RotateCcw } from "lucide-react";
import { DiffIndicator } from "./diff-indicator";
import type { DiffStatus, MatchFormValues } from "./types";

interface MatchOverrideFieldProps {
  control: Control<MatchFormValues>;
  name: FieldPath<MatchFormValues>;
  label: string;
  remoteValue: string | null;
  diffStatus?: DiffStatus;
  inputType: "date" | "time" | "text" | "boolean";
  isOverridden?: boolean;
  onRelease?: () => void;
}

export function MatchOverrideField({
  control,
  name,
  label,
  remoteValue,
  diffStatus,
  inputType,
  isOverridden,
  onRelease,
}: MatchOverrideFieldProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const hasValue = field.value != null && field.value !== "";

        return (
          <div className="grid grid-cols-[150px_1fr_1fr_auto_auto] items-center gap-4">
            <Label className="text-sm font-medium">{label}</Label>

            <div className="text-sm text-muted-foreground">
              {remoteValue ?? <span className="italic">—</span>}
            </div>

            <div>
              {inputType === "boolean" ? (
                <Switch
                  checked={field.value === true}
                  onCheckedChange={(checked) => field.onChange(checked)}
                />
              ) : inputType === "date" ? (
                <DatePicker
                  value={typeof field.value === "string" ? field.value : null}
                  onChange={(v) => field.onChange(v)}
                  className="h-8"
                />
              ) : inputType === "time" ? (
                <TimePicker
                  value={typeof field.value === "string" ? field.value : null}
                  onChange={(v) => field.onChange(v)}
                  className="h-8"
                />
              ) : (
                <Input
                  type={inputType}
                  value={
                    field.value == null
                      ? ""
                      : typeof field.value === "boolean"
                        ? ""
                        : field.value
                  }
                  onChange={(e) => field.onChange(e.target.value || null)}
                  onBlur={field.onBlur}
                  className="h-8"
                />
              )}
            </div>

            <div className="w-20">
              {diffStatus && <DiffIndicator status={diffStatus} />}
            </div>

            <div className="flex w-16 gap-1">
              {hasValue && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground"
                  onClick={() => field.onChange(null)}
                  title="Clear override"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
              {isOverridden && onRelease && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground"
                  onClick={onRelease}
                  title="Release override (restore remote value)"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        );
      }}
    />
  );
}
