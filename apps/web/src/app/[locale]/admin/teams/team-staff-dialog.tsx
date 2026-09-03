"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { ImagePlus, Loader2, Plus, Trash2, User, Users } from "lucide-react";
import { TEAM_STAFF_ROLES } from "@dragons/shared";
import type { TeamStaffMember, TeamStaffRole } from "@dragons/shared";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import { Switch } from "@dragons/ui/components/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@dragons/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { queries } from "@/lib/swr-queries";
import { api } from "@/lib/api";

/** The editable half of a staff member — everything but the identity and the portrait. */
interface StaffDraft {
  firstName: string;
  lastName: string;
  role: TeamStaffRole;
  phone: string;
  email: string;
  licence: string;
  refereeContact: boolean;
}

/** The three types the upload endpoint stores; anything else is a 400. */
const ACCEPTED_PORTRAIT_TYPES = "image/png,image/jpeg,image/webp";

const EMPTY_DRAFT: StaffDraft = {
  firstName: "",
  lastName: "",
  role: "trainer",
  phone: "",
  email: "",
  licence: "",
  refereeContact: false,
};

function toDraft(member: TeamStaffMember): StaffDraft {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    role: member.role,
    phone: member.phone ?? "",
    email: member.email ?? "",
    licence: member.licence ?? "",
    refereeContact: member.refereeContact,
  };
}

function isComplete(draft: StaffDraft): boolean {
  return draft.firstName.trim() !== "" && draft.lastName.trim() !== "";
}

interface StaffFieldsProps {
  idPrefix: string;
  draft: StaffDraft;
  disabled: boolean;
  onChange: (patch: Partial<StaffDraft>) => void;
}

