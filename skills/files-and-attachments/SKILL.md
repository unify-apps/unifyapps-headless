---
user-invocable: false
name: files-and-attachments
description: Read when a workflow reads, creates, converts, downloads, uploads, stores, sends, or maps a file, attachment, or document. Covers file representations, producer and consumer contracts, access, and cardinality.
---

# Files and attachments

A platform file is a structured descriptor, not a URL. Read the producer output and consumer input schemas, then pass the declared representation:

- pass a file object when the consumer accepts a file or file-details object; when that object declares leaves, map each declared leaf from the producer's file rather than binding the whole object. The platform descriptor is `name`, `source`, `sourceType`, `fileType` with optional `mimeType`, `fileFormat`, `size`, but consumers declare a subset and producers add extras, so read both schemas each time and match by name;
- pass a public or signed URL only when the consumer accepts a URL and exposing the file is allowed;
- use base64 only when the consumer requires it and the payload is small enough;
- preserve the filename, media type, and one-versus-many shape when they affect downstream behavior.

`sourceType` says where `source` points. `CLOUD_STORAGE` means a storage key and `URL` means a link. The tenant's storage decides which one a file gets, so never reject a file for its `sourceType`.

A storage key such as `user-uploads/4/report.csv` is not a file path or a URL. A "file path" input wants a download URL (`/api/file/download/...`) and rejects a key with `Invalid file path format`, so for a stored file pass the file object instead.

Output field names vary. Never pass the whole node output or copy a path from another connector.

Prefer native file and document operations over code for download, upload, extraction, conversion, compression, and document handling. A filename extension does not prove the content type.

A private storage path is not a public URL. Do not forward an authenticated or expiring URL to a connector that cannot use its credentials. Materialize it through the correct file operation first.

In a durable record, keep a file descriptor or reference that can retrieve the file for the record's lifetime. Do not store a short-lived share-link URL as the only source. `sourceType: URL` does not prove durability; if that source URL expires, copy the file to durable storage and retain its descriptor.

Generate an access URL when the record is read or rendered. If the destination schema requires a stored URL, also keep its expiry and the durable source needed to refresh it. An expired URL and its timestamp cannot mint a new link. Some platform URLs are re-signed on each read; verify that behavior with the producer before relying on it.

One-file and many-file inputs often use different envelopes. Preserve the live shape. Prefer a destination list input; otherwise loop and define per-item failure behavior.

Before saving, verify the exact producer path, consumer representation, attachment envelope, filename and media type, access lifetime, payload size, and single-versus-multiple behavior.
