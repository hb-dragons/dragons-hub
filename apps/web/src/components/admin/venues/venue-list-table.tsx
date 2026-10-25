"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import useSWR, { useSWRConfig } from "swr"
import { queries } from "@/lib/swr-queries"
import { SWR_KEYS } from "@/lib/swr-keys"
import { authClient } from "@/lib/auth-client"
import { can } from "@dragons/shared"
import type { ColumnDef, FilterFn, Row } from "@tanstack/react-table"
import { CalendarClock, MapPin, SearchIcon, Upload } from "lucide-react"
import { Input } from "@dragons/ui/components/input"
import { Button } from "@dragons/ui/components/button"
import { Sheet } from "@dragons/ui/components/sheet"
import { HallTimeImportDialog } from "@/components/admin/hall-times/hall-time-import-dialog"
import { VenueHallTimesSheet } from "@/components/admin/hall-times/venue-hall-times-sheet"

import { DataTable } from "@/components/ui/data-table"
import { ErrorState } from "@/components/ui/error-state"
import { LoadingState } from "@/components/ui/loading-state"
import { DataTableToolbar } from "@/components/ui/data-table-toolbar"
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header"

import type { VenueListItem } from "./types"

function getMapUrl(venue: VenueListItem): string {
  if (venue.latitude && venue.longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`;
  }
  const parts = [venue.name, venue.street, venue.postalCode, venue.city]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}`;
}

function getColumns(
  t: ReturnType<typeof useTranslations<"venues">>,
  onOpenHallTimes: (venue: VenueListItem) => void,
): ColumnDef<VenueListItem, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.name")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.name}</span>
      ),
      meta: { label: t("columns.name") },
    },
    {
      accessorKey: "street",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.street")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.street ?? ""}</span>
      ),
      meta: { label: t("columns.street") },
    },
    {
      accessorKey: "postalCode",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.postalCode")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.postalCode ?? ""}</span>
      ),
      meta: { label: t("columns.postalCode") },
    },
    {
      accessorKey: "city",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.city")} />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.city ?? ""}</span>
      ),
      meta: { label: t("columns.city") },
    },
    {
      id: "hallTimes",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.hallTimes")} />
      ),
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${t("hallTimes")}: ${row.original.name}`}
          onClick={(e) => {
            e.stopPropagation()
            onOpenHallTimes(row.original)
          }}
        >
          <CalendarClock className="h-4 w-4" />
        </Button>
      ),
      enableSorting: false,
      meta: { label: t("columns.hallTimes") },
    },
    {
      id: "map",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("columns.map")} />
      ),
      cell: ({ row }) => (
        <a
          href={getMapUrl(row.original)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          title={t("openMap")}
        >
          <MapPin className="h-4 w-4" />
        </a>
      ),
      enableSorting: false,
      meta: { label: t("columns.map") },
    },
  ]
}

const venueGlobalFilterFn: FilterFn<VenueListItem> = (
  row,
  _columnId,
  filterValue,
) => {
  const search = (filterValue as string).toLowerCase()
  if (!search) return true

  const name = row.original.name.toLowerCase()
  const street = (row.original.street ?? "").toLowerCase()
  const city = (row.original.city ?? "").toLowerCase()
  const postalCode = (row.original.postalCode ?? "").toLowerCase()

  return (
    name.includes(search) ||
    street.includes(search) ||
    city.includes(search) ||
    postalCode.includes(search)
  )
}

export function VenueListTable() {
  const t = useTranslations("venues")
  const tHallTimes = useTranslations("hallTimes")
  const venuesQ = queries.venues()
  const { data: venueList, error, isLoading, mutate } = useSWR(
    venuesQ.key,
    venuesQ.fetcher,
  )
  const { mutate: mutateKey } = useSWRConfig()
  const { data: session } = authClient.useSession()
  const canEdit = can(session?.user ?? null, "venue", "update")
  const [pickedVenue, setPickedVenue] = useState<VenueListItem | null>(null)
  // `?hallTimes=<venueId>` deep-links to a venue's Hallenzeiten panel (the
  // Hallenbelegung list links here). Closing the panel marks the param handled
  // so it does not reopen on the next render.
  const hallTimesParam = useSearchParams()?.get("hallTimes") ?? null
  const [dismissedParam, setDismissedParam] = useState<string | null>(null)
  const paramVenue =
    hallTimesParam !== null && hallTimesParam !== dismissedParam
      ? (venueList ?? []).find((v) => String(v.id) === hallTimesParam) ?? null
      : null
  const selectedVenue = pickedVenue ?? paramVenue
  const setSelectedVenue = (venue: VenueListItem | null) => {
    setPickedVenue(venue)
    if (venue === null) setDismissedParam(hallTimesParam)
  }
  const columns = useMemo(() => getColumns(t, setPickedVenue), [t])
  const [showImport, setShowImport] = useState(false)

  // A failed request is not "no venues found" — never collapse the two.
  if (error) {
    return <ErrorState onRetry={() => { void mutate(); }} />
  }

  if (isLoading && !venueList) {
    return <LoadingState rows={6} />
  }

  const allItems = venueList ?? []

  return (
    <div className="space-y-4">
    <DataTable
      columns={columns}
      data={allItems}
      globalFilterFn={venueGlobalFilterFn}
      onRowClick={(row: Row<VenueListItem>) => setSelectedVenue(row.original)}
      emptyState={
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <MapPin className="mb-2 h-8 w-8" />
          <p>{t("empty")}</p>
        </div>
      }
    >
      {(table) => (
        <DataTableToolbar table={table}>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={(table.getState().globalFilter as string) ?? ""}
              onChange={(event) => table.setGlobalFilter(event.target.value)}
              className="h-8 w-[150px] pl-8 lg:w-[250px]"
            />
          </div>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
              <Upload className="mr-2 h-4 w-4" />
              {tHallTimes("import.button")}
            </Button>
          )}
        </DataTableToolbar>
      )}
    </DataTable>

    <Sheet
      open={selectedVenue !== null}
      onOpenChange={(open) => {
        if (!open) setSelectedVenue(null)
      }}
    >
      {selectedVenue && <VenueHallTimesSheet venue={selectedVenue} canEdit={canEdit} />}
    </Sheet>

    <HallTimeImportDialog
      open={showImport}
      onOpenChange={setShowImport}
      venues={allItems}
      onImported={(venueId) => {
        void mutateKey(SWR_KEYS.venueHallTimes(venueId))
        void mutateKey(
          (key) => typeof key === "string" && key.startsWith("/admin/hall-occupancy"),
        )
      }}
    />
    </div>
  )
}
