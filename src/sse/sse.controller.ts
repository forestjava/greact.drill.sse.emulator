import { Controller, Get, Res, Logger, Query, Post } from '@nestjs/common';
import type { Response } from 'express';
import { SseService } from './sse.service';
import { randomUUID } from 'crypto';

@Controller('sse')
export class SseController {
  private readonly logger = new Logger(SseController.name);

  constructor(private readonly sseService: SseService) {}

  @Get('stream')
  streamDrillingData(
    @Res() response: Response,
    @Query('clientId') clientId?: string,
  ): void {
    const id = clientId || randomUUID();

    this.logger.log(`Новое подключение к SSE потоку: ${id}`);
    this.sseService.addClient(id, response);
  }

  @Get('status')
  getStatus() {
    return {
      service: 'SSE Drilling Data Emulator',
      status: 'active',
      ...this.sseService.getStatus(),
    };
  }

  @Post('refresh')
  async refreshData() {
    await this.sseService.refreshNotionData();
    return {
      success: true,
      message: 'Данные из Notion успешно обновлены',
      timestamp: new Date().toISOString(),
    };
  }
}
