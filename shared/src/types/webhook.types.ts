export const WEBHOOK_EVENTS = [
  'project.created',
  'project.updated',
  'project.deleted',
  'api_key.created',
  'api_key.revoked',
  'alert.triggered',
  'user.registered',
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

export interface IWebhook {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  projectId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
