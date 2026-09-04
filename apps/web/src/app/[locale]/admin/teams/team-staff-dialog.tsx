"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Loader2, Pencil, Plus, Trash2, User, Users } from "lucide-react";
import { TEAM_STAFF_ROLES } from "@dragons/shared";
import type { StaffPerson, TeamStaffMember, TeamStaffRole } from "@dragons/shared";
import type { TeamStaffCreateBody } from "@dragons/api-client";
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
import { portraitSrc } from "@/components/admin/staff/portrait-src";
import { StaffPersonDialog } from "@/components/admin/staff/staff-person-dialog";


/** The person's own fields, as the row shows them before the editor is opened. */
function toPerson(member: TeamStaffMember): StaffPerson {
  return {
    id: member.personId,
    firstName: member.firstName,
    lastName: member.lastName,
    phone: member.phone,
    email: member.email,
    licence: member.licence,
    photoUrl: member.photoUrl,
  };
}

interface StaffRowProps {
  member: TeamStaffMember;
  canManage: boolean;
  onSave: (staffId: number, patch: { role: TeamStaffRole; refereeContact: boolean }) => Promise<void>;
  onDelete: (staffId: number) => Promise<void>;
  onEditPerson: (person: StaffPerson) => void;
}

/**
 * One assignment: the person read-only, plus the two fields this team owns.
 * Editing the person opens the shared editor, because their phone number is
 * shared with every other team they train (ADR 0009).
 */
