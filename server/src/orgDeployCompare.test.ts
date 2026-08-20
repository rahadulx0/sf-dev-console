import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildDeployArgs,
  buildDeployScope,
  buildRetrieveArgs,
  compareComponentGroups,
  confirmationPhrase,
  groupMetadataFiles,
  hashGroups,
  safeSelections,
  includeFieldLevelSecurity,
  includeRequiredFieldSecurityKeys,
  safeTestLevel,
  safeTests,
  scanDependencies,
  stripUnpackagedWrapper,
} from './orgDeployCompare.js';

const TYPE_MAP = {
  classes: 'ApexClass',
  triggers: 'ApexTrigger',
  lwc: 'LightningComponentBundle',
  aura: 'AuraDefinitionBundle',
  permissionsets: 'PermissionSet',
  objects: 'CustomObject',
};

test('groupMetadataFiles groups a flat Apex class into one component', () => {
  const groups = groupMetadataFiles(['classes/MyClass.cls', 'classes/MyClass.cls-meta.xml'], TYPE_MAP);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0], {
    key: 'classes/MyClass',
    type: 'ApexClass',
    fullName: 'MyClass',
    files: ['classes/MyClass.cls', 'classes/MyClass.cls-meta.xml'],
  });
});

test('groupMetadataFiles groups a custom field nested under its object', () => {
  const groups = groupMetadataFiles(
    ['objects/Account/fields/My_Field__c.field-meta.xml', 'objects/Account/Account.object-meta.xml'],
    TYPE_MAP,
  );
  const field = groups.find((g) => g.type === 'CustomField');
  const object = groups.find((g) => g.type === 'CustomObject');
  assert.equal(field?.fullName, 'Account.My_Field__c');
  assert.equal(object?.fullName, 'Account');
});

test('groupMetadataFiles treats an LWC bundle as a single deployable component', () => {
  const groups = groupMetadataFiles(
    ['lwc/myComp/myComp.js', 'lwc/myComp/myComp.html', 'lwc/myComp/myComp.js-meta.xml'],
    TYPE_MAP,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].type, 'LightningComponentBundle');
  assert.equal(groups[0].fullName, 'myComp');
  assert.equal(groups[0].files.length, 3);
});

test('stripUnpackagedWrapper strips any number of leading unpackaged segments', () => {
  assert.deepEqual(stripUnpackagedWrapper(['classes', 'A.cls']), ['classes', 'A.cls']);
  assert.deepEqual(stripUnpackagedWrapper(['unpackaged', 'classes', 'A.cls']), ['classes', 'A.cls']);
  assert.deepEqual(stripUnpackagedWrapper(['unpackaged', 'unpackaged', 'classes', 'A.cls']), ['classes', 'A.cls']);
  assert.deepEqual(stripUnpackagedWrapper(['unpackaged']), ['unpackaged']);
});

test('groupMetadataFiles unwraps the real retrieval layout (double `unpackaged` root, echoed package.xml)', () => {
  const groups = groupMetadataFiles(
    [
      'unpackaged/unpackaged/classes/ApiResponse.cls',
      'unpackaged/unpackaged/classes/ApiResponse.cls-meta.xml',
      'unpackaged/unpackaged/package.xml',
    ],
    TYPE_MAP,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].type, 'ApexClass');
  assert.equal(groups[0].fullName, 'ApiResponse');
  // The physical (wrapped) paths are preserved so hashing/copying can still find the real files.
  assert.deepEqual(groups[0].files, ['unpackaged/unpackaged/classes/ApiResponse.cls', 'unpackaged/unpackaged/classes/ApiResponse.cls-meta.xml']);
});

test('groupMetadataFiles labels unrecognized folders generically instead of failing', () => {
  const groups = groupMetadataFiles(['genAiPlugins/MyPlugin.genAiPlugin-meta.xml'], TYPE_MAP);
  assert.equal(groups[0].type, 'Unknown (folder: genAiPlugins)');
  assert.equal(groups[0].fullName, 'MyPlugin');
});