/** The shared field set, used unchanged by the add form and by each existing row. */
function StaffFields({ idPrefix, draft, disabled, onChange }: StaffFieldsProps) {
  const t = useTranslations();

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-first-name`}>{t("teams.staff.firstName")}</Label>
          <Input
            id={`${idPrefix}-first-name`}
            value={draft.firstName}
            maxLength={100}
            disabled={disabled}
            onChange={(e) => onChange({ firstName: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-last-name`}>{t("teams.staff.lastName")}</Label>
          <Input
            id={`${idPrefix}-last-name`}
            value={draft.lastName}
            maxLength={100}
            disabled={disabled}
            onChange={(e) => onChange({ lastName: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-role`}>{t("teams.staff.role")}</Label>
          <Select
            value={draft.role}
            disabled={disabled}
            onValueChange={(value) => onChange({ role: value as TeamStaffRole })}
          >
            <SelectTrigger id={`${idPrefix}-role`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAM_STAFF_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {t(`teams.staff.roles.${role}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-licence`}>{t("teams.staff.licence")}</Label>
          <Input
            id={`${idPrefix}-licence`}
            value={draft.licence}
            maxLength={100}
            disabled={disabled}
            onChange={(e) => onChange({ licence: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-phone`}>{t("teams.staff.phone")}</Label>
          <Input
            id={`${idPrefix}-phone`}
            type="tel"
            value={draft.phone}
            maxLength={50}
            disabled={disabled}
            onChange={(e) => onChange({ phone: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-email`}>{t("teams.staff.email")}</Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            value={draft.email}
            maxLength={255}
            disabled={disabled}
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id={`${idPrefix}-referee-contact`}
          checked={draft.refereeContact}
          disabled={disabled}
          onCheckedChange={(checked) => onChange({ refereeContact: checked })}
        />
        <Label htmlFor={`${idPrefix}-referee-contact`} className="font-normal">
          {t("teams.staff.refereeContact")}
        </Label>
      </div>
    </div>
  );
}

/**
 * The portrait, and the control that replaces it. `photoUrl` is a path relative
 * to the API, so it is prefixed here the way the social wizard prefixes its own
 * image endpoints.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface StaffPortraitProps {
  member: TeamStaffMember;
  canManage: boolean;
  onUpload: (file: File) => Promise<void>;
}

function StaffPortrait({ member, canManage, onUpload }: StaffPortraitProps) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = `${member.firstName} ${member.lastName}`.trim();

  async function pick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setFailed(false);
    try {
      await onUpload(file);
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
        {member.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${API_BASE}${member.photoUrl}`}
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
          disabled={!canManage || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-2 size-4" />
          )}
          {member.photoUrl ? t("teams.staff.portraitReplace") : t("teams.staff.portraitUpload")}
        </Button>
        {failed ? (
          <p className="text-xs text-destructive">{t("teams.staff.portraitFailed")}</p>
        ) : null}
      </div>
    </div>
  );
}

interface StaffRowProps {
  member: TeamStaffMember;
  canManage: boolean;
  onSave: (staffId: number, draft: StaffDraft) => Promise<void>;
  onDelete: (staffId: number) => Promise<void>;
  onUploadPhoto: (staffId: number, file: File) => Promise<void>;
}

function StaffRow({ member, canManage, onSave, onDelete, onUploadPhoto }: StaffRowProps) {
  const t = useTranslations();
  // Recomputed from the prop each render, so a row settles back to "clean" as
  // soon as the refreshed list arrives — no remount trick needed to reset it.
  const saved = toDraft(member);
  const [draft, setDraft] = useState<StaffDraft>(saved);
  const [busy, setBusy] = useState(false);
  const dirty = (Object.keys(saved) as (keyof StaffDraft)[]).some(
    (key) => draft[key] !== saved[key],
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md bg-surface-low p-4">
      <StaffPortrait
        member={member}
        canManage={canManage}
        onUpload={(file) => onUploadPhoto(member.id, file)}
      />
      <StaffFields
        idPrefix={`staff-${member.id}`}
        draft={draft}
        disabled={!canManage || busy}
        onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!canManage || busy}
          onClick={() => void run(() => onDelete(member.id))}
        >
          <Trash2 className="mr-2 size-4" />
          {t("teams.staff.remove")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canManage || busy || !dirty || !isComplete(draft)}
          onClick={() => void run(() => onSave(member.id, draft))}
        >
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

export interface TeamStaffDialogProps {
  entryId: number;
  teamName: string;
  canManage: boolean;
}

export function TeamStaffDialog({ entryId, teamName, canManage }: TeamStaffDialogProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const staffQ = queries.teamStaff(entryId);
  // Fetch only while the dialog is open — the teams page has one of these per
  // row, and eagerly listing staff for every team would be a request per team
  // on a page whose main job is the table.
  const { data: staff, mutate } = useSWR(open ? staffQ.key : null, staffQ.fetcher);
  const [addDraft, setAddDraft] = useState<StaffDraft>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);

  /** `""` clears a contact field server-side; the contract maps it to null. */
  function contactFields(draft: StaffDraft) {
    return {
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      licence: draft.licence.trim(),
      refereeContact: draft.refereeContact,
    };
  }

  async function add() {
    setAdding(true);
    try {
      await api.teamStaff.create(entryId, {
        firstName: addDraft.firstName.trim(),
        lastName: addDraft.lastName.trim(),
        role: addDraft.role,
        ...contactFields(addDraft),
      });
      setAddDraft(EMPTY_DRAFT);
      await mutate();
    } finally {
      setAdding(false);
    }
  }

  async function save(staffId: number, draft: StaffDraft) {
    await api.teamStaff.update(entryId, staffId, {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      role: draft.role,
      ...contactFields(draft),
    });
    await mutate();
  }

  async function uploadPhoto(staffId: number, file: File) {
    await api.teamStaff.uploadPhoto(entryId, staffId, file);
    await mutate();
  }

  async function remove(staffId: number) {
    await api.teamStaff.remove(entryId, staffId);
    await mutate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Users className="mr-2 size-4" />
          {t("teams.staff.open")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("teams.staff.title")}</DialogTitle>
          <DialogDescription>{t("teams.staff.subtitle", { team: teamName })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {staff === undefined ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : staff.length === 0 ? (
            <p className="text-muted-foreground">{t("teams.staff.empty")}</p>
          ) : (
            staff.map((member) => (
              <StaffRow
                key={member.id}
                member={member}
                canManage={canManage}
                onSave={save}
                onDelete={remove}
                onUploadPhoto={uploadPhoto}
              />
            ))
          )}

          {canManage ? (
            <div className="space-y-3 rounded-md bg-surface-base p-4">
              <h3 className="font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("teams.staff.add")}
              </h3>
              <StaffFields
                idPrefix="staff-new"
                draft={addDraft}
                disabled={adding}
                onChange={(patch) => setAddDraft((prev) => ({ ...prev, ...patch }))}
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={adding || !isComplete(addDraft)}
                  onClick={() => void add()}
                >
                  {adding ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 size-4" />
                  )}
                  {t("teams.staff.add")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
