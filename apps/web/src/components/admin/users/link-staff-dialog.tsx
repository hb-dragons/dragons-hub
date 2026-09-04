"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import useSWR from "swr"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { queries } from "@/lib/swr-queries"

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
import { Input } from "@dragons/ui/components/input"

import type { UserListItem } from "./types"
import type { StaffPersonWithAssignments } from "@dragons/shared"

interface LinkStaffDialogProps {
  user: UserListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onLinked: () => void
}

/**
 * Links a user account to a staff person, optionally granting the read-only
 * `coach` role in the same request.
 *
 * The link is to the person, not to one team's assignment (ADR 0009), so this
 * is the flat search the referee dialog uses rather than a team-then-member
 * drill-down. Each row lists the person's teams this season, which is what
 * tells two coaches of the same name apart.
 */
export function LinkStaffDialog({
  user,
  open,
  onOpenChange,
  onLinked,
}: LinkStaffDialogProps) {
  const t = useTranslations()
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<StaffPersonWithAssignments | null>(null)
  const [grantCoachRole, setGrantCoachRole] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // The pool's shared SWR key, so an edit made on the staff page revalidates
  // this list too rather than leaving a second, stale cache entry behind.
  const poolQ = queries.staffPeople(search)
  const { data: people, isLoading } = useSWR(open ? poolQ.key : null, poolQ.fetcher)

  useEffect(() => {
    if (!open) {
      setSearch("")
      setSelected(null)
      setGrantCoachRole(true)
    }
  }, [open])

  async function handleLink() {
    if (!user || !selected) return
    setSubmitting(true)
    try {
      await api.users.linkStaff(user.id, { personId: selected.id, grantCoachRole })
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
          <Input
            placeholder={t("users.linkStaffDialog.searchPlaceholder")}
            aria-label={t("users.linkStaffDialog.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="max-h-56 space-y-1 overflow-y-auto rounded-md bg-surface-low p-1">
            {isLoading && (
              <p className="p-3 text-sm text-muted-foreground">{t("common.loading")}</p>
            )}
            {people?.length === 0 && !isLoading && (
              <p className="p-3 text-sm text-muted-foreground">
                {t("users.linkStaffDialog.noResults")}
              </p>
            )}
            {people?.map((person) => (
              <button
                key={person.id}
                type="button"
                aria-pressed={selected?.id === person.id}
                className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                  selected?.id === person.id ? "bg-accent" : ""
                }`}
                onClick={() => setSelected(person)}
              >
                <span className="font-medium">
                  {person.lastName}, {person.firstName}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {person.assignments.length === 0
                    ? t("users.linkStaffDialog.noTeams")
                    : person.assignments.map((a) => a.teamName).join(", ")}
                </span>
              </button>
            ))}
          </div>

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
