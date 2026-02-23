import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as "de" | "en")) {
    locale = routing.defaultLocale;
  }
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    formats: {
      dateTime: {
        matchDate: {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        },
        short: {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        },
        syncTimestamp: {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        },
      },
    },
  };
});
