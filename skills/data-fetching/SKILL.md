---
user-invocable: false
name: data-fetching
description: Read when fetching data from internal storage, internal analytics, external HTTP, GraphQL or SQL sources, or paginated connector actions.
---

This skill covers best practices while fetching data from internal or external sources. If you want
to check and find performance related issues or data inspection, check the corresponding skills:
`performance` and `external-data-inspection`.

## Pagination

External data is often paginated, and limited by the response payload sizes. It is important to fetch
all the data in a paginated manner to avoid missing data or hitting rate limits. Different resources might
have different pagination strategies - cursor based, limit-offset based, or other custom strategies, and it
is crucial that the pagination strategy is implemented correctly.

Check examples for different pagination strategies using the `find_workflow_examples` tool.

The next-page token in an output cannot always be passed straight back. A connector can return a value that
holds the token, such as a whole next-page URL, while the next call's input takes only the token itself.
Compare the output field with the input the next call expects. When they differ, derive the input from the
output in a code step and pass that. Sending the whole value makes the call fail.

For a connector action, read its input and output schemas and follow its own continuation contract. The OneDrive
pagination example shows one such case, where `skipToken` is parsed out of `@odata_nextLink`.

## Selective Data Fetching

Selective data fetching is always preferred when the shape of the data being fetched is known upfront.
Use sending required fields or pass proper projections whenever fetchng data to limit the amount of data fetched.

## Filtering and Processing Data

While fetching and processing data like filtering, sorting, grouping, prefer to do it at the source by passing
the right filters and sorts. For complex grouping, aggregations, timefiltering or other operations, prefer to use
analytics.

Whenever the processing is simple and filters or sorts can be constructed upfront, send those values while fetching
data, so that the source can do the processing for you. In case where this is NOT POSSIBLE, and you must fetch the
data and process yourself in memory, do it in chunks or pages to prevent memory exhaustion.

## Honest Failure reporting

Whenever fetching data, if some chunk or page fails while others pass, report it as such. Do not ignore failures,
or cover them up under blanket success. Even if errors are handled properly and the automation returns as success,
still the returned data payload should reflect partial or complete failures.
