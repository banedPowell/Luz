import {
	downloadFailure,
	type AnalyzedKind,
	type DownloadFailureReason,
	type DownloadItem,
	type DownloadJob,
	type DownloadState,
	type TrackTags,
} from '@luz/core';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from './client';
import { downloadItems, downloadJobs } from './schema';

export interface NewDownloadItem {
	sourceId: string;
	url?: string;
	thumbnailUrl?: string;
	title: string;
	tags: TrackTags;
	pathWithoutExtension: string;
}

export interface NewDownloadJob {
	url: string;
	kind: AnalyzedKind;
	title: string;
	items: NewDownloadItem[];
}

/** Writes a queued job and its items in one transaction, so the queue never sees half a job. */
export async function insertDownloadJob(
	db: Database,
	job: NewDownloadJob,
	nowMs: number,
): Promise<number> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(downloadJobs)
			.values({
				url: job.url,
				kind: job.kind,
				title: job.title,
				state: 'queued',
				createdAtMs: nowMs,
				itemCount: job.items.length,
			})
			.returning({ id: downloadJobs.id });
		if (!row) {
			throw new Error('The download job was not written');
		}
		await tx.insert(downloadItems).values(
			job.items.map((item, position): typeof downloadItems.$inferInsert => ({
				jobId: row.id,
				position,
				sourceId: item.sourceId,
				url: item.url ?? null,
				thumbnailUrl: item.thumbnailUrl ?? null,
				title: item.title,
				tags: item.tags,
				pathWithoutExtension: item.pathWithoutExtension,
				state: 'queued',
				log: [],
			})),
		);
		return row.id;
	});
}

/** Every job, the newest first, with its items in order. */
export async function listDownloadJobs(db: Database): Promise<DownloadJob[]> {
	const jobs = await db
		.select()
		.from(downloadJobs)
		.orderBy(desc(downloadJobs.createdAtMs), desc(downloadJobs.id));
	return withItems(db, jobs);
}

export async function findDownloadJob(db: Database, id: number): Promise<DownloadJob | undefined> {
	const jobs = await db.select().from(downloadJobs).where(eq(downloadJobs.id, id));
	return (await withItems(db, jobs))[0];
}

/** The job whose turn has come: the oldest one still queued. */
export async function nextQueuedJob(db: Database): Promise<DownloadJob | undefined> {
	const jobs = await db
		.select()
		.from(downloadJobs)
		.where(eq(downloadJobs.state, 'queued'))
		.orderBy(asc(downloadJobs.createdAtMs), asc(downloadJobs.id))
		.limit(1);
	return (await withItems(db, jobs))[0];
}

/** Starts a job still queued; false when it was cancelled in the meantime. */
export async function startDownloadJob(db: Database, id: number, nowMs: number): Promise<boolean> {
	const rows = await db
		.update(downloadJobs)
		.set({ state: 'running', startedAtMs: nowMs })
		.where(and(eq(downloadJobs.id, id), eq(downloadJobs.state, 'queued')))
		.returning({ id: downloadJobs.id });
	return rows.length > 0;
}

/** Ends a job; only a queued or running one, so a job already finished keeps its outcome. */
export async function finishDownloadJob(
	db: Database,
	id: number,
	state: DownloadState,
	nowMs: number,
	errorReason?: DownloadFailureReason,
): Promise<boolean> {
	const rows = await db
		.update(downloadJobs)
		.set({ state, finishedAtMs: nowMs, errorReason: errorReason ?? null })
		.where(and(eq(downloadJobs.id, id), inArray(downloadJobs.state, ['queued', 'running'])))
		.returning({ id: downloadJobs.id });
	return rows.length > 0;
}

export async function startDownloadItem(db: Database, itemId: number): Promise<void> {
	await db.update(downloadItems).set({ state: 'running' }).where(eq(downloadItems.id, itemId));
}

/** Ends an item, keeps its log and counts it in its job. */
export async function finishDownloadItem(
	db: Database,
	item: { id: number; jobId: number },
	outcome: { state: 'completed' | 'failed'; errorReason?: DownloadFailureReason; log: string[] },
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.update(downloadItems)
			.set({
				state: outcome.state,
				errorReason: outcome.errorReason ?? null,
				log: outcome.log,
			})
			.where(eq(downloadItems.id, item.id));
		await tx
			.update(downloadJobs)
			.set(
				outcome.state === 'completed'
					? { completedCount: sql`${downloadJobs.completedCount} + 1` }
					: { failedCount: sql`${downloadJobs.failedCount} + 1` },
			)
			.where(eq(downloadJobs.id, item.jobId));
	});
}

/**
 * Gives the unfinished items of a job a final state; failed ones count in the job, so its
 * counts still add up to its items.
 */
export async function endUnfinishedItems(
	db: Database,
	jobId: number,
	state: 'failed' | 'cancelled',
	errorReason?: DownloadFailureReason,
): Promise<void> {
	await db.transaction(async (tx) => {
		const ended = await tx
			.update(downloadItems)
			.set({ state, errorReason: errorReason ?? null })
			.where(
				and(
					eq(downloadItems.jobId, jobId),
					inArray(downloadItems.state, ['queued', 'running']),
				),
			)
			.returning({ id: downloadItems.id });
		if (state === 'failed' && ended.length > 0) {
			await tx
				.update(downloadJobs)
				.set({ failedCount: sql`${downloadJobs.failedCount} + ${ended.length}` })
				.where(eq(downloadJobs.id, jobId));
		}
	});
}

/** The ids of the jobs a stopped server left running. */
export async function runningDownloadJobIds(db: Database): Promise<number[]> {
	const rows = await db
		.select({ id: downloadJobs.id })
		.from(downloadJobs)
		.where(eq(downloadJobs.state, 'running'));
	return rows.map((row) => row.id);
}

type JobRow = typeof downloadJobs.$inferSelect;
type ItemRow = typeof downloadItems.$inferSelect;

async function withItems(db: Database, jobs: JobRow[]): Promise<DownloadJob[]> {
	if (jobs.length === 0) {
		return [];
	}
	const items = await db
		.select()
		.from(downloadItems)
		.where(
			inArray(
				downloadItems.jobId,
				jobs.map((job) => job.id),
			),
		)
		.orderBy(asc(downloadItems.jobId), asc(downloadItems.position));
	const byJob = Map.groupBy(items, (item) => item.jobId);
	return jobs.map((job) => toJob(job, byJob.get(job.id) ?? []));
}

function toJob(row: JobRow, items: ItemRow[]): DownloadJob {
	return {
		id: row.id,
		url: row.url,
		kind: row.kind,
		title: row.title,
		state: row.state,
		...(row.errorReason === null ? {} : { error: downloadFailure(row.errorReason) }),
		createdAt: row.createdAtMs,
		...(row.startedAtMs === null ? {} : { startedAt: row.startedAtMs }),
		...(row.finishedAtMs === null ? {} : { finishedAt: row.finishedAtMs }),
		itemCount: row.itemCount,
		completedCount: row.completedCount,
		failedCount: row.failedCount,
		items: items.map(toItem),
	};
}

function toItem(row: ItemRow): DownloadItem {
	return {
		id: row.id,
		position: row.position,
		sourceId: row.sourceId,
		...(row.url === null ? {} : { url: row.url }),
		...(row.thumbnailUrl === null ? {} : { thumbnailUrl: row.thumbnailUrl }),
		title: row.title,
		tags: row.tags,
		pathWithoutExtension: row.pathWithoutExtension,
		state: row.state,
		...(row.errorReason === null ? {} : { error: downloadFailure(row.errorReason) }),
		log: row.log,
	};
}
