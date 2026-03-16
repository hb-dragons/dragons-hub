export interface DeliveryResult {
  success: boolean;
  error?: string;
}

export interface ChannelSendParams {
  eventId: string;
  watchRuleId: number | null;
  channelConfigId: number;
  recipientId: string | null;
  title: string;
  body: string;
  locale: string;
}

export interface ChannelAdapter {
  send(params: ChannelSendParams): Promise<DeliveryResult>;
}
