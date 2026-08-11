import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, SectionList, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import useSWR, { useSWRConfig } from "swr";
import { APIError } from "@dragons/api-client";
import { bracketColor, RefereeCandidateRow } from "@/components/RefereeCandidateRow";
import { useTheme } from "@/hooks/useTheme";
import { useDebouncedCallback } from "@/hooks/useDebounce";
import { refereeApi } from "@/lib/api";
import { kickoffCompact } from "@/lib/format/kickoff";
import { haptics } from "@/lib/haptics";
import { i18n } from "@/lib/i18n";
import { parseNumericParam } from "@/lib/nav/route-params";
import { searchFieldOptions } from "@/lib/nav/search-bar";
import {
  groupByDistance,
  parseSlotParam,
  slotLabel,
  type DistanceBracket,
  type RefCandidate,
} from "@/lib/referee/candidates";
import { fontFamilies } from "@/theme/typography";

/**
 * Assigning a referee to one slot of one game (issue #223).
 *
 * A form-sheet route with the system search field in its header. Its
 * predecessor, `<AssignRefereeModal>`, was a React Native `Modal` that drew a
 * docked search field over the list, translated it by the keyboard height on
 * every frame, and carried its own close button — all of which the native
 * header does for free, with the system's keyboard, cancel and scroll
 * behaviour.
 *
 * Route params are scalars, per the sheet convention in `nav/sheet-routes.ts`:
 * the federation's match id and the slot. The match it names is fetched here
 * rather than passed in, so the sheet is self-contained and no display string
 * has to survive a trip through a URL.
 *
 * It owns its mutation and closes — no result token. The list underneath is
 * revalidated through `useSWRConfig`'s `mutate` rather than the one exported
 * by `swr`, which is bound to SWR's default cache and not to the provider the
 * app actually renders from (see `lib/swr-config.ts`).
 */

const SECTION_TITLE_KEY: Record<DistanceBracket, string> = {
  close: "refereeGame.admin.nearby",
  med: "refereeGame.admin.further",
  far: "refereeGame.admin.distant",
};

export default function RefereeAssignSheetRoute() {
  const { colors, spacing, textStyles } = useTheme();
  const params = useLocalSearchParams<{ apiMatchId?: string; slot?: string }>();
  const apiMatchId = parseNumericParam(params.apiMatchId);
  const slot = parseSlotParam(params.slot);

  const [search, setSearch] = useState("");
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const { mutate } = useSWRConfig();

  // The native search field is uncontrolled — there is no per-keystroke state
  // to lag behind — so the debounce sits on the way *out* of it. Candidate
  // search is a live federation call, so this is the most expensive place in
  // the app to fire one request per keystroke.
  const commitSearch = useDebouncedCallback(setSearch);

  const { data, isLoading } = useSWR(
    apiMatchId === null ? null : ["referee:candidates", apiMatchId, slot, search],
    apiMatchId === null
      ? null
      : () =>
          refereeApi.searchAssignmentCandidates(apiMatchId, {
            slotNumber: slot,
            search,
            pageFrom: 0,
            pageSize: 50,
          }),
  );

  // Which game is being filled, for the line above the list. Its own key, so a
  // failed or slow lookup never holds up the candidate search.
  const { data: game } = useSWR(
    apiMatchId === null ? null : ["referee:game-by-api-match", apiMatchId],
    apiMatchId === null ? null : () => refereeApi.getGameByApiMatchId(apiMatchId),
  );

  const sections = useMemo(() => groupByDistance(data?.results ?? []), [data]);

  async function performAssign(candidate: RefCandidate) {
    if (apiMatchId === null) return;
    setAssigningId(candidate.srId);
    try {
      await refereeApi.assignReferee(apiMatchId, {
        slotNumber: slot,
        refereeApiId: candidate.srId,
      });
      await mutate("referee:games");
      haptics.success();
      router.back();
      Alert.alert(
        i18n.t("refereeGame.admin.assignSuccess"),
        `${candidate.vorname} ${candidate.nachName}`,
      );
    } catch (error) {
      haptics.error();
      const message =
        error instanceof APIError ? error.message : i18n.t("refereeGame.admin.assignFailed");
      Alert.alert(i18n.t("refereeGame.admin.assignFailed"), message);
      setAssigningId(null);
    }
  }

  function confirmAssign(candidate: RefCandidate) {
    Alert.alert(
      i18n.t("refereeGame.admin.assignConfirmTitle", {
        name: `${candidate.vorname} ${candidate.nachName}`,
      }),
      i18n.t("refereeGame.admin.assignConfirmMessage", { slot: slotLabel(slot) }),
      [
        { text: i18n.t("refereeGame.admin.cancel"), style: "cancel" },
        {
          text: i18n.t("refereeGame.admin.assign"),
          onPress: () => {
            void performAssign(candidate);
          },
        },
      ],
    );
  }

  const matchLine = game ? (
    <Text
      style={[textStyles.caption, { color: colors.mutedForeground, paddingBottom: spacing.sm }]}
      numberOfLines={1}
    >
      {game.homeTeamName} {i18n.t("common.vs")} {game.guestTeamName} ·{" "}
      {kickoffCompact(game.kickoffDate, game.kickoffTime)}
    </Text>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* The title names the slot, which only this screen knows; the sheet's
          presentation is declared once in the root layout. */}
      <Stack.Screen
        options={{
          title: i18n.t("refereeGame.admin.assignTitle", { slot: slotLabel(slot) }),
          headerSearchBarOptions: searchFieldOptions({
            placeholder: i18n.t("refereeGame.admin.searchPlaceholder"),
            // A sheet does not own the bottom of the screen, so the field goes
            // under the title rather than into iOS 26's bottom toolbar.
            placement: "stacked",
            onChangeText: commitSearch,
            onCancel: () => setSearch(""),
          }),
        }}
      />
      {isLoading && !data ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.srId)}
          // This list is the sheet's scroll view: the one the native header
          // insets and the search field tracks.
          contentInsetAdjustmentBehavior="automatic"
          stickySectionHeadersEnabled
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            paddingHorizontal: spacing.sm,
            paddingBottom: spacing["2xl"],
          }}
          ListHeaderComponent={matchLine}
          ListEmptyComponent={
            <View style={{ paddingVertical: spacing["2xl"], alignItems: "center" }}>
              <Text
                style={[
                  textStyles.body,
                  { color: colors.mutedForeground, textAlign: "center" },
                ]}
              >
                {i18n.t("refereeGame.admin.noResults")}
              </Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                paddingTop: spacing.md,
                paddingBottom: spacing.xs,
                backgroundColor: colors.background,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: bracketColor(section.key, colors),
                }}
              />
              <Text style={[textStyles.tableHeader, { color: colors.mutedForeground }]}>
                {i18n.t(SECTION_TITLE_KEY[section.key])}
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Text
                style={{
                  fontFamily: fontFamilies.bodyMedium,
                  fontSize: 11,
                  color: colors.mutedForeground,
                }}
              >
                {section.data.length}
              </Text>
            </View>
          )}
          // The bracket comes from the section the row was grouped into, so a
          // row's distance pill cannot disagree with the header above it.
          renderItem={({ item, section }) => (
            <RefereeCandidateRow
              candidate={item}
              bracket={section.key}
              slot={slot}
              isAssigning={assigningId === item.srId}
              isBusy={assigningId !== null}
              onPress={() => confirmAssign(item)}
            />
          )}
        />
      )}
    </View>
  );
}
