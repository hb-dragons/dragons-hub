"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import { parseRoles, ROLE_NAMES, type RoleName } from "@dragons/shared"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dragons/ui/components/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@dragons/ui/components/alert-dialog"

import { fetchAPI } from "@/lib/api"

import { EditUserDialog } from "./edit-user-dialog"
import { BanUserDialog } from "./ban-user-dialog"
import { SetPasswordDialog } from "./set-password-dialog"
import { LinkRefereeDialog } from "./link-referee-dialog"
import type { UserListItem } from "./types"

interface UserActionsProps {
  user: UserListItem
  currentUserId: string
  onMutated: () => void
}

export function UserActions({
  user,
  currentUserId,
  onMutated,
}: UserActionsProps) {
  const t = useTranslations()

  const [editOpen, setEditOpen] = useState(false)
  const [banOpen, setBanOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [unbanOpen, setUnbanOpen] = useState(false)
  const [rolesOpen, setRolesOpen] = useState(false)
  const [linkRefereeOpen, setLinkRefereeOpen] = useState(false)
  const [selectedRoles, setSelectedRoles] = useState<RoleName[]>(() =>
    parseRoles(user.role),
  )
  const [savingRoles, setSavingRoles] = useState(false)

  const isSelf = user.id === currentUserId
  const isBanned = user.banned === true

  // Reset selection whenever the dialog opens or the user's role string changes.
  useEffect(() => {
    if (rolesOpen) {
      setSelectedRoles(parseRoles(user.role))
    }
  }, [rolesOpen, user.role])

  function toggleRole(role: RoleName) {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    )
  }

  async function handleDelete() {
    try {
      const { error } = await authClient.admin.removeUser({
        userId: user.id,
      })
      if (error) {
        toast.error(t("users.toast.deleteFailed"))
        return
      }
      toast.success(t("users.toast.deleted"))
      onMutated()
    } catch {
      toast.error(t("users.toast.deleteFailed"))
    }
  }

  async function handleUnban() {
    try {
      const { error } = await authClient.admin.unbanUser({
        userId: user.id,
      })
      if (error) {
        toast.error(t("users.toast.unbanFailed"))
        return
      }
      toast.success(t("users.toast.unbanned"))
      onMutated()
    } catch {
      toast.error(t("users.toast.unbanFailed"))
    }
  }

  async function handleSaveRoles() {
    setSavingRoles(true)
    try {
      // Better-auth stores multi-role assignments as a comma-separated string in
      // the `user.role` column. The client-side `setRole` type narrows `role` to
      // a single union member, but the server accepts the comma-joined form, so
      // we force-cast through `never` to pass the concatenated list through.
      const roleValue = selectedRoles.length === 0 ? "" : selectedRoles.join(",")
      const { error } = await authClient.admin.setRole({
        userId: user.id,
        role: roleValue as never,
      })
      if (error) {
        toast.error(t("users.toast.roleChangeFailed"))
        return
      }
      toast.success(t("users.toast.roleChanged"))
      setRolesOpen(false)
      onMutated()
    } catch {
      toast.error(t("users.toast.roleChangeFailed"))
    } finally {
      setSavingRoles(false)
    }
  }

  async function handleRemoveReferee() {
    try {
      // Referee status is identity-based (refereeId FK). Unlinking only needs
      // to clear the FK; no role assignment is involved.
      await fetchAPI(`/admin/users/${user.id}/referee-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refereeId: null }),
      })
      toast.success(t("users.toast.roleChanged"))
      onMutated()
    } catch {
      toast.error(t("users.toast.refereeLinkFailed"))
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            {t("users.actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
            {t("users.actions.setPassword")}
          </DropdownMenuItem>
          {!isSelf && (
            <DropdownMenuItem onSelect={() => setRolesOpen(true)}>
              {t("users.actions.editRoles")}
            </DropdownMenuItem>
          )}
          {!isSelf && user.role !== "referee" && (
            <DropdownMenuItem onSelect={() => setLinkRefereeOpen(true)}>
              {t("users.actions.makeReferee")}
            </DropdownMenuItem>
          )}
          {!isSelf && user.role === "referee" && (
            <DropdownMenuItem onSelect={handleRemoveReferee}>
              {t("users.actions.removeReferee")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {!isSelf && (
            <>
              {isBanned ? (
                <DropdownMenuItem onSelect={() => setUnbanOpen(true)}>
                  {t("users.actions.unban")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setBanOpen(true)}>
                  {t("users.actions.ban")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                {t("users.actions.delete")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditUserDialog
        user={user}
        open={editOpen}
        onOpenChange={setEditOpen}
        onUpdated={onMutated}
      />

      <BanUserDialog
        user={user}
        open={banOpen}
        onOpenChange={setBanOpen}
        onBanned={onMutated}
      />

      <SetPasswordDialog
        user={user}
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("users.deleteConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("users.deleteConfirm.description", { name: user.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t("users.deleteConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={unbanOpen} onOpenChange={setUnbanOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("users.unbanConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("users.unbanConfirm.description", { name: user.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnban}>
              {t("users.unbanConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={rolesOpen} onOpenChange={setRolesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("users.editRolesDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("users.editRolesDialog.description", { name: user.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {ROLE_NAMES.map((role) => (
              <label
                key={role}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent"
              >
                <Checkbox
                  checked={selectedRoles.includes(role)}
                  onCheckedChange={() => toggleRole(role)}
                />
                <span className="text-sm">{t(`users.roles.${role}`)}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRolesOpen(false)}
              disabled={savingRoles}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveRoles} disabled={savingRoles}>
              {savingRoles
                ? t("users.editRolesDialog.saving")
                : t("users.editRolesDialog.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LinkRefereeDialog
        user={user}
        open={linkRefereeOpen}
        onOpenChange={setLinkRefereeOpen}
        onLinked={onMutated}
      />
    </>
  )
}
