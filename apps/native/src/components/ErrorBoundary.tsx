import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { colors } from "@/theme/colors";
import { radius, spacing } from "@/theme/spacing";
import { i18n } from "@/lib/i18n";
import { handleBoundaryError } from "@/lib/error-reporting";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Root error boundary with a themed fallback rendered from the dark palette.
 *
 * Uses the dark tokens directly instead of `useTheme()` because the
 * ThemeProvider itself may be the thing that crashed. Reporting goes through
 * `handleBoundaryError`, which sends to GlitchTip and writes the same
 * `DRAGONS_JS_ERROR` prefix the global handler uses, so a caught error still
 * shows up under `idevicesyslog | grep DRAGONS_JS_ERROR`.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    handleBoundaryError(error, info.componentStack);
  }

  private handleReload = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const dark = colors.dark;
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: dark.background,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
          gap: spacing.lg,
        }}
      >
        <Text
          style={{
            color: dark.foreground,
            fontSize: 22,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          {i18n.t("error.boundary.title")}
        </Text>
        <Text
          style={{
            color: dark.mutedForeground,
            fontSize: 14,
            textAlign: "center",
            maxWidth: 320,
          }}
        >
          {this.state.error?.message ?? ""}
        </Text>
        <Pressable
          onPress={this.handleReload}
          style={{
            backgroundColor: dark.primary,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.md,
            borderRadius: radius.md,
            marginTop: spacing.sm,
          }}
        >
          <Text
            style={{
              color: dark.primaryForeground,
              fontSize: 16,
              fontWeight: "600",
            }}
          >
            {i18n.t("error.boundary.reload")}
          </Text>
        </Pressable>
      </View>
    );
  }
}
