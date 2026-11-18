---
user-invocable: false
name: dates-and-time
description: MANDATORY before choosing query windows or schedules, using date_diff, comparing dates, converting dates and epochs, formatting or transforming dates in code nodes, or passing a maybe-absent date into a node. Covers accepted representations, units, ordering, and missing-value behavior.
---

# Dates and time

Read the operation schema. Preserve an accepted source representation and never
format a date for display before calculation.

Platform date values and numeric date strings are epoch milliseconds. Do not treat them
as epoch seconds. Convert only when the source contract explicitly uses another unit.
ISO strings with an offset or `Z` keep that offset; a date-only string represents midnight UTC.

For `date_diff`, pass the original epoch-millisecond or supported ISO values.
The result is `date2 - date1`, truncated toward zero in the explicit `outputUnit`.
A negative result is valid. Do not wrap either input in spreadsheet functions such as `TEXT`.

For `date_to_epoch`, pass a string and set `epochUnit`; missing, blank, or non-string input
silently becomes current time. For `epoch_to_date`, pass the declared unit; output is UTC ISO-8601.

A required date input can still receive no value from an optional column, an empty search result,
or an unresolved pill. Branch before the date node when absence is possible. Never let absence
silently mean "now" unless that is the stated business rule.

## Date format and handling in Code

Format dates in Groovy with `java.time`. Import the `java.time` classes first, then use them:

```groovy
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

def today = ZonedDateTime.now(ZoneId.of('Asia/Kolkata')).format(DateTimeFormatter.ofPattern('yyyy-MM-dd'))
```

# Deciding Polling and Scheduling

Recommend the user about polling durations and scheduling intervals with reasonable options. Never assume values,
and never silently accept connector defaults. These are important, and significantly impact
the workflow runs.

## Supported cron syntax

Schedules use standard Unix cron: 5 fields, `minute hour day-of-month month day-of-week`.
Allowed: wildcard `*`, list `,`, range `-`, step `/`, and `L` in day-of-month (last day of the month).
Use numbers for months (`1-12`) and weekdays (`0-7`; `0` or `7` = Sunday, `1` = Monday).

Not allowed: Quartz cron (6 or 7 fields, with seconds or year), macros such as `@daily` or `@monthly`,
`W` (nearest weekday), `LW` (last weekday of month), `5L`-style last day-of-week, `#` (nth day-of-week),
and `?` (no specific value).

If the user's schedule needs a not-allowed feature, tell them before building and offer the closest
allowed option (for example `0 18 L * *` for the last calendar day at 18:00), or a broader schedule
with a date check as below. Never silently use a different schedule. After saving, read back the saved
trigger and describe the schedule and its next run from what was saved.

Not every cron or schedule is supported out of the box. Use a slightly broader schedule
and stop early before business actions when its date or business conditions do not match;
never silently substitute a different schedule. Check examples by keyword: `calendar guard`,
`last working day`, `nth weekday`, `last Friday`, `holiday calendar`, `anchored schedule`, `quarter end`.
