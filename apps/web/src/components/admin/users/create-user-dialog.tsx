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

// Roles are assigned post-creation via the user actions dialog (T14).
// New users start with no elevated access (role = null).
const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

type CreateUserFormValues = z.infer<typeof createUserSchema>

interface CreateUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateUserDialogProps) {
  const t = useTranslations()
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  })

  async function onSubmit(values: CreateUserFormValues) {
    setSubmitting(true)
    try {
      const { error } = await authClient.admin.createUser({
        name: values.name,
        email: values.email,
        password: values.password,
      })
      if (error) {
        toast.error(t("users.toast.createFailed"))
        return
      }
      toast.success(t("users.toast.created"))
      form.reset()
      onOpenChange(false)
      onCreated()
    } catch {
      toast.error(t("users.toast.createFailed"))
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
          <DialogTitle>{t("users.createDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("users.createDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>{t("users.createDialog.nameLabel")}</FieldLabel>
                <Input
                  placeholder={t("users.createDialog.namePlaceholder")}
                  {...field}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>{t("users.createDialog.emailLabel")}</FieldLabel>
                <Input
                  type="email"
                  placeholder={t("users.createDialog.emailPlaceholder")}
                  {...field}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>{t("users.createDialog.passwordLabel")}</FieldLabel>
                <Input
                  type="password"
                  placeholder={t("users.createDialog.passwordPlaceholder")}
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
                ? t("users.createDialog.creating")
                : t("users.createDialog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
