---
status: accepted
---

# First-party native menus, zeego rejected

Item-level actions in `apps/native` (task long-press, header overflow) belong behind real iOS context menus per the HIG, not action sheets or hand-rolled modals. We use only first-party mechanisms: Expo Router `Link` previews with menu items and `@expo/ui` menu components, with `ActionSheetIOS` as the native interim where those fall short.

zeego is the de-facto community standard and was rejected: its last release was March 2025 and its documented compatibility stops around React Native 0.76 / Expo SDK 52, while this app tracks current SDKs. A stale dependency that bridges native menu controllers is exactly where New Architecture breakage lands. Revisit only if zeego resumes active releases.
