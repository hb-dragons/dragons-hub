"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, User } from "lucide-react";
import type { StaffPerson, StaffPersonWithAssignments } from "@dragons/shared";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { APIError } from "@dragons/api-client";
import { api } from "@/lib/api";
import { portraitSrc } from "./portrait-src";
import { queries } from "@/lib/swr-queries";
import { StaffPersonDialog } from "./staff-person-dialog";


/**
 * The pool of staff people (ADR 0009): every human the club holds staff data
 * on, with the teams each holds this season. This is where a phone number or a
 * portrait is corrected once for every team, and where a person nobody is
 * attached to any more is dropped.
 */
export function StaffPeopleList({ canManage }: { canManage: boolean }) {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const peopleQ = queries.staffPeople(search);
  const { data: people, mutate } = useSWR(peopleQ.key, peopleQ.fetcher);
  const [editing, setEditing] = useState<StaffPerson | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function edit(person: StaffPerson | null) {
    setEditing(person);
    setDialogOpen(true);
  }

  async function remove(person: StaffPersonWithAssignments) {
    try {
      await api.staffPeople.remove(person.id);
      await mutate();
    } catch (error) {
      // 409 is the API refusing to orphan a team's contact — a state the admin
      // can act on, and worth saying so. Anything else is a failure they can
      // only retry, so it must not claim a reason it does not know.
      toast.error(
        error instanceof APIError && error.status === 409
          ? t("staffPeople.deleteBlocked")
          : t("staffPeople.deleteFailed"),
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          className="max-w-xs"
          placeholder={t("staffPeople.searchPlaceholder")}
          aria-label={t("staffPeople.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {canManage ? (
          <Button type="button" size="sm" onClick={() => edit(null)}>
            <Plus className="mr-2 size-4" />
            {t("staffPeople.add")}
          </Button>
        ) : null}
      </div>

      {people === undefined ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : people.length === 0 ? (
        <p className="text-muted-foreground">{t("staffPeople.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {people.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-3 rounded-md bg-surface-low p-3"
            >
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-base">
                {person.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={portraitSrc(person.photoUrl)}
                    alt={t("teams.staff.portraitAlt", {
                      name: `${person.firstName} ${person.lastName}`,
                    })}
                    className="size-full object-cover"
                  />
                ) : (
                  <User className="size-5 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {person.lastName}, {person.firstName}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {person.assignments.length === 0
                    ? t("staffPeople.noTeams")
                    : person.assignments
                        .map((a) => `${a.teamName} (${t(`teams.staff.roles.${a.role}`)})`)
                        .join(", ")}
                </p>
              </div>
              {canManage ? (
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={t("staffPeople.editPerson", {
                      name: `${person.firstName} ${person.lastName}`,
                    })}
                    onClick={() => edit(person)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={t("staffPeople.deletePerson", {
                      name: `${person.firstName} ${person.lastName}`,
                    })}
                    onClick={() => void remove(person)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <StaffPersonDialog
        key={editing?.id ?? "new"}
        person={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={async () => {
          await mutate();
        }}
      />
    </div>
  );
}
