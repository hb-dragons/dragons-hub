"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useForm, Controller } from "react-hook-form"
import { z } from "zod/v4"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"

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
import { Field, FieldLabel } from "@dragons/ui/components/field"

import type { UserListItem } from "./types"

const banUserSchema = z.object({
  banReason: z.string().optional(),
  banExpiresInDays: z.string().optional(),
})

type BanUserFormValues = z.infer<typeof banUserSchema>

interface BanUserDialogProps {
  user: UserListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onBanned: () => void
}

export function BanUserDialog({
  user,
  open,
  onOpenChange,
  onBanned,
}: BanUserDialogProps) {
  const t = useTranslations()
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<BanUserFormValues>({
    resolver: zodResolver(banUserSchema),
    defaultValues: { banReason: "", banExpiresInDays: "" },
  })

  async function onSubmit(values: BanUserFormValues) {
    if (!user) return
    setSubmitting(true)
    try {
      const days = values.banExpiresInDays ? Number(values.banExpiresInDays) : undefined
      const banExpiresIn = days && days > 0 ? days * 86400 : undefined
      const { error } = await authClient.admin.banUser({
        userId: user.id,
        banReason: values.banReason || undefined,
        banExpiresIn,
      })
      if (error) {
        toast.error(t("users.toast.banFailed"))
        return
      }
      toast.success(t("users.toast.banned"))
      form.reset()
      onOpenChange(false)
      onBanned()
    } catch {
      toast.error(t("users.toast.banFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("users.banDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("users.banDialog.description", { name: user?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            control={form.control}
            name="banReason"
            render={({ field }) => (
              <Field>
                <FieldLabel>{t("users.banDialog.reasonLabel")}</FieldLabel>
                <Input
                  placeholder={t("users.banDialog.reasonPlaceholder")}
                  {...field}
                />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="banExpiresInDays"
            render={({ field }) => (
              <Field>
                <FieldLabel>{t("users.banDialog.expiresLabel")}</FieldLabel>
                <Input
                  type="number"
                  min="1"
                  placeholder={t("users.banDialog.expiresPlaceholder")}
                  {...field}
                />
              </Field>
            )}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={submitting}>
              {submitting
                ? t("users.banDialog.confirming")
                : t("users.banDialog.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
