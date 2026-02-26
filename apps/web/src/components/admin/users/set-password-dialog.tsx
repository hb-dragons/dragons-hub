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
import { Field, FieldLabel, FieldError } from "@dragons/ui/components/field"

import type { UserListItem } from "./types"

const setPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
})

type SetPasswordFormValues = z.infer<typeof setPasswordSchema>

interface SetPasswordDialogProps {
  user: UserListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SetPasswordDialog({
  user,
  open,
  onOpenChange,
}: SetPasswordDialogProps) {
  const t = useTranslations()
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<SetPasswordFormValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: "" },
  })

  async function onSubmit(values: SetPasswordFormValues) {
    if (!user) return
    setSubmitting(true)
    try {
      const { error } = await authClient.admin.setUserPassword({
        userId: user.id,
        newPassword: values.password,
      })
      if (error) {
        toast.error(t("users.toast.passwordSetFailed"))
        return
      }
      toast.success(t("users.toast.passwordSet"))
      form.reset()
      onOpenChange(false)
    } catch {
      toast.error(t("users.toast.passwordSetFailed"))
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
          <DialogTitle>{t("users.setPasswordDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("users.setPasswordDialog.description", { name: user?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>{t("users.setPasswordDialog.passwordLabel")}</FieldLabel>
                <Input
                  type="password"
                  placeholder={t("users.setPasswordDialog.passwordPlaceholder")}
                  {...field}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
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
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("users.setPasswordDialog.confirming")
                : t("users.setPasswordDialog.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
