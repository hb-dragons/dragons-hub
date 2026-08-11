---
status: accepted
---

# Shipping alpha native tabs deliberately

`apps/native` uses `NativeTabs` from `expo-router/unstable-native-tabs` in production even though Expo classifies the API as alpha, and even though our default is stable-only APIs. It is the only way to render the real `UITabBarController` — Liquid Glass tab bar, SF Symbol icons, minimize-on-scroll — and a JS-drawn tab bar imitating iOS is the clearest "outdated app" marker in current React Native practice. The fallback would be throwaway work.

The API-churn risk is contained: the unstable import lives in one local wrapper module (`AppTabs`), so a breaking rename is a one-file fix. Do not "fix" the unstable import by retreating to JS tabs; when Expo stabilizes the API, update the wrapper's import path and delete this caveat.
