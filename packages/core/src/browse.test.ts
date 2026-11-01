import { describe, expect, it } from 'vite-plus/test';

import {
	albumListQuerySchema,
	artistListQuerySchema,
	formatDuration,
	libraryIdSchema,
	maxPageSize,
	trackListQuerySchema,
} from './browse.ts';

describe('list query schemas', () => {
	it('defaults to the first page, ascending, by the main field', () => {
		expect(trackListQuerySchema.parse({})).toEqual({
			sort: 'title',
			order: 'asc',
			page: 1,
			pageSize: 50,
		});
		expect(albumListQuerySchema.parse({}).sort).toBe('title');
		expect(artistListQuerySchema.parse({}).sort).toBe('name');
	});

	it('reads the values of a query string', () => {
		expect(
			trackListQuerySchema.parse({
				sort: 'duration',
				order: 'desc',
				page: '3',
				pageSize: '20',
			}),
		).toEqual({ sort: 'duration', order: 'desc', page: 3, pageSize: 20 });
	});

	it.each([
		{ sort: 'duration' },
		{ sort: 'name' },
		{ order: 'up' },
		{ page: '0' },
		{ page: '1.5' },
		{ page: 'two' },
		{ pageSize: String(maxPageSize + 1) },
	])('rejects the album query %j', (query) => {
		expect(albumListQuerySchema.safeParse(query).success).toBe(false);
	});

	it('only sorts artists by name', () => {
		expect(artistListQuerySchema.safeParse({ sort: 'year' }).success).toBe(false);
	});
});

describe('libraryIdSchema', () => {
	it('accepts positive integer ids only', () => {
		expect(libraryIdSchema.parse({ id: '12' })).toEqual({ id: 12 });
		expect(libraryIdSchema.safeParse({ id: '0' }).success).toBe(false);
		expect(libraryIdSchema.safeParse({ id: 'abc' }).success).toBe(false);
	});
});

describe('formatDuration', () => {
	it.each([
		[0, '0:00'],
		[4_400, '0:04'],
		[61_000, '1:01'],
		[599_600, '10:00'],
		[3_725_000, '1:02:05'],
	])('formats %i ms as %s', (durationMs, text) => {
		expect(formatDuration(durationMs)).toBe(text);
	});

	it('keeps an unknown duration unknown', () => {
		expect(formatDuration(null)).toBeNull();
	});
});
