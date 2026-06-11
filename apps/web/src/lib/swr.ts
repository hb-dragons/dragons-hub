import { browserClient } from "./api";

export const apiFetcher = <T>(endpoint: string): Promise<T> =>
  browserClient.get<T>(endpoint);