function StaffRow({ member, canManage, onSave, onDelete, onEditPerson }: StaffRowProps) {
  const t = useTranslations();
  const [role, setRole] = useState<TeamStaffRole>(member.role);
  const [refereeContact, setRefereeContact] = useState(member.refereeContact);
  const [busy, setBusy] = useState(false);
  const name = `${member.firstName} ${member.lastName}`.trim();
  const dirty = role !== member.role || refereeContact !== member.refereeContact;

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
      <div className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-base">
          {member.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={portraitSrc(member.photoUrl)}
              alt={t("teams.staff.portraitAlt", { name })}
              className="size-full object-cover"
            />
          ) : (
            <User className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {[member.phone, member.email, member.licence].filter(Boolean).join(" · ") ||
              t("teams.staff.noContactData")}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!canManage}
          aria-label={t("teams.staff.editPerson", { name })}
          onClick={() => onEditPerson(toPerson(member))}
        >
          <Pencil className="size-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`staff-${member.id}-role`}>{t("teams.staff.role")}</Label>
          <Select
            value={role}
            disabled={!canManage || busy}
            onValueChange={(value) => setRole(value as TeamStaffRole)}
          >
            <SelectTrigger id={`staff-${member.id}-role`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAM_STAFF_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`teams.staff.roles.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-3 pb-2">
          <Switch
            id={`staff-${member.id}-referee-contact`}
            checked={refereeContact}
            disabled={!canManage || busy}
            onCheckedChange={setRefereeContact}
          />
          <Label htmlFor={`staff-${member.id}-referee-contact`} className="font-normal">
            {t("teams.staff.refereeContact")}
          </Label>
        </div>
      </div>

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
          disabled={!canManage || busy || !dirty}
          onClick={() => void run(() => onSave(member.id, { role, refereeContact }))}
        >
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

interface AddStaffProps {
  attached: number[];
  onAdd: (body: TeamStaffCreateBody) => Promise<void>;
}

/** The new-person half of the add form: the person's own fields. */
type NewPerson = { firstName: string; lastName: string; phone: string; email: string; licence: string };

const EMPTY_PERSON: NewPerson = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  licence: "",
};

/**
 * Adding someone: pick from the people the club already knows, or fill in a new
 * person in the same step. Picking beats retyping — a coach entered twice is
 * exactly the duplication ADR 0009 removed — so the pool is the default and the
 * new-person form is the fallback.
 */
function AddStaff({ attached, onAdd }: AddStaffProps) {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<TeamStaffRole>("trainer");
  const [creating, setCreating] = useState(false);
  const [person, setPerson] = useState<NewPerson>(EMPTY_PERSON);
  const [busy, setBusy] = useState(false);

  const poolQ = queries.staffPeople(search);
  const { data: pool } = useSWR(creating ? null : poolQ.key, poolQ.fetcher);
  const candidates = (pool ?? []).filter((p) => !attached.includes(p.id));

  async function run(body: TeamStaffCreateBody) {
    setBusy(true);
    try {
      await onAdd(body);
      setPerson(EMPTY_PERSON);
      setSearch("");
    } finally {
      setBusy(false);
    }
  }

  /** `""` clears a contact field server-side; the contract maps it to null. */
  function addNewPerson() {
    return run({
      person: {
        firstName: person.firstName.trim(),
        lastName: person.lastName.trim(),
        phone: person.phone.trim(),
        email: person.email.trim(),
        licence: person.licence.trim(),
      },
      role,
    });
  }

  function personField(key: keyof NewPerson, maxLength: number, type?: string) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`staff-new-${key}`}>{t(`teams.staff.${key}`)}</Label>
        <Input
          id={`staff-new-${key}`}
          type={type}
          value={person[key]}
          maxLength={maxLength}
          disabled={busy}
          onChange={(e) => setPerson((prev) => ({ ...prev, [key]: e.target.value }))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md bg-surface-base p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("teams.staff.add")}
        </h3>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setCreating((prev) => !prev)}
        >
          {creating ? t("teams.staff.pickExisting") : t("teams.staff.newPerson")}
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="staff-add-role">{t("teams.staff.role")}</Label>
        <Select value={role} disabled={busy} onValueChange={(v) => setRole(v as TeamStaffRole)}>
          <SelectTrigger id="staff-add-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEAM_STAFF_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`teams.staff.roles.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {creating ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {personField("firstName", 100)}
            {personField("lastName", 100)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {personField("phone", 50, "tel")}
            {personField("email", 255, "email")}
          </div>
          {personField("licence", 100)}
          <p className="text-xs text-muted-foreground">{t("teams.staff.contactHint")}</p>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={
                busy || person.firstName.trim() === "" || person.lastName.trim() === ""
              }
              onClick={() => void addNewPerson()}
            >
              {busy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              {t("teams.staff.add")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder={t("staffPeople.searchPlaceholder")}
            aria-label={t("staffPeople.searchPlaceholder")}
            value={search}
            disabled={busy}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {pool === undefined ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("teams.staff.noCandidates")}</p>
            ) : (
              candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  disabled={busy}
                  className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  onClick={() => void run({ personId: candidate.id, role })}
                >
                  <span className="font-medium">
                    {candidate.lastName}, {candidate.firstName}
                  </span>
                  {candidate.assignments.length > 0 ? (
                    <span className="ml-2 text-muted-foreground">
                      {candidate.assignments.map((a) => a.teamName).join(", ")}
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}
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
  const [editingPerson, setEditingPerson] = useState<StaffPerson | null>(null);

  async function add(body: TeamStaffCreateBody) {
    await api.teamStaff.create(entryId, body);
    await mutate();
  }

  async function save(
    staffId: number,
    patch: { role: TeamStaffRole; refereeContact: boolean },
  ) {
    await api.teamStaff.update(entryId, staffId, patch);
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
                onEditPerson={setEditingPerson}
              />
            ))
          )}

          {canManage ? (
            <AddStaff attached={(staff ?? []).map((m) => m.personId)} onAdd={add} />
          ) : null}
        </div>

        {editingPerson ? (
          <StaffPersonDialog
            key={editingPerson.id}
            person={editingPerson}
            open
            onOpenChange={(next) => {
              if (!next) setEditingPerson(null);
            }}
            onSaved={async () => {
              await mutate();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
