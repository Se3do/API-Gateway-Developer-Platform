import { AlertRule } from '../models/alert-rule.model.js';
import { AlertEvent, IAlertEventDocument } from '../models/alert-event.model.js';
import { LogEntry } from '../models/log-entry.model.js';
import { config } from '../config/index.js';
import { httpRequest } from '../utils/http-client.js';

type MetricValue = { value: number; severity: 'warning' | 'critical' };

function getSeverityThreshold(metric: string, _operator: string, value: number, threshold: number): 'warning' | 'critical' {
  if (['error_rate', '5xx_count', 'error_count'].includes(metric)) {
    const ratio = threshold > 0 ? value / threshold : 1;
    return ratio >= 2 ? 'critical' : 'warning';
  }
  return value > threshold * 1.5 ? 'critical' : 'warning';
}

function compareThreshold(value: number, threshold: number, operator: string): boolean {
  switch (operator) {
    case 'gt': return value > threshold;
    case 'gte': return value >= threshold;
    case 'lt': return value < threshold;
    case 'lte': return value <= threshold;
    case 'eq': return value === threshold;
    default: return false;
  }
}

async function computeMetric(metric: string, windowStart: Date): Promise<MetricValue> {
  const match = { timestamp: { $gte: windowStart } };

  switch (metric) {
    case 'error_rate': {
      const [result] = await LogEntry.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: 1 }, errors: { $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] } } } },
      ]);
      const rate = result?.total ? (result.errors / result.total) * 100 : 0;
      return { value: Math.round(rate * 100) / 100, severity: 'warning' };
    }

    case 'p95_latency': {
      const [result] = await LogEntry.aggregate([
        { $match: match },
        { $group: { _id: null, p95: { $percentile: { p: [0.95], input: '$latency', method: 'approximate' } } as any } },
      ]);
      return { value: result ? Math.round(result.p95[0] * 100) / 100 : 0, severity: 'warning' };
    }

    case '5xx_count': {
      const count = await LogEntry.countDocuments({ ...match, statusCode: { $gte: 500 } });
      return { value: count, severity: count > 100 ? 'critical' : 'warning' };
    }

    case 'request_rate': {
      const [result] = await LogEntry.aggregate([
        { $match: match },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]);
      const elapsed = (Date.now() - windowStart.getTime()) / 1000;
      const rate = result?.count ? result.count / elapsed : 0;
      return { value: Math.round(rate * 100) / 100, severity: 'warning' };
    }

    case 'avg_latency': {
      const [result] = await LogEntry.aggregate([
        { $match: match },
        { $group: { _id: null, avg: { $avg: '$latency' } } },
      ]);
      return { value: result ? Math.round(result.avg * 100) / 100 : 0, severity: 'warning' };
    }

    case 'error_count': {
      const count = await LogEntry.countDocuments({ ...match, statusCode: { $gte: 400 } });
      return { value: count, severity: count > 100 ? 'critical' : 'warning' };
    }

    default:
      return { value: 0, severity: 'warning' };
  }
}

async function emitAlert(event: IAlertEventDocument) {
  try {
    await httpRequest(`${config.gatewayUrl}/api/v1/alerts/emit`, 'POST', {
      id: event._id.toString(),
      ruleId: event.ruleId.toString(),
      ruleName: event.ruleName,
      service: event.service,
      metric: event.metric,
      value: event.value,
      threshold: event.threshold,
      operator: event.operator,
      message: event.message,
      severity: event.severity,
      timestamp: event.timestamp,
    }, { 'Content-Type': 'application/json', 'X-Alert-Secret': config.alertSecret });
  } catch {
    // fire-and-forget, don't let emit failure break evaluation
  }
}

export async function evaluateAlertRules() {
  const rules = await AlertRule.find({ enabled: true }).lean();
  const now = Date.now();

  for (const rule of rules) {
    const windowStart = new Date(now - rule.windowSeconds * 1000);
    const { value } = await computeMetric(rule.metric, windowStart);
    const breached = compareThreshold(value, rule.threshold, rule.operator);

    if (!breached) continue;

    const cooldownStart = new Date(now - rule.coolDownSeconds * 1000);
    const recentAlert = await AlertEvent.findOne({
      ruleId: rule._id,
      timestamp: { $gte: cooldownStart },
    });

    if (recentAlert) continue;

    const severity = getSeverityThreshold(rule.metric, rule.operator, value, rule.threshold);

    const event = await AlertEvent.create({
      ruleId: rule._id,
      ruleName: rule.name,
      service: rule.service,
      metric: rule.metric,
      value,
      threshold: rule.threshold,
      operator: rule.operator,
      message: `[${severity.toUpperCase()}] ${rule.name}: ${rule.metric} = ${value} (threshold: ${rule.threshold})`,
      severity,
      timestamp: new Date(),
      acknowledged: false,
    });

    await emitAlert(event);
  }
}

export function createAlertEvaluationTimer(): NodeJS.Timeout {
  const intervalMs = config.alertIntervalMs;
  evaluateAlertRules();
  return setInterval(evaluateAlertRules, intervalMs);
}
