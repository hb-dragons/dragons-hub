const { getSentryExpoConfig } = require("@sentry/react-native/metro");

// `getSentryExpoConfig`, not `getDefaultConfig` + `withSentryConfig` (#238).
// Both stamp a Debug ID into the bundle and its source map, which is what
// lets GlitchTip pair the two after the fact, but they do it differently:
// `withSentryConfig` installs a *custom serializer* wrapping Metro's, which is
// the bare-React-Native path, while this one passes a debug-id plugin into
// Expo's own `getDefaultConfig` and leaves the serializer alone. On Expo the
// serializer wrapper reads `undefined` for the bundle source and fails the
// build with "Cannot read properties of undefined (reading 'match')".
const config = getSentryExpoConfig(__dirname);

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

module.exports = config;
