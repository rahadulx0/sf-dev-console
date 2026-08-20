import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMetadataContent } from './metadataNormalizer.js';

test('normalizes XML formatting and unique property order', () => {
  const source = Buffer.from('<CustomField xmlns="urn:test"><required>true</required><label>Customer Type</label></CustomField>');
  const target = Buffer.from(`<?xml version="1.0"?>
    <CustomField xmlns="urn:test">
      <label>Customer Type</label>
      <required>true</required>
    </CustomField>`);
  assert.equal(normalizeMetadataContent('Field.field-meta.xml', source), normalizeMetadataContent('Field.field-meta.xml', target));
});

test('preserves repeated element order where Salesforce semantics can depend on it', () => {
  const first = Buffer.from('<Layout><section>A</section><section>B</section></Layout>');
  const second = Buffer.from('<Layout><section>B</section><section>A</section></Layout>');
  assert.notEqual(normalizeMetadataContent('Page.layout-meta.xml', first), normalizeMetadataContent('Page.layout-meta.xml', second));
});

test('normalizes line endings in code files', () => {
  assert.equal(
    normalizeMetadataContent('Service.cls', Buffer.from('line 1\r\nline 2\r\n')),
    normalizeMetadataContent('Service.cls', Buffer.from('line 1\nline 2\n')),
  );
});
