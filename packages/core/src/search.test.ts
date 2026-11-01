import { describe, expect, it } from 'vite-plus/test';

import { librarySearchQuerySchema, maxSearchQueryLength, searchKey } from './search.ts';

describe('search query schema', () => {
	it('defaults to an empty query and trims the one given', () => {
		expect(librarySearchQuerySchema.parse({})).toEqual({ q: '' });
		expect(librarySearchQuerySchema.parse({ q: '  daft punk \n' })).toEqual({ q: 'daft punk' });
	});

	it('limits the length after trimming', () => {
		const longest = 'a'.repeat(maxSearchQueryLength);
		expect(librarySearchQuerySchema.parse({ q: ` ${longest} ` }).q).toBe(longest);
		expect(librarySearchQuerySchema.safeParse({ q: `${longest}a` }).success).toBe(false);
	});

	it('rejects a repeated parameter', () => {
		expect(librarySearchQuerySchema.safeParse({ q: ['a', 'b'] }).success).toBe(false);
	});
});

describe('searchKey', () => {
	it('ignores case and accents', () => {
		expect(searchKey('Beyoncé')).toBe('beyonce');
		expect(searchKey('ÉLAN Vital')).toBe('elan vital');
		expect(searchKey('Motörhead')).toBe(searchKey('MOTORHEAD'));
	});

	it('gives composed and decomposed accents the same key', () => {
		expect(searchKey('Café')).toBe(searchKey('Café'));
	});

	it('folds compatibility characters and collapses whitespace', () => {
		expect(searchKey('ＡＢＣ')).toBe('abc');
		expect(searchKey('  Sigur\t  Rós ')).toBe('sigur ros');
	});

	it('keeps punctuation and scripts without case', () => {
		expect(searchKey('AC/DC')).toBe('ac/dc');
		expect(searchKey('坂本龍一')).toBe('坂本龍一');
	});
});
