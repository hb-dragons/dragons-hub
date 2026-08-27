const { getDefaultConfig } = require("expo/metro-config");
const { withSentryConfig } = require("@sentry/react-native/metro");

const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve("react-native-svg-transformer/expo"),
};

config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== "svg"),
  sourceExts: [...config.resolver.sourceExts, "svg"],
};

config.resolver.unstable_enablePackageExports = true;

// Applied last, and via `withSentryConfig` rather than `getSentryExpoConfig`,
// so it wraps the serializer without replacing the SVG babel transformer set
// above. It stamps a Debug ID into the bundle and its source map, which is
// what lets GlitchTip pair the two after the fact (#238).
module.exports = withSentryConfig(config);
