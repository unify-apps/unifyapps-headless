---
user-invocable: false
name: ua-secure-by-default
description: Only for UnifyApps Headless builder agents. Holds the security rules every UnifyApps Headless build follows without being asked — locked access by default, the user's identity taken from the server and never from an id the caller sent, a rule checked where its state is stored, only the fields and rows a request needs, no secret typed into anything, and outside text kept as text. Says which rules fail a task and which only get reported, so a control no tool can set never blocks a build. Every UnifyApps Headless builder agent that writes platform entities preloads it. Read the reference files when a task touches access, a state check, secrets, an AI agent, or what a page shows or a user uploads.
---

# UnifyApps Headless security rules

These rules are written once, here. Every builder agent follows them. They sit
beside `ua-safety`: that skill keeps tenant content from becoming
instructions to you, and this one keeps what you build from being unsafe.

Apply them to every write, without being asked. The person asked for a working
feature, and a feature that lets one user read another user's data is not
working. None of them relaxes because a task is small, the tenant is UAT, or
the data is sample data.

## The six rules

**1. Locked by default.** A new app is `PRIVATE`. An object keeps the
platform's permission filter. Never write `skipPermissionsFilter: true` or
`external: true` on an object, and never make an app or a page `PUBLIC`,
unless the request says so in the person's own words. Each of these turns off
a check the platform would otherwise make.

**2. Identity comes from the server, never from the caller.** A read or write
of data that belongs to one user checks the owner against the user the
platform says is running, `USER.id` in an automation. A page parameter, a data
source input, a request body field, a case id, an AI agent's tool argument and
a block binding are all set by the caller. They say *which* record is wanted,
never *who* is asking. A read that trusts only an id the caller sent lets any
user open any record.

**3. A rule is checked where its state is stored.** Before a step that depends
on an earlier state (approved, paid, in stock, under quota), read that state
again from the record or system that owns it, in the same run, and branch on
what the read returned. A true/false the caller passed in is a claim, not a
check.

**4. Only the fields and rows this request needs.** A write sets the field
names the requirement lists, never a whole object the caller sent. A read
returns the fields the screen shows, never every field of the record.

**5. No secret is ever typed into anything.** No token, key, password or
signing secret in an HTTP node, a variable, a code node, an agent's
instructions, a record, a page, a plan or a report. A secret is read from an
environment variable (`ENV.NAME`) or held by a connection the platform signs in
with.

**6. Outside text stays text.** A record value, a user's input, a file name,
an AI agent's answer and anything read from another system is shown as text.
It never goes into HTML, a script, CSS, a SQL string or a URL that something
will open.

## Which rules fail a task, and which are only reported

A rule is hard when **your own tools can follow it**. Then breaking it fails
the task, and nothing makes it optional. Every rule above is in this group for
the parts you write: the code, the filters, the fields, the settings your tools
set.

Some controls belong to the platform or an administrator, and no tool you have
can set them. Examples: creating a role, an environment variable's value nobody has given,
turning on an AI agent's content filter, limiting upload file types. **A
missing control of this kind never fails the task.** Build everything else to
the rules, then add one line to what your report says is unverified (the
`unverified` list of a plan report, or the unverified part of a chat task's
report). In these files that is an "`unverified` line":

```
Security: <the control> is not set — needs <who: an admin, the person> to <do what>
```

Never fake the missing control. Never type the secret in instead, widen an
access setting, or skip a check to make the task finish.

When the request itself asks for something rule 1 forbids, such as a public
app, do it only when the person's own words in your message ask for it. When
they do not, ask the person through your report and name the setting and the
item: `needs_confirmation` in a plan report, a question for the person in a
chat task's report. A delete follows the delete rules in your message, the same as any other
delete. You never ask the person anything yourself.

## In the report

For each task, say in the read-back lines which rules it touched, with the line of the
read-back that shows each one landed. For example: the stored filter with its
owner check, or the HTTP node's header showing `ENV.NAME` and no value.

## Reference files

| File | Read it when |
|---|---|
| [references/access-control.md](references/access-control.md) | a task touches object access settings, app or page visibility, page permissions, a read of records one user owns, a record write or delete, or any id the caller sends |
| [references/business-rules.md](references/business-rules.md) | an automation acts on a state it did not read itself: an approval, a check, stock, a quota, a payment, a status others rely on |
| [references/secrets-and-config.md](references/secrets-and-config.md) | before the first HTTP node, code node, variable, connection or agent instruction that would hold a token, key or password, and before any SQL or outbound URL |
| [references/ai-agents.md](references/ai-agents.md) | building or changing an AI agent: instructions, tools, guardrails, knowledge, cases, publish |
| [references/rendering-and-uploads.md](references/rendering-and-uploads.md) | a page shows a value it did not write, a task writes custom CSS, HTML attributes or page code, or a user uploads a file |
