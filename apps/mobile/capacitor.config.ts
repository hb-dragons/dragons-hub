import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dragons.app",
  appName: "Dragons",
  webDir: "dist",
  server: {
    url: process.env.MOBILE_SERVER_URL || "http://localhost:3000",
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidSplashResourceName: "splash",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  ios: {
    scheme: "Dragons",
  },
};

export default config;
