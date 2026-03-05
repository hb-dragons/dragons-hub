import { getRequestConfig } from "next-intl/server";
import type { routing as routingType } from "./routing";
import { routing } from "./routing";

type Locale = (typeof routingType.locales)[number];

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale =
    requested && routing.locales.includes(requested as Locale)
      ? (requested as Locale)
      : routing.defaultLocale;
  return {
    locale,
    timeZone: "Europe/Berlin",
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
        dateOnly: {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        },
        matchTime: {
          hour: "2-digit",
          minute: "2-digit",
        },
        timeOnly: {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        },
        full: {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        },
      },
    },
  };
});
