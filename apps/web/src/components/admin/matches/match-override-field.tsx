"use client";

import { Controller, type Control, type FieldPath } from "react-hook-form";
import { Input } from "@dragons/ui/components/input";
import { Switch } from "@dragons/ui/components/switch";
import { Button } from "@dragons/ui/components/button";
import { DatePicker } from "@dragons/ui/components/date-picker";
import { TimePicker } from "@dragons/ui/components/time-picker";
import { RotateCcw } from "lucide-react";
import { DiffIndicator } from "./diff-indicator";
import {
  Field,
  FieldLabel,
  FieldError,
} from "@dragons/ui/components/field";
import type { DiffStatus, MatchFormValues } from "./types";
import { matchStrings } from "./match-strings";

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
      render={({ field, fieldState }) => {
        const isDiverged = diffStatus === "diverged";

        return (
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel>{label}</FieldLabel>
              <div className="flex items-center gap-2">
                {diffStatus && <DiffIndicator status={diffStatus} />}
                {isOverridden && onRelease && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground"
                    onClick={onRelease}
                    title="Release override (restore remote value)"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    {matchStrings.resetOverride}
                  </Button>
                )}
              </div>
            </div>

            <div
              className={
                isDiverged
                  ? "rounded-md border-l-4 border-l-amber-500 pl-3"
                  : undefined
              }
            >
              {inputType === "boolean" ? (
                <Switch
                  checked={field.value === true}
                  onCheckedChange={(checked) => field.onChange(checked)}
                />
              ) : inputType === "date" ? (
                <DatePicker
                  value={typeof field.value === "string" ? field.value : null}
                  onChange={(v) => field.onChange(v)}
                  className="h-9"
                />
              ) : inputType === "time" ? (
                <TimePicker
                  value={typeof field.value === "string" ? field.value : null}
                  onChange={(v) => field.onChange(v)}
                  className="h-9"
                />
              ) : (
                <Input
                  value={
                    field.value == null
                      ? ""
                      : typeof field.value === "boolean"
                        ? ""
                        : field.value
                  }
                  onChange={(e) => field.onChange(e.target.value || null)}
                  onBlur={field.onBlur}
                  className="h-9"
                />
              )}

              <p className="mt-1 text-xs text-muted-foreground">
                {matchStrings.officialLabel}: {remoteValue ?? "—"}
              </p>
            </div>

            <FieldError>{fieldState.error?.message}</FieldError>
          </Field>
        );
      }}
    />
  );
}
