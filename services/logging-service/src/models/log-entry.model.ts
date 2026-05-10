import mongoose, { Schema, Document } from 'mongoose';

export interface ILogEntry extends Document {
  requestId: string;
  timestamp: Date;
  method: string;
  path: string;
  statusCode: number;
  latency: number;
  ip: string;
  userId: string | null;
  apiKeyId: string | null;
  userAgent: string;
  contentLength: number;
  error: {
    code: string;
    message: string;
    stack: string | null;
  } | null;
}

const LogEntrySchema = new Schema<ILogEntry>({
  requestId: { type: String, required: true, unique: true, index: true },
  timestamp: { type: Date, required: true, default: Date.now, index: -1 },
  method: { type: String, required: true },
  path: { type: String, required: true },
  statusCode: { type: Number, required: true },
  latency: { type: Number, required: true },
  ip: { type: String, required: true },
  userId: { type: String, default: null, index: true },
  apiKeyId: { type: String, default: null },
  userAgent: { type: String, default: '' },
  contentLength: { type: Number, default: 0 },
  error: {
    type: {
      code: String,
      message: String,
      stack: { type: String, default: null },
    },
    default: null,
  },
}, {
  timestamps: false,
});

LogEntrySchema.index({ timestamp: -1 }, { expireAfterSeconds: 30 * 24 * 3600 });
LogEntrySchema.index({ statusCode: 1, timestamp: -1 });

export const LogEntry = mongoose.model<ILogEntry>('LogEntry', LogEntrySchema);
