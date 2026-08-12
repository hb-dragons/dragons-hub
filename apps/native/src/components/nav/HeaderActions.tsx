import { Platform, Pressable, View } from "react-native";
import { Stack } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { Icon } from "@/components/ui/Icon";
import { symbolFor, type IconName } from "@/lib/ui/icons";

/**
 * One action in a screen's navigation bar.
 *
 * Named by role, like everything else in the icon vocabulary (#221): the bar
 * decides what a role is drawn with, because the answer differs by platform.
 */
export interface HeaderAction<K extends string> {
  key: K;
  /** i18n key of the label. Spoken by VoiceOver; also the menu row's text. */
  labelKey: string;
  icon: IconName;
}

interface Props<K extends string> {
  /** Shown as bar buttons of their own, in order. */
  items: readonly HeaderAction<K>[];
  /** Behind the bar's overflow menu. Leave empty for no menu. */
  overflow?: readonly HeaderAction<K>[];
  onAction: (key: K) => void;
}

/**
 * Whether the platform's bar can draw a symbol-named item.
 *
 * `Stack.Toolbar.Button` and `Stack.Toolbar.Menu` take an SF Symbol *name* on
 * iOS and an `ImageSourcePropType` on Android; handed a name, the Android
 * components warn and render nothing at all. The app's icon vocabulary has no
 * image tier — it has a Material symbol name, which is not an image source —
 * so on Android the bar items are hosted views instead, which is what the whole
 * app did before #224.
 */
const BAR_DRAWS_ITEMS = Platform.OS === "ios";

/** Tap target for the fallback buttons; UIKit gives its bar items their own. */
const FALLBACK_TAP_TARGET = 44;

/**
 * A screen's navigation-bar actions (#224).
 *
 * On iOS these are `UIBarButtonItem`s: UIKit owns their metrics, tint, pressed
 * state and — on iOS 26 — the glass the bar puts behind them, and what did not
 * fit in the bar is a real `UIMenu` rather than one more button opening one
 * more sheet. That is the whole point of the migration, and the reason no
 * screen writes `headerRight` any more.
 *
 * Android takes the plainest acceptable fallback per ADR 0001: the same
 * actions as plain pressables hosted in the bar, reached through the same
 * component's `asChild` (so `headerRight` still appears nowhere in app
 * source). It has no menu tier — a hand-drawn dropdown would be exactly the
 * imitation the ADR rules out — so the overflow actions sit beside the direct
 * ones there. That keeps every action reachable on both platforms, which is
 * the rule the task context menu (#220) already follows.
 */
export function HeaderActions<K extends string>({ items, overflow = [], onAction }: Props<K>) {
  return BAR_DRAWS_ITEMS ? (
    <Stack.Toolbar placement="right">
      {items.map((action) => (
        <Stack.Toolbar.Button
          key={action.key}
          icon={symbolFor(action.icon)}
          accessibilityLabel={i18n.t(action.labelKey)}
          onPress={() => onAction(action.key)}
        />
      ))}
      {overflow.length > 0 ? (
        <Stack.Toolbar.Menu icon={symbolFor("more")} accessibilityLabel={i18n.t("common.more")}>
          {overflow.map((action) => (
            <Stack.Toolbar.MenuAction
              key={action.key}
              icon={symbolFor(action.icon)}
              onPress={() => onAction(action.key)}
            >
              {i18n.t(action.labelKey)}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
      ) : null}
    </Stack.Toolbar>
  ) : (
    <Stack.Toolbar placement="right" asChild>
      <FallbackItems items={[...items, ...overflow]} onAction={onAction} />
    </Stack.Toolbar>
  );
}

function FallbackItems<K extends string>({
  items,
  onAction,
}: {
  items: readonly HeaderAction<K>[];
  onAction: (key: K) => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {items.map((action) => (
        <Pressable
          key={action.key}
          onPress={() => onAction(action.key)}
          accessibilityRole="button"
          accessibilityLabel={i18n.t(action.labelKey)}
          style={{
            width: FALLBACK_TAP_TARGET,
            height: FALLBACK_TAP_TARGET,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={action.icon} size={20} color={colors.primary} />
        </Pressable>
      ))}
    </View>
  );
}
