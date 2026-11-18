---
user-invocable: false
name: object-schema-designer
description: "Plans UnifyApps Storage object schemas from business concepts and named access patterns: entity boundaries, relationships, constraints, indexes and semantic object ids, before object-storage-manager writes them, and draws or reviews an ERD. Use during brainstorming and planning whenever a change creates an object or restructures fields and relationships across existing objects, and when asked to draw, review or extend a data model."
license: MIT
---

# Database schema designer

Adapted for UnifyApps Storage objects from Softaworks' MIT-licensed
[object-schema-designer](https://github.com/softaworks/agent-toolkit/blob/main/skills/object-schema-designer/SKILL.md).

Design the data model from business concepts and access patterns, not from the
current page layout. This skill plans schemas only; `object-storage-manager`
owns the platform payload and write rules.

## Planning method

1. List the records the solution must create, update, search, filter, sort, and
   retain. State expected cardinality and which records change independently.
2. Give each independently searched or independently changing business concept
   its own object. Use a child object for an unbounded repeating group and a
   junction object for a many-to-many relationship.
3. Keep a bounded value embedded only when it is always read with its parent,
   shares the parent's lifecycle, and cannot grow without a practical limit.
4. Define relationships explicitly. Name the parent and child, cardinality,
   whether the relationship is required, and what should happen when the parent
   is removed. Do not duplicate mutable source data merely to avoid a read.
5. For every field, choose the narrowest JSON-Schema type that represents the
   value. Mark required, unique, primary-key, enum, secure, and hashing behavior
   only when the accepted requirements justify it.
6. Choose a natural primary key only when the domain supplies an unambiguous,
   stable unique value, and list it in `required` with the other required
   fields. Otherwise leave platform identity as the key.
7. Derive indexes from named access patterns: equality fields first, then the
   sort field, then range fields. Prefer one useful composite index over several overlapping
   indexes. Respect the platform limit of five custom indexes per object.
8. One field unique on its own is `uniqueKey` on that field. Several fields
   unique together (vendor + invoice number) are one index with
   `unique: true` over those fields, which counts toward the five. Never
   mark each of those fields `uniqueKey`: each would then be unique alone.
   A `uniqueKey` field allows only one row that leaves it out, so it is
   also `required`.
9. A field a lookup, a duplicate check or a filter reads is never secure: a
   secure value is stored encrypted and no filter matches it.

## Plan output

For each object, record:

- purpose and store;
- semantic object ID: `OBJ_<snake_case_slug>` derived from the singular
  business concept, with a concise domain qualifier when that ID already exists.
  When the objects the solution already links share another id style, such as
  `mw_<name>`, the new id follows that style instead. The builder passes the
  planned id exactly, so this is the one place the style is chosen;
- fields with type and justified constraints;
- relationships and lifecycle behavior;
- build order: the objects its lookups point at are built first, because a
  write refuses a lookup to an object that does not exist yet. When two
  objects point at each other, one of them adds its lookup last;
- concrete reads, filters, and sorts;
- indexes tied to those access patterns;
- expected volume or growth risk;
- read-back proof for schema, relationships, constraints, and indexes.

Prefer normalization for operational data. Denormalize only for a named,
measurable read pattern and document which field is authoritative and how the
copy stays synchronized.

## Reference files

| File | Read it when |
|---|---|
| [references/erd.md](references/erd.md) | designing a model from a requirement, drawing an ERD for a database that has none, reviewing a schema or ERD, or extending a live model: the seven questions every entity must answer and the query walk at scale |
