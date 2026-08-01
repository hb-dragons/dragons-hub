import type { Access } from "payload";

// Shared read rule for content behind drafts (posts, pages): anonymous readers
// see published docs only; any authenticated user — editor session or the
// site build's API-key user — sees drafts too.
export const publishedOrAuthed: Access = ({ req }) =>
  req.user ? true : { _status: { equals: "published" } };

// Publish-direct content (teams, people graph, flat types, globals) is public.
export const anyone: Access = () => true;
