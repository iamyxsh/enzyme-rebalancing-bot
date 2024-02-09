import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  ping(): string {
    return this.appService.ping();
  }

  @Get('/swap')
  swapTokens(): Promise<string> {
    return this.appService.swap();
  }
}
