/**
 * Unit tests for shared utility functions
 * Run: deno test --allow-all tests/shared_test.ts
 */

import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  calculateReadingTime,
  deepClone,
  formatDate,
  generateId,
  generateSlug,
  stripHtml,
  truncate,
} from '../shared/mod.ts';

// --- generateSlug ---

Deno.test('generateSlug: basic title', () => {
  assertEquals(generateSlug('Hello World'), 'hello-world');
});

Deno.test('generateSlug: special characters', () => {
  assertEquals(generateSlug('Hello! @World #2024'), 'hello-world-2024');
});

Deno.test('generateSlug: accented characters', () => {
  assertEquals(generateSlug('Café Résumé'), 'cafe-resume');
});

Deno.test('generateSlug: multiple spaces and dashes', () => {
  assertEquals(generateSlug('hello   ---   world'), 'hello-world');
});

Deno.test('generateSlug: truncates to 100 chars', () => {
  const longTitle = 'a'.repeat(200);
  assertEquals(generateSlug(longTitle).length, 100);
});

Deno.test('generateSlug: empty string', () => {
  assertEquals(generateSlug(''), '');
});

// --- calculateReadingTime ---

Deno.test('calculateReadingTime: short content', () => {
  assertEquals(calculateReadingTime('Hello world'), 1);
});

Deno.test('calculateReadingTime: ~200 words = 1 min', () => {
  const words = Array(200).fill('word').join(' ');
  assertEquals(calculateReadingTime(words), 1);
});

Deno.test('calculateReadingTime: ~400 words = 2 min', () => {
  const words = Array(400).fill('word').join(' ');
  assertEquals(calculateReadingTime(words), 2);
});

Deno.test('calculateReadingTime: 201 words rounds up', () => {
  const words = Array(201).fill('word').join(' ');
  assertEquals(calculateReadingTime(words), 2);
});

// --- formatDate ---

Deno.test('formatDate: long format', () => {
  const result = formatDate('2024-01-15T00:00:00Z', 'long');
  assertEquals(result.includes('January'), true);
  assertEquals(result.includes('15'), true);
  assertEquals(result.includes('2024'), true);
});

Deno.test('formatDate: short format', () => {
  const result = formatDate('2024-01-15T00:00:00Z', 'short');
  assertEquals(result.includes('Jan'), true);
  assertEquals(result.includes('2024'), true);
});

Deno.test('formatDate: accepts Date object', () => {
  const result = formatDate(new Date('2024-06-01'), 'short');
  assertEquals(typeof result, 'string');
  assertEquals(result.length > 0, true);
});

// --- truncate ---

Deno.test('truncate: short string unchanged', () => {
  assertEquals(truncate('hello', 10), 'hello');
});

Deno.test('truncate: long string truncated with ellipsis', () => {
  const result = truncate('hello world this is long', 10);
  assertEquals(result.endsWith('…'), true);
  assertEquals(result.length <= 11, true); // 10 + ellipsis
});

Deno.test('truncate: exact length unchanged', () => {
  assertEquals(truncate('12345', 5), '12345');
});

// --- stripHtml ---

Deno.test('stripHtml: removes tags', () => {
  assertEquals(stripHtml('<p>Hello <b>World</b></p>'), 'Hello World');
});

Deno.test('stripHtml: normalizes whitespace', () => {
  assertEquals(stripHtml('<p>Hello</p>  <p>World</p>'), 'Hello World');
});

Deno.test('stripHtml: plain text unchanged', () => {
  assertEquals(stripHtml('Hello World'), 'Hello World');
});

// --- generateId ---

Deno.test('generateId: returns non-empty string', () => {
  const id = generateId();
  assertNotEquals(id, '');
  assertEquals(typeof id, 'string');
});

Deno.test('generateId: unique IDs', () => {
  const ids = new Set(Array.from({ length: 100 }, () => generateId()));
  assertEquals(ids.size, 100);
});

// --- deepClone ---

Deno.test('deepClone: creates independent copy', () => {
  const original = { a: 1, b: { c: 2 } };
  const cloned = deepClone(original);
  cloned.b.c = 99;
  assertEquals(original.b.c, 2);
  assertEquals(cloned.b.c, 99);
});

Deno.test('deepClone: handles arrays', () => {
  const original = [1, [2, 3]];
  const cloned = deepClone(original);
  assertEquals(cloned, [1, [2, 3]]);
});