test('hashGroups and compareComponentGroups classify new/changed/identical correctly', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-console-test-'));
  try {
    const sourceDir = path.join(root, 'source');
    const targetDir = path.join(root, 'target');
    await mkdir(path.join(sourceDir, 'classes'), { recursive: true });
    await mkdir(path.join(targetDir, 'classes'), { recursive: true });
    await writeFile(path.join(sourceDir, 'classes', 'Same.cls'), 'body A');
    await writeFile(path.join(targetDir, 'classes', 'Same.cls'), 'body A');
    await writeFile(path.join(sourceDir, 'classes', 'Changed.cls'), 'body v2');
    await writeFile(path.join(targetDir, 'classes', 'Changed.cls'), 'body v1');
    await writeFile(path.join(sourceDir, 'classes', 'New.cls'), 'body new');

    const sourceGroups = groupMetadataFiles(['classes/Same.cls', 'classes/Changed.cls', 'classes/New.cls'], TYPE_MAP);
    const targetGroups = groupMetadataFiles(['classes/Same.cls', 'classes/Changed.cls'], TYPE_MAP);
    const sourceHashes = await hashGroups(sourceGroups, sourceDir);
    const targetHashes = await hashGroups(targetGroups, targetDir);
    const rows = compareComponentGroups(sourceGroups, targetGroups, sourceHashes, targetHashes, true);

    const byName = Object.fromEntries(rows.map((r) => [r.fullName, r.status]));
    assert.equal(byName.Same, 'identical');
    assert.equal(byName.Changed, 'changed');
    assert.equal(byName.New, 'new');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('compareComponentGroups marks everything unknown when the target retrieval failed', () => {
  const groups = groupMetadataFiles(['classes/A.cls'], TYPE_MAP);
  const rows = compareComponentGroups(groups, [], new Map([['classes/A', 'hash']]), new Map(), false);
  assert.equal(rows[0].status, 'unknown');
});

test('buildDeployScope copies only files for the selected keys and writes a scoped package.xml', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-console-test-'));
  try {
    const sourceDir = path.join(root, 'source');
    const destDir = path.join(root, 'dest');
    await mkdir(path.join(sourceDir, 'classes'), { recursive: true });
    await writeFile(path.join(sourceDir, 'classes', 'Keep.cls'), 'keep me');
    await writeFile(path.join(sourceDir, 'classes', 'Drop.cls'), 'drop me');
    const groups = groupMetadataFiles(['classes/Keep.cls', 'classes/Drop.cls'], TYPE_MAP);
    const copied = await buildDeployScope(sourceDir, groups, new Set(['classes/Keep']), destDir);
    assert.equal(copied, 1);
    assert.equal(await readFile(path.join(destDir, 'classes', 'Keep.cls'), 'utf8'), 'keep me');
    await assert.rejects(readFile(path.join(destDir, 'classes', 'Drop.cls')));
    const manifest = await readFile(path.join(destDir, 'package.xml'), 'utf8');
    assert.match(manifest, /<members>Keep<\/members>/);
    assert.doesNotMatch(manifest, /Drop/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildDeployScope strips the unpackaged wrapper when copying so the scope directory is a clean metadata root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-console-test-'));
  try {
    const sourceDir = path.join(root, 'source');
    const destDir = path.join(root, 'dest');
    await mkdir(path.join(sourceDir, 'unpackaged', 'unpackaged', 'classes'), { recursive: true });
    await writeFile(path.join(sourceDir, 'unpackaged', 'unpackaged', 'classes', 'ApiResponse.cls'), 'public class ApiResponse {}');
    const groups = groupMetadataFiles(['unpackaged/unpackaged/classes/ApiResponse.cls'], TYPE_MAP);
    await buildDeployScope(sourceDir, groups, new Set(groups.map((g) => g.key)), destDir);
    assert.equal(await readFile(path.join(destDir, 'classes', 'ApiResponse.cls'), 'utf8'), 'public class ApiResponse {}');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildDeployScope creates explicit post-destructive changes without copying target-only files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-console-test-'));
  try {
    const sourceDir = path.join(root, 'source');
    const destDir = path.join(root, 'dest');
    await mkdir(sourceDir, { recursive: true });
    const targetOnly = {
      key: 'fields/Account.Old__c',
      type: 'CustomField',
      fullName: 'Account.Old__c',
      files: ['objects/Account/fields/Old__c.field-meta.xml'],
    };
    await buildDeployScope(sourceDir, [targetOnly], new Set([targetOnly.key]), destDir, new Set([targetOnly.key]));
    const regular = await readFile(path.join(destDir, 'package.xml'), 'utf8');
    const destructive = await readFile(path.join(destDir, 'destructiveChangesPost.xml'), 'utf8');
    assert.doesNotMatch(regular, /Old__c/);
    assert.match(destructive, /<members>Account\.Old__c<\/members>/);
    assert.match(destructive, /<name>CustomField<\/name>/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scanDependencies flags a referenced Apex class as confirmed-missing only when the target list excludes it', () => {
  const groups = [
    {
      key: 'permissionsets/MyPerm',
      type: 'PermissionSet',
      fullName: 'MyPerm',
      files: [],
      text: '<apexClass>MissingHelper</apexClass><apexClass>KnownHelper</apexClass>',
    },
  ];
  const deps = scanDependencies(groups, new Set(['MyPerm']), new Set(['KnownHelper']), null);
  const byName = Object.fromEntries(deps.map((d) => [d.relatedName, d.confidence]));
  assert.equal(byName.MissingHelper, 'confirmed-missing');
  assert.equal(byName.KnownHelper, 'informational');
});

test('scanDependencies reports potential when the target list is unavailable', () => {
  const groups = [
    { key: 'lwc/myComp', type: 'LightningComponentBundle', fullName: 'myComp', files: [], text: "@salesforce/apex/Helper.getData" },
  ];
  const deps = scanDependencies(groups, new Set(['myComp']), null, null);
  assert.equal(deps[0].confidence, 'potential');
  assert.equal(deps[0].relatedType, 'ApexClass');
});

test('safeSelections rejects an empty selection and validates member names', () => {
  const safeType = (v: unknown) => {
    if (typeof v !== 'string' || !/^[A-Za-z]+$/.test(v)) throw new Error('bad type');
    return v;
  };
  assert.throws(() => safeSelections([], safeType));
  assert.throws(() => safeSelections([{ type: 'ApexClass', members: [] }], safeType));
  assert.deepEqual(safeSelections([{ type: 'ApexClass', members: ['MyClass'] }], safeType), [
    { type: 'ApexClass', members: ['MyClass'] },
  ]);
});

test('includeFieldLevelSecurity adds all profiles and permission sets when custom fields are selected', () => {
  const result = includeFieldLevelSecurity([
    { type: 'CustomField', members: ['Account.Customer_Tier__c'] },
    { type: 'Profile', members: ['Admin'] },
    { type: 'ApexClass', members: ['AccountService'] },
  ]);
  assert.equal(result.included, true);
  assert.deepEqual(result.selections, [
    { type: 'CustomField', members: ['Account.Customer_Tier__c'] },
    { type: 'ApexClass', members: ['AccountService'] },
    { type: 'Profile', members: ['*'] },
    { type: 'PermissionSet', members: ['*'] },
  ]);
});

test('includeFieldLevelSecurity leaves non-field selections unchanged', () => {
  const selections = [{ type: 'ApexClass', members: ['AccountService'] }];
  assert.deepEqual(includeFieldLevelSecurity(selections), { selections, included: false });
});

test('includeRequiredFieldSecurityKeys makes retrieved FLS rows mandatory with a selected field', () => {
  const rows = [
    { key: 'fields/Account.Tier', type: 'CustomField', fullName: 'Account.Tier__c', files: [], sourceExists: true, targetExists: false, status: 'new' as const },
    { key: 'profiles/Admin', type: 'Profile', fullName: 'Admin', files: [], sourceExists: true, targetExists: true, status: 'changed' as const },
    { key: 'permissionsets/Sales', type: 'PermissionSet', fullName: 'Sales', files: [], sourceExists: true, targetExists: true, status: 'changed' as const },
    { key: 'classes/Helper', type: 'ApexClass', fullName: 'Helper', files: [], sourceExists: true, targetExists: true, status: 'identical' as const },
  ];
  assert.deepEqual(
    [...includeRequiredFieldSecurityKeys(rows, new Set(['fields/Account.Tier']))].sort(),
    ['fields/Account.Tier', 'permissionsets/Sales', 'profiles/Admin'],
  );
  assert.deepEqual([...includeRequiredFieldSecurityKeys(rows, new Set(['classes/Helper']))], ['classes/Helper']);
});

test('safeTestLevel falls back to RunLocalTests for unknown values, and safeTests filters bad identifiers', () => {
  assert.equal(safeTestLevel('NotReal'), 'RunLocalTests');
  assert.equal(safeTestLevel('RunSpecifiedTests'), 'RunSpecifiedTests');
  assert.deepEqual(safeTests(['GoodTest', '1BadStart', 'has space', undefined]), ['GoodTest']);
});

test('confirmationPhrase and command builders produce the expected shape', () => {
  assert.equal(confirmationPhrase('deploy', 'target-org'), 'DEPLOY target-org');
  assert.equal(confirmationPhrase('validate', 'target-org'), 'VALIDATE target-org');
  assert.deepEqual(buildRetrieveArgs('/tmp/pkg.xml', 'source-org', '/tmp/out'), [
    'project', 'retrieve', 'start', '--manifest', '/tmp/pkg.xml', '--target-org', 'source-org', '--target-metadata-dir', '/tmp/out', '--unzip',
  ]);
  assert.deepEqual(buildDeployArgs('validate', '/tmp/scope', 'target-org', 'RunSpecifiedTests', ['T1', 'T2']), [
    'project', 'deploy', 'validate', '--metadata-dir', '/tmp/scope', '--target-org', 'target-org',
    '--test-level', 'RunSpecifiedTests', '--async', '--tests', 'T1', '--tests', 'T2',
  ]);
  assert.deepEqual(buildDeployArgs('validate', '/tmp/scope', 'target-org', 'NoTestRun', []), [
    'project', 'deploy', 'validate', '--metadata-dir', '/tmp/scope', '--target-org', 'target-org',
    '--test-level', 'RunLocalTests', '--async',
  ]);
  assert.deepEqual(buildDeployArgs('validate', '/tmp/scope', 'sandbox-org', 'NoTestRun', [], true), [
    'project', 'deploy', 'start', '--metadata-dir', '/tmp/scope', '--target-org', 'sandbox-org',
    '--test-level', 'NoTestRun', '--async', '--dry-run',
  ]);
  assert.deepEqual(buildDeployArgs('deploy', '/tmp/scope', 'target-org', 'NoTestRun', []), [
    'project', 'deploy', 'start', '--metadata-dir', '/tmp/scope', '--target-org', 'target-org',
    '--test-level', 'NoTestRun', '--async',
  ]);
});
