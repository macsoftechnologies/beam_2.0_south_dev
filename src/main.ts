process.env.TZ = 'Europe/Copenhagen';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import { setupSwagger } from './swagger/swagger.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 5200;
  app.enableCors({ origin: '*' });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, }),);
  app.enableCors();
  app.use('/subcontractors', express.static(join(process.cwd(), './uploads/subcontractors'), { redirect: false }));
  app.use('/observations', express.static(join(process.cwd(), './uploads/observations'), { redirect: false }));
  app.use('/incidents', express.static(join(process.cwd(), './uploads/incidents'), { redirect: false }));
  app.use('/signatures', express.static(join(process.cwd(), './uploads/signatures'), { redirect: false }));
  app.use('/uploads', express.static(join(process.cwd(), './uploads'), { redirect: false }));
  app.use(bodyParser.json({ limit: '100mb' }));
  app.use(bodyParser.urlencoded({ limit: '500mb', extended: true }));
  setupSwagger(app);
  await app.listen(port, () => { console.log(`🚀 App running on port ${port} in ${process.env.NODE_ENV} mode`); });
  console.log(`Application running on: ${await app.getUrl()}`);
  console.log(`Swagger docs:           ${await app.getUrl()}/api`);
}

bootstrap();