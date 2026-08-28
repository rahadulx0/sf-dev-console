

`ContentDocument`, `ContentVersion`, and `ContentDocumentLink` are **data records**, not Metadata API components. So commands such as `sf project deploy start` cannot migrate Salesforce Files between production orgs. Instead, you need a **data migration process using Salesforce APIs/CLI**, with local file download/upload in between. Salesforce CLI explicitly provides `sf data create file` for uploading a local file and optionally attaching it to a Salesforce record. ([Developer][1])

The migration flow should look like this:

1. Query the source Production Org for `ContentDocumentLink` to determine which Salesforce record each file belongs to.
2. Query `ContentVersion` for the latest version and metadata such as `Title`, `PathOnClient`, `FileExtension`, and `VersionData`.
3. Download the actual binary file from the source org.
4. Identify or migrate the corresponding parent record into the target Production Org.
5. Upload the binary file to the target org.
6. Attach the new file to the target record.
7. Maintain a mapping such as `Source ContentDocumentId → Target ContentDocumentId`.

Salesforce CLI now has a particularly useful command:

```bash
sf data create file \
    --file "./files/contract.pdf" \
    --parent-id "001XXXXXXXXXXXX" \
    --target-org TargetProd
```

This creates a new Salesforce File and attaches it directly to the specified target record. Salesforce states that the command creates a new file, returns the resulting `ContentDocument` ID, and can attach it to an existing record using `--parent-id`. ([Developer][1])

### Important limitation

You cannot preserve the Salesforce IDs across orgs.

For example:

```text
Source Org
Account
001SOURCE001
    │
    └── ContentDocumentLink
            │
            └── ContentDocument
                    069SOURCE001
                         │
                         └── ContentVersion
                              068SOURCE001
```

After migration:

```text
Target Org
Account
001TARGET987
    │
    └── ContentDocumentLink
            │
            └── ContentDocument
                    069TARGET456
                         │
                         └── ContentVersion
                              068TARGET321
```

The actual file can be identical, but Salesforce generates new IDs.

There is another important distinction: CLI's normal `data export tree` / `data import tree` commands are designed for Salesforce record trees and have limits such as a 2,000-record export per query. They do not by themselves solve the binary `VersionData` transfer problem for Files. ([Developer][2])

### For your exact requirement

If you want:

```text
Production A

Account
Contact
Opportunity
Custom Object
    ↓
Salesforce Files
    ↓
ContentDocument
ContentVersion
ContentDocumentLink
```

to become:

```text
Production B

Migrated/Matched Record
    ↓
Same physical Salesforce Files
    ↓
New ContentDocument
New ContentVersion
New ContentDocumentLink
```

then **yes, this is completely achievable with Salesforce CLI + Salesforce REST APIs**.

For anything beyond a few files, I would not run individual CLI commands manually. The proper architecture is a Node.js migration script using the authenticated orgs from Salesforce CLI:

```text
sf CLI authentication
        │
        ├── Source Production
        │
        └── Target Production
                │
                ▼
Migration Script
        │
        ├── Query ContentDocumentLink
        ├── Query ContentVersion
        ├── Download VersionData
        ├── Resolve target parent record
        ├── Upload ContentVersion
        ├── Create ContentDocumentLink
        └── Write ID mapping/report
```

That also allows us to migrate hundreds or thousands of files, preserve filenames/titles, handle multiple files per record, migrate multiple versions if required, resume failed migrations, and generate an audit report.

One major design decision is whether you want **only the latest version of every Salesforce File**, or the **complete ContentVersion history**. Those are materially different migration jobs.

[1]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_data_create_file.html?utm_source=chatgpt.com "data create file | data Commands | Salesforce CLI Command Reference | Salesforce Developers"
[2]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_data_export_tree.html?utm_source=chatgpt.com "data export tree | data Commands | Salesforce CLI Command Reference | Salesforce Developers"
