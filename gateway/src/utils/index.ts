import { v4 as uuid } from 'uuid';

export function generateRequestId(): string {
  return uuid();
}

export function now(): number {
  return Date.now();
}
