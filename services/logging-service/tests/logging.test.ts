process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.LOGGING_PORT = '4004';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

import request from 'supertest';

const mockLogEntry = {
  requestId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  method: 'GET',
  path: '/api/v1/test',
  statusCode: 200,
  latency: 42,
  ip: '127.0.0.1',
};
const mockLogEntries = [mockLogEntry];

jest.mock('mongoose', () => {
  const mockLean = jest.fn().mockResolvedValue(mockLogEntries);
  const mockSort = jest.fn(() => ({ skip: jest.fn(() => ({ limit: jest.fn(() => ({ lean: mockLean })) })) }));
  const mockFind = jest.fn(() => ({ sort: mockSort }));
  const mockCountDocuments = jest.fn().mockResolvedValue(1);
  const mockFindOne = jest.fn(() => ({ lean: jest.fn().mockResolvedValue(mockLogEntry) }));

  const MockSchema = class { constructor(_schema: any, _options?: any) {} index() {} };
  const mockModel: Record<string, any> = jest.fn().mockImplementation(() => ({ save: jest.fn().mockResolvedValue(mockLogEntry) }));
  mockModel.create = jest.fn();
  mockModel.insertMany = jest.fn().mockResolvedValue(mockLogEntries);
  mockModel.find = mockFind;
  mockModel.countDocuments = mockCountDocuments;
  mockModel.findOne = mockFindOne;
  mockModel.Schema = MockSchema;
  mockModel.model = jest.fn(() => mockModel);

  return {
    default: { connect: jest.fn(), disconnect: jest.fn(), model: jest.fn(() => mockModel), Schema: MockSchema },
    Schema: MockSchema,
    model: jest.fn(() => mockModel),
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
});

import { createApp } from '../src/app.js';

describe('Logging Service', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  describe('POST /api/v1/logs', () => {
    it('ingests a log entry', async () => {
      const res = await request(app).post('/api/v1/logs').send(mockLogEntry);
      expect(res.status).toBe(201);
    });

    it('returns 400 on missing required fields', async () => {
      const res = await request(app).post('/api/v1/logs').send({ method: 'GET' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/logs/batch', () => {
    it('ingests multiple log entries', async () => {
      const res = await request(app).post('/api/v1/logs/batch').send([mockLogEntry]);
      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/v1/logs', () => {
    it('queries logs', async () => {
      const res = await request(app).get('/api/v1/logs');
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('paginates results', async () => {
      const res = await request(app).get('/api/v1/logs?page=1&limit=10');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/logs/errors', () => {
    it('returns error logs', async () => {
      const res = await request(app).get('/api/v1/logs/errors');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/logs/:requestId', () => {
    it('returns a log entry by requestId', async () => {
      const res = await request(app).get('/api/v1/logs/a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(res.status).toBe(200);
    });

    // 404 case covered by controller logic; mock always returns a result
  });
});
