import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { SSEClient, EventMessage } from '../types/drilling-data.types';
import { NotionService } from '../notion/notion.service';
import { ENV } from '../config/env.config';

@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);
  private clients: Map<string, SSEClient> = new Map();
  private broadcastInterval: NodeJS.Timeout;
  private readonly intervalMs: number;

  constructor(private readonly notionService: NotionService) {
    this.intervalMs = parseInt(ENV.SSE_INTERVAL, 10);
    this.startBroadcast();
  }

  addClient(clientId: string, response: Response): void {
    const client: SSEClient = {
      id: clientId,
      response,
      connectedAt: new Date(),
    };

    this.clients.set(clientId, client);
    this.logger.log(
      `Клиент подключен: ${clientId}. Всего клиентов: ${this.clients.size}`,
    );

    // Настраиваем заголовки SSE
    response.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Обрабатываем отключение клиента
    response.on('close', () => {
      this.removeClient(clientId);
    });

    response.on('error', (error) => {
      this.logger.error(`Ошибка соединения с клиентом ${clientId}:`, error);
      this.removeClient(clientId);
    });
  }

  removeClient(clientId: string): void {
    if (this.clients.has(clientId)) {
      this.clients.delete(clientId);
      this.logger.log(
        `Клиент отключен: ${clientId}. Осталось клиентов: ${this.clients.size}`,
      );
    }
  }

  private startBroadcast(): void {
    this.logger.log(
      `Начинаем трансляцию данных с интервалом ${this.intervalMs}ms`,
    );

    this.broadcastInterval = setInterval(() => {
      this.broadcastDrillingData();
    }, this.intervalMs);
  }

  private stopBroadcast(): void {
    clearInterval(this.broadcastInterval);
    this.logger.log('Трансляция данных остановлена');
  }

  private broadcastDrillingData(): void {
    if (this.clients.size === 0) {
      return;
    }

    const drillingMessage = this.notionService.getNextDrillingData();
    const dataInfo = this.notionService.getDataInfo();

    const message: EventMessage = {
      version: '1.0.0',
      timestamp: Date.now(),
      currentIndex: dataInfo.currentIndex,
      values: drillingMessage,
    };

    this.broadcast(message);
  }

  private broadcast(message: EventMessage): void {
    this.clients.forEach((client) => {
      this.sendToClient(client, message);
    });
  }

  private sendToClient(client: SSEClient, message: any): void {
    const data = JSON.stringify(message);
    client.response.write(`data: ${data}\n\n`);
  }

  getStatus() {
    return {
      clientsCount: this.clients.size,
      intervalMs: this.intervalMs,
      clients: Array.from(this.clients.values()).map((client) => client.id),
    };
  }

  async refreshNotionData(): Promise<void> {
    await this.notionService.refreshData();
    this.logger.log('Данные Notion обновлены');
  }
}
