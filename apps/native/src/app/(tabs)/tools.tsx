import { Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";

export default function ToolsScreen() {
  const { colors, textStyles } = useTheme();
  return (
    <Screen>
      <View>
        <Text style={[textStyles.sectionTitle, { color: colors.foreground }]}>
          {i18n.t("tools.title")}
        </Text>
      </View>
    </Screen>
  );
}
