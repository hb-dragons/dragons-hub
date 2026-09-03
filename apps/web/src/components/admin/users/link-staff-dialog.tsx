"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import useSWR from "swr"
import { toast } from "sonner"
import { api } from "@/lib/api"

import { Button } from "@dragons/ui/components/button"
import { Checkbox } from "@dragons/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dragons/ui/components/dialog"

import type { UserListItem } from "./types"
import type { OwnClubTeam, TeamStaffMember } from "@dragons/shared"

interface LinkStaffDialogProps {
  user: UserListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onLinked: () => void
}

/**
 * Links a user account to a `team_staff` record, optionally granting the
 * read-only `coach` role in the same request.
 *
 * Staff belong to a team entry and have no cross-team listing endpoint, so the
 * picker is a team list feeding the per-entry staff list, rather than the flat
 * search the referee dialog uses. Picking the team first also keeps two coaches
 * with the same name apart.
 */
export function LinkStaffDialog({
  user,
  open,
  onOpenChange,
  onLinked,
}: LinkStaffDialogProps) {
  const t = useTranslations()
  const [teamId, setTeamId] = useState<number | null>(null)
  const [selected, setSelected] = useState<TeamStaffMember | null>(null)
  const [grantCoachRole, setGrantCoachRole] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const { data: teams, isLoading: teamsLoading } = useSWR<OwnClubTeam[]>(
    open ? "link-staff-teams" : null,
    () => api.teams.list(),
  )
  const { data: staff, isLoading: staffLoading } = useSWR<TeamStaffMember[]>(
    open && teamId !== null ? ["link-staff-members", teamId] : null,
    () => api.teamStaff.list(teamId as number),
  )

  useEffect(() => {
    if (!open) {
      setTeamId(null)
      setSelected(null)
      setGrantCoachRole(true)
    }
  }, [open])

  function selectTeam(id: number) {
    setTeamId(id)
    setSelected(null)
  }

  async function handleLink() {
    if (!user || !selected) return
    setSubmitting(true)
    try {
      await api.users.linkStaff(user.id, { staffId: selected.id, grantCoachRole })
      toast.success(t("users.toast.staffLinked"))
      onOpenChange(false)
      onLinked()
    } catch {
      toast.error(t("users.toast.staffLinkFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("users.linkStaffDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("users.linkStaffDialog.description", { name: user?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm font-medium">
              {t("users.linkStaffDialog.teamLabel")}
            </p>
            <div className="max-h-40 overflow-y-auto rounded-md border">
              {teamsLoading && (
                <p className="p-3 text-sm text-muted-foreground">
                  {t("common.loading")}
                </p>
              )}
              {teams?.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  aria-pressed={teamId === team.id}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    teamId === team.id ? "bg-accent" : ""
                  }`}
                  onClick={() => selectTeam(team.id)}
                >
                  {team.customName ?? team.name}
                </button>
              ))}
            </div>
          </div>

          {teamId !== null && (
            <div className="max-h-48 overflow-y-auto rounded-md border">
              {staffLoading && (
                <p className="p-3 text-sm text-muted-foreground">
                  {t("common.loading")}
                </p>
              )}
              {staff?.length === 0 && !staffLoading && (
                <p className="p-3 text-sm text-muted-foreground">
                  {t("users.linkStaffDialog.noResults")}
                </p>
              )}
              {staff?.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  aria-pressed={selected?.id === member.id}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    selected?.id === member.id ? "bg-accent" : ""
                  }`}
                  onClick={() => setSelected(member)}
                >
                  <span className="font-medium">
                    {member.lastName}, {member.firstName}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {t(`teams.staff.roles.${member.role}`)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
            <Checkbox
              checked={grantCoachRole}
              onCheckedChange={(checked) => setGrantCoachRole(checked === true)}
            />
            <span className="text-sm">
              {t("users.linkStaffDialog.grantCoachRole")}
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => {
              void handleLink()
            }}
            disabled={!selected || submitting}
          >
            {submitting
              ? t("users.linkStaffDialog.linking")
              : t("users.linkStaffDialog.link")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
