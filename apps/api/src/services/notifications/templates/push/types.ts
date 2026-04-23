export interface PushTemplateOutput {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export type Locale = "de" | "en";

export const TITLE_MAX = 50;
export const BODY_MAX = 178;
