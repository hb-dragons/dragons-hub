"use client"

import { useEffect, useState } from "react"
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

const editUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
})

type EditUserFormValues = z.infer<typeof editUserSchema>

interface EditUserDialogProps {
  user: UserListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}

export function EditUserDialog({
  user,
  open,
  onOpenChange,
  onUpdated,
}: EditUserDialogProps) {
  const t = useTranslations()
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { name: "", email: "" },
  })

  useEffect(() => {
    if (user) {
      form.reset({ name: user.name, email: user.email })
    }
  }, [user, form])

  async function onSubmit(values: EditUserFormValues) {
    if (!user) return
    setSubmitting(true)
    try {
      const { error } = await authClient.admin.updateUser({
        userId: user.id,
        data: { name: values.name, email: values.email },
      })
      if (error) {
        toast.error(t("users.toast.updateFailed"))
        return
      }
      toast.success(t("users.toast.updated"))
      onOpenChange(false)
      onUpdated()
    } catch {
      toast.error(t("users.toast.updateFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("users.editDialog.title")}</DialogTitle>
          <DialogDescription>{t("users.editDialog.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>{t("users.editDialog.nameLabel")}</FieldLabel>
                <Input {...field} />
                <FieldError>{fieldState.error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>{t("users.editDialog.emailLabel")}</FieldLabel>
                <Input type="email" {...field} />
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
                ? t("users.editDialog.updating")
                : t("users.editDialog.update")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
