"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, Loader2, User } from "lucide-react";
import type { StaffPerson } from "@dragons/shared";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dragons/ui/components/dialog";
import { api } from "@/lib/api";
import { portraitSrc } from "./portrait-src";

/**
 * The editor for one staff person (ADR 0009). Everything here belongs to the
 * human — name, contact data, licence, portrait — so a correction reaches every
 * team they train. Role and the referee-contact flag are per team and are
 * edited on the team's staff dialog instead.
 *
 * `person === null` opens it as a create form; the portrait control appears
 * only once the person exists, since the upload needs an id to attach to.
 */
export interface StaffPersonDialogProps {
  person: StaffPerson | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save so the caller can refresh its list. */
  onSaved: (person: StaffPerson) => void | Promise<void>;
}

interface PersonDraft {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  licence: string;
}

/** The three types the upload endpoint stores; anything else is a 400. */
const ACCEPTED_PORTRAIT_TYPES = "image/png,image/jpeg,image/webp";


function toDraft(person: StaffPerson | null): PersonDraft {
  return {
    firstName: person?.firstName ?? "",
    lastName: person?.lastName ?? "",
    phone: person?.phone ?? "",
    email: person?.email ?? "",
    licence: person?.licence ?? "",
  };
}

export function StaffPersonDialog({
  person,
  open,
  onOpenChange,
  onSaved,
}: StaffPersonDialogProps) {
  const t = useTranslations();
  // Keyed on the person id below, so the draft is rebuilt whenever the dialog
  // is pointed at someone else rather than kept in sync by an effect.
  const [draft, setDraft] = useState<PersonDraft>(() => toDraft(person));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const complete = draft.firstName.trim() !== "" && draft.lastName.trim() !== "";

  /** `""` clears a contact field server-side; the contract maps it to null. */
  function body() {
    return {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      licence: draft.licence.trim(),
    };
  }

  async function save() {
    setSaving(true);
    setFailed(false);
    try {
      const saved =
        person === null
          ? await api.staffPeople.create(body())
          : await api.staffPeople.update(person.id, body());
      await onSaved(saved);
      onOpenChange(false);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  function field(key: keyof PersonDraft, maxLength: number, type?: string) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`person-${key}`}>{t(`teams.staff.${key}`)}</Label>
        <Input
          id={`person-${key}`}
          type={type}
          value={draft[key]}
          maxLength={maxLength}
          disabled={saving}
          onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
        />
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {person === null ? t("staffPeople.createTitle") : t("staffPeople.editTitle")}
          </DialogTitle>
          <DialogDescription>{t("staffPeople.dialogSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {person !== null ? (
            <StaffPortrait person={person} onUploaded={onSaved} />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {field("firstName", 100)}
            {field("lastName", 100)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("phone", 50, "tel")}
            {field("email", 255, "email")}
          </div>
          {field("licence", 100)}
          {failed ? (
            <p className="text-xs text-destructive">{t("staffPeople.saveFailed")}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={saving || !complete} onClick={() => void save()}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface StaffPortraitProps {
  person: StaffPerson;
  onUploaded: (person: StaffPerson) => void | Promise<void>;
}

/**
 * The portrait, and the control that replaces it. One object per person, so
 * this photo is what every team page shows.
 */
function StaffPortrait({ person, onUploaded }: StaffPortraitProps) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = `${person.firstName} ${person.lastName}`.trim();

  async function pick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setFailed(false);
    try {
      await onUploaded(await api.staffPeople.uploadPhoto(person.id, file));
    } catch {
      setFailed(true);
    } finally {
      setUploading(false);
      // Clear the input so re-picking the same file fires `change` again.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-base">
        {person.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portraitSrc(person.photoUrl)}
            alt={t("teams.staff.portraitAlt", { name })}
            className="size-full object-cover"
          />
        ) : (
          <User className="size-7 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="space-y-1">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_PORTRAIT_TYPES}
          aria-label={t("teams.staff.portrait")}
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-2 size-4" />
          )}
          {person.photoUrl
            ? t("teams.staff.portraitReplace")
            : t("teams.staff.portraitUpload")}
        </Button>
        {failed ? (
          <p className="text-xs text-destructive">{t("teams.staff.portraitFailed")}</p>
        ) : null}
      </div>
    </div>
  );
}
