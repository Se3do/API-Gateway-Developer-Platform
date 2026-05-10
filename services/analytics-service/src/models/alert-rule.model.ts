import mongoose, { Schema } from 'mongoose';

export interface IAlertRuleDocument {
  name: string;
  description?: string;
  service: string;
  metric: string;
  windowSeconds: number;
  threshold: number;
  operator: string;
  enabled: boolean;
  coolDownSeconds: number;
}

const AlertRuleSchema = new Schema<IAlertRuleDocument>({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  service: { type: String, required: true, index: true },
  metric: { type: String, required: true, enum: ['error_rate', 'p95_latency', '5xx_count', 'request_rate', 'avg_latency', 'error_count'] },
  windowSeconds: { type: Number, required: true, min: 10 },
  threshold: { type: Number, required: true },
  operator: { type: String, required: true, enum: ['gt', 'gte', 'lt', 'lte', 'eq'] },
  enabled: { type: Boolean, default: true },
  coolDownSeconds: { type: Number, default: 300, min: 0 },
}, {
  timestamps: true,
});

AlertRuleSchema.index({ service: 1, enabled: 1 });
AlertRuleSchema.index({ metric: 1 });

export const AlertRule = mongoose.model<IAlertRuleDocument>('AlertRule', AlertRuleSchema);
