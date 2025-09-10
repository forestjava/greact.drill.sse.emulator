import type { Response } from 'express';

export interface DataMessage {
  [tag: string]: number;
}

export interface EventMessage {
  version: '1.0.0';
  timestamp: number;
  currentIndex: number;
  values: DataMessage;
}

export interface SSEClient {
  id: string;
  response: Response;
  connectedAt: Date;
}
