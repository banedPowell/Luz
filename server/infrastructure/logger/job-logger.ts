import { getDb } from '../db/client'
import * as schema from '../db/schema'
import { eq, desc } from 'drizzle-orm'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export function logJob(jobId: string, level: LogLevel, message: string): void {
  const db = getDb()
  db.insert(schema.downloadJobLogs).values({
    jobId,
    level,
    message,
    createdAt: new Date().toISOString()
  }).run()
}

export function getJobLogs(jobId: string, limit = 200): { level: string, message: string, createdAt: string }[] {
  const db = getDb()
  return db.select()
    .from(schema.downloadJobLogs)
    .where(eq(schema.downloadJobLogs.jobId, jobId))
    .orderBy(desc(schema.downloadJobLogs.id))
    .limit(limit)
    .all()
    .reverse()
}

export const logger = {
  debug: (jobId: string, msg: string) => logJob(jobId, 'debug', msg),
  info: (jobId: string, msg: string) => logJob(jobId, 'info', msg),
  warn: (jobId: string, msg: string) => logJob(jobId, 'warn', msg),
  error: (jobId: string, msg: string) => logJob(jobId, 'error', msg)
}
