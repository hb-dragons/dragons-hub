"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import useSWR from "swr"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import { fetchAPI } from "@/lib/api"

import { Button } from "@dragons/ui/components/button"
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
import type { RefereeListItem, PaginatedResponse } from "@dragons/shared"

interface LinkRefereeDialogProps {
  user: UserListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onLinked: () => void
}

async function fetchReferees(search: string): Promise<RefereeListItem[]> {
  const params = new URLSearchParams({ limit: "20", offset: "0" })
  if (search) params.set("search", search)
  const result = await fetchAPI<PaginatedResponse<RefereeListItem>>(
    `/admin/referees?${params}`,
  )
  return result.items
}

export function LinkRefereeDialog({
  user,
  open,
  onOpenChange,
  onLinked,
}: LinkRefereeDialogProps) {
  const t = useTranslations()
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<RefereeListItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { data: referees, isLoading } = useSWR(
    open ? ["referees-search", search] : null,
    () => fetchReferees(search),
  )

  useEffect(() => {
    if (!open) {
      setSearch("")
      setSelected(null)
    }
  }, [open])

  async function handleLink() {
    if (!user || !selected) return
    setSubmitting(true)
    try {
      // Set role to referee
      const { error } = await authClient.admin.setRole({
        userId: user.id,
        role: "referee" as "admin" | "user",
      })
      if (error) {
        toast.error(t("users.toast.roleChangeFailed"))
        return
      }

      // Link referee record
      await fetchAPI(`/admin/users/${user.id}/referee-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refereeId: selected.id }),
      })

      toast.success(t("users.toast.refereeLinked"))
      onOpenChange(false)
      onLinked()
    } catch {
      toast.error(t("users.toast.refereeLinkFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("users.linkRefereeDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("users.linkRefereeDialog.description", {
              name: user?.name ?? "",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder={t("users.linkRefereeDialog.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-60 overflow-y-auto rounded-md border">
            {isLoading && (
              <p className="p-3 text-sm text-muted-foreground">
                {t("common.loading")}
              </p>
            )}
            {referees?.length === 0 && !isLoading && (
              <p className="p-3 text-sm text-muted-foreground">
                {t("users.linkRefereeDialog.noResults")}
              </p>
            )}
            {referees?.map((ref) => (
              <button
                key={ref.id}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${
                  selected?.id === ref.id ? "bg-accent" : ""
                }`}
                onClick={() => setSelected(ref)}
              >
                <span className="font-medium">
                  {ref.lastName}, {ref.firstName}
                </span>
                {ref.licenseNumber && (
                  <span className="ml-2 text-muted-foreground">
                    #{ref.licenseNumber}
                  </span>
                )}
              </button>
            ))}
          </div>
          {selected && (
            <p className="text-sm">
              {t("users.linkRefereeDialog.selected")}:{" "}
              <strong>
                {selected.lastName}, {selected.firstName}
              </strong>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleLink} disabled={!selected || submitting}>
            {submitting
              ? t("users.linkRefereeDialog.linking")
              : t("users.linkRefereeDialog.link")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
