export interface AssistantTransportConfig {
  api: string;
  headers: Record<string, string>;
  body: { locale?: string };
}

export function buildAssistantTransportConfig(opts: {
  apiUrl: string;
  cookie: string | null;
  locale?: string;
}): AssistantTransportConfig {
  return {
    api: `${opts.apiUrl}/qa/chat`,
    headers: opts.cookie ? { Cookie: opts.cookie } : {},
    body: { locale: opts.locale },
  };
}
