/**
 * Recovery from a chat the server will keep rejecting (issue #148).
 *
 * A message the API refuses stays in `messages`, and `DefaultChatTransport`
 * re-sends the whole list on every subsequent turn — so one 400 dead-ends the
 * screen, and `regenerate()` just re-sends the same rejected body. Dropping the
 * transcript is the only client-side way out.
 */

/**
 * Generic in the message type so the screen can pass `useChat`'s `setMessages`
 * straight in. Nothing here reads a message — the only value ever passed is the
 * empty list — so pinning it to the SDK's `UIMessage` would buy nothing and
 * cost a cast at the call site.
 */
export interface ChatResetHandles<TMessage> {
  setMessages: (messages: TMessage[]) => void;
  clearError: () => void;
}

/**
 * Empty the transcript and return the chat to a usable state.
 *
 * Both calls are required: AI SDK v6 leaves `status` at "error" and keeps
 * `error` set after a failed turn, so clearing `messages` on its own would
 * leave an error banner attached to a conversation that no longer exists.
 */
export function resetChat<TMessage>({
  setMessages,
  clearError,
}: ChatResetHandles<TMessage>): void {
  setMessages([]);
  clearError();
}

/** Whether the screen should show the reset control. */
export function shouldOfferReset({ hasError }: { hasError: boolean }): boolean {
  return hasError;
}
