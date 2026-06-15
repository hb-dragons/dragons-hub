"use client";

import { memo } from "react";
import { Streamdown } from "streamdown";

interface AssistantMarkdownProps {
  text: string;
  /** True while this message is still streaming, so streamdown animates the tail. */
  isStreaming?: boolean;
}

/**
 * Renders assistant markdown via streamdown. streamdown sanitizes by default
 * (rehype-sanitize + rehype-harden) and repairs incomplete markdown mid-stream —
 * do NOT pass rehypePlugins/remarkPlugins here, which would REPLACE (not merge)
 * the defaults and drop sanitization.
 *
 * Theming: the `prose-*` utility classes map markdown elements to design tokens
 * (Inter body, Space Grotesk headings, rounded-md, tonal surfaces, primary links).
 */
function AssistantMarkdownImpl({ text, isStreaming }: AssistantMarkdownProps) {
  return (
    <Streamdown
      isAnimating={isStreaming}
      className={[
        "text-sm leading-relaxed text-foreground",
        "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
        "[&_h1]:font-display [&_h2]:font-display [&_h3]:font-display [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-3",
        "[&_code]:rounded [&_code]:bg-surface-low [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
        "[&_pre]:my-2 [&_pre]:rounded-md [&_pre]:bg-surface-low [&_pre]:p-3 [&_pre]:text-xs",
        "[&_table]:my-2 [&_table]:w-full [&_table]:text-xs",
        "[&_th]:font-display [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:text-left [&_th]:px-2 [&_th]:py-1",
        "[&_td]:px-2 [&_td]:py-1 [&_tr]:odd:bg-surface-low",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
      ].join(" ")}
    >
      {text}
    </Streamdown>
  );
}

export const AssistantMarkdown = memo(
  AssistantMarkdownImpl,
  (prev, next) => prev.text === next.text && prev.isStreaming === next.isStreaming,
);
