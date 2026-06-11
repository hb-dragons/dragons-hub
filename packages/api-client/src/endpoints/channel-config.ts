import type {
  ChannelConfigItem,
  ChannelConfigListResult,
  ProviderAvailability,
} from "@dragons/shared";
import type {
  ChannelConfigListQuery,
  ChannelConfigCreateBody,
  ChannelConfigUpdateBody,
} from "@dragons/contracts";
import type { ApiClient } from "../client";

export function channelConfigEndpoints(client: ApiClient) {
  return {
    list(
      query?: Partial<ChannelConfigListQuery>,
    ): Promise<ChannelConfigListResult> {
      return client.get(
        "/admin/channel-configs",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    providers(): Promise<ProviderAvailability> {
      return client.get("/admin/channel-configs/providers");
    },
    get(id: number): Promise<ChannelConfigItem> {
      return client.get(`/admin/channel-configs/${id}`);
    },
    create(body: ChannelConfigCreateBody): Promise<ChannelConfigItem> {
      return client.post("/admin/channel-configs", body);
    },
    update(
      id: number,
      body: ChannelConfigUpdateBody,
    ): Promise<ChannelConfigItem> {
      return client.patch(`/admin/channel-configs/${id}`, body);
    },
    remove(id: number): Promise<{ success: true }> {
      return client.delete(`/admin/channel-configs/${id}`);
    },
  };
}
