import mongoose, { Schema } from 'mongoose';

export interface IAlertEventDocument {
  _id: mongoose.Types.ObjectId;
  ruleId: mongoose.Types.ObjectId;
  ruleName: string;
  service: string;
  metric: string;
  value: number;
  threshold: number;
  operator: string;
  message: string;
  severity: 'warning' | 'critical';
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

const AlertEventSchema = new Schema<IAlertEventDocument>({
  ruleId: { type: Schema.Types.ObjectId, ref: 'AlertRule', required: true, index: true },
  ruleName: { type: String, required: true },
  service: { type: String, required: true },
  metric: { type: String, required: true },
  value: { type: Number, required: true },
  threshold: { type: Number, required: true },
  operator: { type: String, required: true },
  message: { type: String, required: true },
  severity: { type: String, enum: ['warning', 'critical'], required: true },
  timestamp: { type: Date, required: true, default: Date.now, index: -1 },
  acknowledged: { type: Boolean, default: false, index: true },
  acknowledgedBy: { type: String, default: null },
  acknowledgedAt: { type: Date, default: null },
}, {
  timestamps: false,
});

AlertEventSchema.index({ timestamp: -1 });
AlertEventSchema.index({ service: 1, timestamp: -1 });

export const AlertEvent = mongoose.model<IAlertEventDocument>('AlertEvent', AlertEventSchema);
