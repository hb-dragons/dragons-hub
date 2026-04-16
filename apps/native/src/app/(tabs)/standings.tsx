import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/useTheme";

export default function StandingsScreen() {
  const { colors, textStyles } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[textStyles.screenTitle, { color: colors.foreground }]}>
        STANDINGS
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
