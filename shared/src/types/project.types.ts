export interface IProject {
  id: string;
  name: string;
  description: string | null;
  userId: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRouteConfig {
  id: string;
  path: string;
  method: string;
  service: string;
  projectId: string;
  rateLimit: number | null;
  cacheTTL: number | null;
  authRequired: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
