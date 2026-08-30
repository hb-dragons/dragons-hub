import { describe, expect, it, vi } from "vitest";
import { fetchFullPlan } from "./fetch-plan";

interface Game {
  id: number;
}

function page(ids: number[]): { items: Game[] } {
  return { items: ids.map((id) => ({ id })) };
}

describe("fetchFullPlan", () => {
  it("returns a single short page as-is", async () => {
    const getPage = vi.fn().mockResolvedValue(page([1, 2]));

    await expect(fetchFullPlan(getPage, 3)).resolves.toEqual(page([1, 2]).items);
    expect(getPage).toHaveBeenCalledTimes(1);
    expect(getPage).toHaveBeenCalledWith({ limit: 3, offset: 0 });
  });

  it("keeps crawling while pages come back full", async () => {
    const getPage = vi
      .fn()
      .mockResolvedValueOnce(page([1, 2, 3]))
      .mockResolvedValueOnce(page([4, 5, 6]))
      .mockResolvedValueOnce(page([7]));

    const all = await fetchFullPlan(getPage, 3);

    expect(all.map((g: Game) => g.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(getPage).toHaveBeenNthCalledWith(2, { limit: 3, offset: 3 });
    expect(getPage).toHaveBeenNthCalledWith(3, { limit: 3, offset: 6 });
  });

  it("stops on an exactly-empty follow-up page", async () => {
    const getPage = vi
      .fn()
      .mockResolvedValueOnce(page([1, 2, 3]))
      .mockResolvedValueOnce(page([]));

    await expect(fetchFullPlan(getPage, 3)).resolves.toHaveLength(3);
    expect(getPage).toHaveBeenCalledTimes(2);
  });
});
