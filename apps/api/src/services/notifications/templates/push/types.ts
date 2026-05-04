export interface PushTemplateOutput {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export type Locale = "de" | "en";

// APNs limits: ~50 chars title, ~178 chars body before lockscreen truncation.
// Android is more permissive, so the Apple ceiling is the safe shared cap.
export const TITLE_MAX = 50;
export const BODY_MAX = 178;
