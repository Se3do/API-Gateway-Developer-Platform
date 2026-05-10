export interface IApiKey {
  id: string;
  keyHash: string;
  prefix: string;
  name: string;
  projectId: string;
  userId: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  active: boolean;
  createdAt: Date;
  revokedAt: Date | null;
}
