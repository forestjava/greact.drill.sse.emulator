import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { SSEClient, DrillingMessage } from '../types/drilling-data.types';
import { NotionService } from '../notion/notion.service';
import { ENV } from '../config/env.config';

@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);
  private clients: Map<string, SSEClient> = new Map();
  private broadcastInterval: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;

  constructor(private readonly notionService: NotionService) {
    this.intervalMs = parseInt(ENV.SSE_INTERVAL, 10);
  }

  addClient(clientId: string, response: Response): void {
    const client: SSEClient = {
      id: clientId,
      response,
      connectedAt: new Date(),
    };

    this.clients.set(clientId, client);
    this.logger.log(`Клиент подключен: ${clientId}. Всего клиентов: ${this.clients.size}`);

    // Запускаем трансляцию, если это первый клиент
    if (this.clients.size === 1) {
      this.startBroadcast();
    }

    // Настраиваем заголовки SSE
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Отправляем начальное сообщение
    this.sendToClient(client, {
      type: 'connected',
      data: {
        clientId,
        connectedAt: client.connectedAt.toISOString(),
        message: 'Подключение к SSE потоку данных буровой установки',
      },
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
      this.logger.log(`Клиент отключен: ${clientId}. Осталось клиентов: ${this.clients.size}`);

      // Останавливаем трансляцию, если клиентов не осталось
      if (this.clients.size === 0) {
        this.stopBroadcast();
      }
    }
  }

  private startBroadcast(): void {
    if (this.broadcastInterval) {
      return;
    }

    this.logger.log(`Начинаем трансляцию данных с интервалом ${this.intervalMs}ms`);

    this.broadcastInterval = setInterval(() => {
      this.broadcastDrillingData();
    }, this.intervalMs);

    // Отправляем первое сообщение сразу
    this.broadcastDrillingData();
  }

  private stopBroadcast(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
      this.logger.log('Трансляция данных остановлена');
    }
  }

  private broadcastDrillingData(): void {
    if (this.clients.size === 0) {
      return;
    }

    try {
      const drillingMessage = this.notionService.getNextDrillingData();
      const dataInfo = this.notionService.getDataInfo();

      const message = {
        type: 'drilling-data',
        data: drillingMessage,
        meta: {
          totalRows: dataInfo.totalRows,
          currentIndex: dataInfo.currentIndex,
          clientsCount: this.clients.size,
        },
      };

      this.broadcast(message);
    } catch (error) {
      this.logger.error('Ошибка при получении данных из Notion:', error);

      const errorMessage = {
        type: 'error',
        data: {
          message: 'Ошибка при получении данных из Notion',
          error: error.message,
          timestamp: Date.now(),
        },
      };

      this.broadcast(errorMessage);
    }
  }

  private broadcast(message: any): void {
    const clientsToRemove: string[] = [];

    this.clients.forEach((client) => {
      try {
        this.sendToClient(client, message);
      } catch (error) {
        this.logger.error(`Ошибка отправки данных клиенту ${client.id}:`, error);
        clientsToRemove.push(client.id);
      }
    });

    // Удаляем клиентов с ошибками
    clientsToRemove.forEach(clientId => {
      this.removeClient(clientId);
    });
  }

  private sendToClient(client: SSEClient, message: any): void {
    const data = JSON.stringify(message);
    client.response.write(`data: ${data}\n\n`);
  }

  getStatus() {
    return {
      clientsCount: this.clients.size,
      isActive: this.broadcastInterval !== null,
      intervalMs: this.intervalMs,
      clients: Array.from(this.clients.values()).map(client => ({
        id: client.id,
        connectedAt: client.connectedAt,
        duration: Date.now() - client.connectedAt.getTime(),
      })),
    };
  }

  async refreshNotionData(): Promise<void> {
    await this.notionService.refreshData();
    this.logger.log('Данные Notion обновлены');
  }
}
