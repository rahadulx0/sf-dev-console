import assert from 'node:assert/strict';
import test from 'node:test';
import { buildManifest } from './manifest.js';

test('buildManifest creates stable sorted Salesforce package XML', () => {
  const xml = buildManifest([
    { type: 'CustomObject', members: ['Quote__c', 'Account'] },
    { type: 'ApexClass', members: ['QuoteService', 'QuoteService'] },
  ], '65.0');
  assert.match(xml, /<Package xmlns="http:\/\/soap\.sforce\.com\/2006\/04\/metadata">/);
  assert.ok(xml.indexOf('<name>ApexClass</name>') < xml.indexOf('<name>CustomObject</name>'));
  assert.equal((xml.match(/<members>QuoteService<\/members>/g) || []).length, 1);
  assert.match(xml, /<version>65\.0<\/version>/);
});

test('buildManifest XML-escapes user-controlled component names', () => {
  const xml = buildManifest([{ type: 'CustomLabel', members: ['A&B<Label>'] }]);
  assert.match(xml, /A&amp;B&lt;Label&gt;/);
  assert.doesNotMatch(xml, /A&B<Label>/);
});

test('buildManifest omits empty selections', () => {
  const xml = buildManifest([{ type: 'ApexClass', members: [] }]);
  assert.doesNotMatch(xml, /<types>/);
});
