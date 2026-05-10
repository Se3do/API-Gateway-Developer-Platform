import { LogEntry } from '../models/log-entry.model.js';

export interface LogEntryInput {
  requestId: string;
  timestamp?: string;
  method: string;
  path: string;
  statusCode: number;
  latency: number;
  ip: string;
  userId?: string | null;
  apiKeyId?: string | null;
  userAgent?: string;
  contentLength?: number;
  error?: { code: string; message: string; stack?: string | null } | null;
}

interface QueryResult {
  entries: Array<Record<string, any>>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface LogService {
  ingest(data: LogEntryInput): Promise<any>;
  ingestBatch(entries: LogEntryInput[]): Promise<any[]>;
  query(filters: {
    page: number;
    limit: number;
    userId?: string;
    statusCode?: number;
    method?: string;
    from?: string;
    to?: string;
  }): Promise<QueryResult>;
  getByRequestId(requestId: string): Promise<Record<string, any> | null>;
  getErrors(page?: number, limit?: number): Promise<QueryResult>;
}

export function createLogService(): LogService {
  async function ingest(data: LogEntryInput) {
    const entry = new LogEntry({
      ...data,
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    });
    return entry.save();
  }

  async function ingestBatch(entries: LogEntryInput[]) {
    const docs = entries.map((e) => ({
      ...e,
      timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
    }));
    return LogEntry.insertMany(docs);
  }

  async function query(filters: {
    page: number;
    limit: number;
    userId?: string;
    statusCode?: number;
    method?: string;
    from?: string;
    to?: string;
  }) {
    const query: Record<string, any> = {};

    if (filters.userId) query.userId = filters.userId;
    if (filters.statusCode !== undefined) query.statusCode = filters.statusCode;
    if (filters.method) query.method = filters.method.toUpperCase();
    if (filters.from || filters.to) {
      query.timestamp = {};
      if (filters.from) query.timestamp.$gte = new Date(filters.from);
      if (filters.to) query.timestamp.$lte = new Date(filters.to);
    }

    const skip = (filters.page - 1) * filters.limit;
    const [entries, total] = await Promise.all([
      LogEntry.find(query).sort({ timestamp: -1 }).skip(skip).limit(filters.limit).lean(),
      LogEntry.countDocuments(query),
    ]);

    return { entries, total, page: filters.page, limit: filters.limit, totalPages: Math.ceil(total / filters.limit) };
  }

  async function getByRequestId(requestId: string) {
    return LogEntry.findOne({ requestId }).lean();
  }

  async function getErrors(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [entries, total] = await Promise.all([
      LogEntry.find({ statusCode: { $gte: 400 } }).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      LogEntry.countDocuments({ statusCode: { $gte: 400 } }),
    ]);
    return { entries, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  return { ingest, ingestBatch, query, getByRequestId, getErrors };
}
