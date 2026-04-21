"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"

import { Button } from "@dragons/ui/components/button"
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
  const [roleOpen, setRoleOpen] = useState(false)
  const [linkRefereeOpen, setLinkRefereeOpen] = useState(false)

  const isSelf = user.id === currentUserId
  const isBanned = user.banned === true
  // TODO(T14): replace with multi-role editor. For now, toggle "admin" on/off;
  // clearing uses "" which better-auth treats as no role.
  const newRole = user.role === "admin" ? "" : "admin"

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

  async function handleRoleChange() {
    try {
      const { error } = await authClient.admin.setRole({
        userId: user.id,
        // TODO(T14): typed-roles editor. better-auth's setRole accepts the role
        // union, but clearing a role here relies on passing "" which the server
        // normalises to null. Cast until T14 replaces this with a multi-role editor.
        role: newRole as "admin",
      })
      if (error) {
        toast.error(t("users.toast.roleChangeFailed"))
        return
      }
      toast.success(t("users.toast.roleChanged"))
      onMutated()
    } catch {
      toast.error(t("users.toast.roleChangeFailed"))
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
            <DropdownMenuItem onSelect={() => setRoleOpen(true)}>
              {t("users.actions.changeRole")}
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

      <AlertDialog open={roleOpen} onOpenChange={setRoleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("users.changeRoleConfirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("users.changeRoleConfirm.description", {
                name: user.name,
                currentRole: user.role ?? "user",
                newRole,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRoleChange}>
              {t("users.changeRoleConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LinkRefereeDialog
        user={user}
        open={linkRefereeOpen}
        onOpenChange={setLinkRefereeOpen}
        onLinked={onMutated}
      />
    </>
  )
}
