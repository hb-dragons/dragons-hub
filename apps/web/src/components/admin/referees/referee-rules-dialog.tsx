"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import useSWR, { mutate } from "swr"
import { toast } from "sonner"
import { fetchAPI } from "@/lib/api"
import { apiFetcher } from "@/lib/swr"
import { SWR_KEYS } from "@/lib/swr-keys"

import { Button } from "@dragons/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dragons/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select"
import { Checkbox } from "@dragons/ui/components/checkbox"
import { Trash2, Plus } from "lucide-react"

import type { RefereeListItem } from "./types"

interface Team {
  id: number
  name: string
}

interface RuleRow {
  teamId: number | null
  allowSr1: boolean
  allowSr2: boolean
}

interface RulesResponse {
  rules: { teamId: number; allowSr1: boolean; allowSr2: boolean }[]
}

interface RefereeRulesDialogProps {
  referee: RefereeListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RefereeRulesDialog({
  referee,
  open,
  onOpenChange,
}: RefereeRulesDialogProps) {
  const t = useTranslations("referees")
  const [rules, setRules] = useState<RuleRow[]>([])
  const [submitting, setSubmitting] = useState(false)

  const { data: ownClubTeams = [] } = useSWR<Team[]>(
    open ? SWR_KEYS.teams : null,
    apiFetcher,
  )

  const { data: rulesData } = useSWR<RulesResponse>(
    open && referee ? SWR_KEYS.refereeRules(referee.id) : null,
    apiFetcher,
  )

  useEffect(() => {
    if (rulesData?.rules) {
      setRules(
        rulesData.rules.map((r) => ({
          teamId: r.teamId,
          allowSr1: r.allowSr1,
          allowSr2: r.allowSr2,
        })),
      )
    } else if (open) {
      setRules([])
    }
  }, [rulesData, open])

  function addRule() {
    setRules([...rules, { teamId: null, allowSr1: false, allowSr2: true }])
  }

  function removeRule(index: number) {
    setRules(rules.filter((_, i) => i !== index))
  }

  function updateRule(index: number, updates: Partial<RuleRow>) {
    setRules(rules.map((r, i) => (i === index ? { ...r, ...updates } : r)))
  }

  function usedTeamIds(excludeIndex: number): Set<number> {
    return new Set(
      rules
        .filter((_, i) => i !== excludeIndex)
        .map((r) => r.teamId)
        .filter((id): id is number => id !== null),
    )
  }

  async function handleSave() {
    if (!referee) return

    const validRules = rules.filter(
      (r) => r.teamId !== null && (r.allowSr1 || r.allowSr2),
    )

    setSubmitting(true)
    try {
      await fetchAPI(`/admin/referees/${referee.id}/rules`, {
        method: "PUT",
        body: JSON.stringify({
          rules: validRules.map((r) => ({
            teamId: r.teamId,
            allowSr1: r.allowSr1,
            allowSr2: r.allowSr2,
          })),
        }),
      })

      toast.success(t("rules.saved"))
      await mutate(SWR_KEYS.refereeRules(referee.id))
      onOpenChange(false)
    } catch {
      toast.error(t("rules.saveFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("rules.title", {
              name: `${referee?.firstName ?? ""} ${referee?.lastName ?? ""}`.trim(),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("rules.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {rules.map((rule, index) => {
            const used = usedTeamIds(index)
            const availableTeams = ownClubTeams.filter(
              (t) => !used.has(t.id) || t.id === rule.teamId,
            )

            return (
              <div key={index} className="flex items-center gap-2">
                <Select
                  value={rule.teamId?.toString() ?? ""}
                  onValueChange={(val) => updateRule(index, { teamId: Number(val) })}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t("rules.selectTeam")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id.toString()}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <label className="flex items-center gap-1 text-sm">
                  <Checkbox
                    checked={rule.allowSr1}
                    onCheckedChange={(checked) =>
                      updateRule(index, { allowSr1: checked === true })
                    }
                  />
                  SR1
                </label>

                <label className="flex items-center gap-1 text-sm">
                  <Checkbox
                    checked={rule.allowSr2}
                    onCheckedChange={(checked) =>
                      updateRule(index, { allowSr2: checked === true })
                    }
                  />
                  SR2
                </label>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRule(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )
          })}

          {ownClubTeams.length > rules.length && (
            <Button variant="outline" size="sm" onClick={addRule} className="w-full">
              <Plus className="mr-1 h-4 w-4" />
              {t("rules.addRule")}
            </Button>
          )}

          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("rules.noRules")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("rules.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? t("rules.saving") : t("rules.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
