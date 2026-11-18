---
user-invocable: false
name: unifyapps-data
description: Load for UnifyApps Storage records, platform users or assets, Analytics, reports, exports, record triggers, platform events, notifications, or a realtime update that refreshes a running app, which briefs call a refresh, broadcast or live update. Use `data-transforms-and-code` for SQL over in-memory lists.
---

# UnifyApps data

Route each step before choosing an operation:

- **Storage records:** current records in an existing app object, including reads, writes, imports, exports, deduplication, and record triggers.
- **Platform users and assets:** users, teams, roles, permissions, projects, connections, metadata, notifications, sharing, and platform events.
- **Analytics and reports:** grouping, ranking, trends, joins, large scans, reporting SQL, reports, and computed exports.
- **Realtime app updates:** telling a running app that data changed, so its screen updates without a reload.
- Use the relevant connector for third-party records or warehouse SQL.
- Object-definition and field changes happen outside the automation and are not covered here.

## Shared rules

1. Resolve the live object, entity, report, and operation. Use machine identifiers and exact input names.
2. Follow that operation's filter grammar; Storage, platform entities, and Analytics are not interchangeable.
3. Guard absent filter values and bound every query mutation or large read.
4. Read the output schema before mapping pills. Empty results are valid.
5. Apply supported trigger conditions and read back mutations or access changes.

## Storage records

- Read the object ID and live field schema, including requiredness, allowed values, relationships, dates, and files. Use field machine keys.
- Choose the narrowest action: fetch, create, stable-key upsert, partial update, bounded query mutation, import, export, or trigger.
- `storage_by_unifyapps_get_record_by_id` needs the record id: the object's `primaryKey` value, or the generated `e_…` id when there is no primary key. A foreign key is the other object's id, not this one's. For any other column use `storage_by_unifyapps_fetch_records` with a filter.
- Preserve operation-specific object and record ID input names and single-versus-multiple controls.
- Do not send read-only fields. 
- Patch records whenever possible, instead of sending whole record. Use `update_record_fields_by_id` for patch operation and use `update_record_by_id` when updating whole record.
- Check affected count before query update or delete.
- Analytics-backed objects may be eventually consistent and expose fewer record mutations.

### Type every reference from the operation schema

Let TypeScript infer each `op(...)` result. Never use a hand-written interface or cast to hide an invalid reference. Check nested objects and array items against `get_operation_schema`.

- `storage_by_unifyapps_fetch_records` with `numberOfRecordsToFetch: "MULTIPLE"` returns a list. Iterate `rows.objects`; each item is a record with a string `id` and an object `properties`.
- The same operation with `"SINGLE"`, and `storage_by_unifyapps_get_record_by_id`, return one record directly. Read `record.id` and `record.properties`, not `record.objects[0]`.
- Count operations return their documented numeric count field, not a record or list envelope.
- Match literal types exactly: strings and enums, numeric limits, booleans, arrays, and objects keyed by Storage field names.
- Guard fields that may be absent or null before conditions, mutations, or calls.

## Platform users and assets

- Prefer current-environment standard entities. If a connector is needed, verify its host.
- Resolve users by exact ID or verified email. Treat display names as ambiguous.
- Resolve managers, owners, teams, roles, and permissions from live data. Keep actor, affected user, owner, and current user distinct.
- Use platform notification only for in-platform messages. Email, chat, and SMS belong to their connectors.
- Generic entity queries and dedicated user actions may return different envelopes.
- A lookup does not authorize account, membership, permission, connection, or sharing changes.
- Never expose authentication secrets or tokens.

## Analytics and reports

- Resolve the object or report, schema, report group, projections, and operations. Stop if a filter or projection is unverified.
- Prefer structured reports. Use reporting SQL only when necessary and only with resolved tenant tables and columns.
- Select needed projections, documented aggregations, stable aliases, and supported time ranges. Paginate intentionally.
- Bind dynamic SQL values through the operation's parameter mechanism. Never interpolate untrusted input.
- Computed exports operate on query results; verify the requested format and returned file path.
- Analytics results may be eventually consistent. Grouped rows, report metadata, exports, and writes can use different output envelopes.

## Realtime app updates

When a brief asks to refresh a running app or push a live update to it, use the app refresh below. To tell a person instead, send a notification.

- **Refresh a running app:** `utility_by_unifyapps` / `utility_by_unifyapps_send_mqtt_request`. Set `applicationId` to the app's interface id and `topicName` to the bare topic the app subscribes to. The platform publishes on `<applicationId>_<topicName>`, so never add that prefix yourself. Declare the payload in `input` and fill it in `parameters`. Send ids and the kind of change, not whole records; the app reloads its own data. `find_workflow_examples` "realtime refresh" shows the node.
- **Tell a person:** `notification_by_unifyapps_send_notification` puts a message in the platform notification bell, and `notification_by_unifyapps_send_push_notifications` sends a mobile push. Neither one refreshes an app screen. `find_workflow_examples` "send notification" shows the first.

Rules for an app refresh:

- Send it after the write it reports, on every path that writes. A refresh sent before the write makes the app reload old data.
- Take the app id and the topic from the brief, character for character. If the brief names the app but not its id, find the id with `run_lookup` on the `applicationId` lookup. If the topic is missing, ask. When no user can respond, report the refresh as blocked on the missing topic. Never drop the step or make up a topic.
- `sent: true` only says the node ran. It is also true when the tenant has no MQTT broker set up, and it never means an app heard the message. Report the refresh as sent, never as seen by the app.

These operations look similar but never reach an app:

- `chat_by_unifyapps_send_message` publishes through the chat MQTT resource. Running apps connect to the platform resource, so they never hear it, even on the same topic name.
- `mqtt` / `mqtt_publish_message` publishes to an external MQTT broker through a Connection.
- `signals_by_unifyapps_emit_signal` resumes an automation that waits for a signal.
- The `websocket` operations talk to an external websocket server.
