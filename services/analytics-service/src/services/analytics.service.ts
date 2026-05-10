import { LogEntry } from '../models/log-entry.model.js';

function buildMatchStage(from?: string, to?: string): Record<string, any> {
  const match: Record<string, any> = {};
  if (from || to) {
    match.timestamp = {};
    if (from) match.timestamp.$gte = new Date(from);
    if (to) match.timestamp.$lte = new Date(to);
  }
  return match;
}

export function createAnalyticsService() {
  async function getSummary(from?: string, to?: string) {
    const match = buildMatchStage(from, to);
    const [result] = await LogEntry.aggregate([
      { $match: match },
      {
        $facet: {
          total: [{ $count: 'count' }],
          latency: [{ $group: { _id: null, avg: { $avg: '$latency' }, min: { $min: '$latency' }, max: { $max: '$latency' } } }],
          errors: [{ $match: { statusCode: { $gte: 400 } } }, { $count: 'count' }],
          statusBreakdown: [{ $group: { _id: { $floor: { $divide: ['$statusCode', 100] } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
          uniqueUsers: [{ $match: { userId: { $ne: null } } }, { $group: { _id: '$userId' } }, { $count: 'count' }],
          uniquePaths: [{ $group: { _id: '$path' } }, { $count: 'count' }],
        },
      },
    ]);

    const totalCount = result.total[0]?.count ?? 0;
    const errorCount = result.errors[0]?.count ?? 0;
    const latency = result.latency[0] ?? { avg: 0, min: 0, max: 0 };

    return {
      totalRequests: totalCount,
      avgLatency: Math.round(latency.avg * 100) / 100,
      minLatency: latency.min,
      maxLatency: latency.max,
      errorRate: totalCount ? Math.round((errorCount / totalCount) * 10000) / 100 : 0,
      errorCount,
      statusBreakdown: Object.fromEntries(result.statusBreakdown.map((s: any) => [`${s._id}xx`, s.count])),
      uniqueUsers: result.uniqueUsers[0]?.count ?? 0,
      uniqueEndpoints: result.uniquePaths[0]?.count ?? 0,
    };
  }

  async function getRequestsOverTime(from?: string, to?: string, interval: 'hour' | 'day' = 'day') {
    const match = buildMatchStage(from, to);
    const dateTrunc = interval === 'hour'
      ? { $dateTrunc: { date: '$timestamp', unit: 'hour' as const } }
      : { $dateTrunc: { date: '$timestamp', unit: 'day' as const } };

    const results = await LogEntry.aggregate([
      { $match: match },
      { $group: { _id: dateTrunc, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', count: 1 } },
    ]);

    return results;
  }

  async function getErrorRate(from?: string, to?: string) {
    const match = buildMatchStage(from, to);
    const [result] = await LogEntry.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          errors4xx: { $sum: { $cond: [{ $and: [{ $gte: ['$statusCode', 400] }, { $lt: ['$statusCode', 500] }] }, 1, 0] } },
          errors5xx: { $sum: { $cond: [{ $gte: ['$statusCode', 500] }, 1, 0] } },
        },
      },
    ]);

    const total = result?.total ?? 0;
    const errors4xx = result?.errors4xx ?? 0;
    const errors5xx = result?.errors5xx ?? 0;

    return {
      total,
      errors4xx,
      errors5xx,
      totalErrors: errors4xx + errors5xx,
      errorRate: total ? Math.round(((errors4xx + errors5xx) / total) * 10000) / 100 : 0,
    };
  }

  async function getLatencyPercentiles(from?: string, to?: string) {
    const match = buildMatchStage(from, to);
    const pipeline: any[] = [
      { $match: match },
      {
        $group: {
          _id: null,
          avg: { $avg: '$latency' },
          min: { $min: '$latency' },
          max: { $max: '$latency' },
          p50: { $percentile: { p: [0.5], input: '$latency', method: 'approximate' } },
          p95: { $percentile: { p: [0.95], input: '$latency', method: 'approximate' } },
          p99: { $percentile: { p: [0.99], input: '$latency', method: 'approximate' } },
        },
      },
    ];
    const [basics] = await LogEntry.aggregate(pipeline);

    return basics
      ? {
          avg: Math.round(basics.avg * 100) / 100,
          min: basics.min,
          max: basics.max,
          p50: Math.round(basics.p50[0] * 100) / 100,
          p95: Math.round(basics.p95[0] * 100) / 100,
          p99: Math.round(basics.p99[0] * 100) / 100,
        }
      : { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
  }

  async function getTopEndpoints(from?: string, to?: string, limit = 10) {
    const match = buildMatchStage(from, to);
    return LogEntry.aggregate([
      { $match: match },
      {
        $group: {
          _id: { method: '$method', path: '$path' },
          count: { $sum: 1 },
          avgLatency: { $avg: '$latency' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { _id: 0, method: '$_id.method', path: '$_id.path', count: 1, avgLatency: { $round: ['$avgLatency', 2] } } },
    ]);
  }

  async function getTopUsers(from?: string, to?: string, limit = 10) {
    const match = buildMatchStage(from, to);
    match.userId = { $ne: null };
    return LogEntry.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$userId',
          count: { $sum: 1 },
          lastActive: { $max: '$timestamp' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { _id: 0, userId: '$_id', count: 1, lastActive: 1 } },
    ]);
  }

  async function getApiKeyUsage(from?: string, to?: string, limit = 10) {
    const match = buildMatchStage(from, to);
    match.apiKeyId = { $ne: null };
    return LogEntry.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$apiKeyId',
          count: { $sum: 1 },
          lastUsed: { $max: '$timestamp' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      { $project: { _id: 0, apiKeyId: '$_id', count: 1, lastUsed: 1 } },
    ]);
  }

  return { getSummary, getRequestsOverTime, getErrorRate, getLatencyPercentiles, getTopEndpoints, getTopUsers, getApiKeyUsage };
}
