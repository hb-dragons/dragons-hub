import { fetchAPI } from "./api";

export const apiFetcher = <T>(endpoint: string): Promise<T> =>
  fetchAPI<T>(endpoint);
