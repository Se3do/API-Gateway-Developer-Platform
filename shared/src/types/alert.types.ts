export type AlertMetric = 'error_rate' | 'p95_latency' | '5xx_count' | 'request_rate' | 'avg_latency' | 'error_count';

export type AlertOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

export const ALERT_METRICS: AlertMetric[] = ['error_rate', 'p95_latency', '5xx_count', 'request_rate', 'avg_latency', 'error_count'];

export const ALERT_OPERATORS: AlertOperator[] = ['gt', 'gte', 'lt', 'lte', 'eq'];

export interface IAlertRule {
  id: string;
  name: string;
  description?: string;
  service: string;
  metric: AlertMetric;
  windowSeconds: number;
  threshold: number;
  operator: AlertOperator;
  enabled: boolean;
  coolDownSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface IAlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  service: string;
  metric: string;
  value: number;
  threshold: number;
  operator: string;
  message: string;
  severity: 'warning' | 'critical';
  timestamp: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}
