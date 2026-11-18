# Automations the app calls

The workflows a page triggers: the platform's workflow checks plus limits read from their code.

119 rules: P0 0, P1 33, P2 61, P3 25.

## Contents

- P1
- P2
- P3

## P1

- Turn off input and output capture on nodes that carry secret keys so reporting never ingests them.
- Give every While loop a real exit or Max Iterations; a condition comparing a value with itself never ends.
- Turn on distribute load for Call Automation (Batch) when it waits for completion or runs IN_MEMORY.
- Split an automation that reaches 175 nodes; it slows execution and strains the environment.
- Define every environment variable an automation reads on the Environment Variables page.
- Never hard-code passwords, secrets, tokens, client or account ids, endpoints or auth values in node inputs.
- Don't nest a scope inside another scope.
- Turn on DLQ tracking (enableDlqTracking) when polling event streams, or failed events are lost.
- Never run an analytics query inside a For Each loop.
- Never schedule an automation more often than once a minute.
- Map only a List or Array into a For Each loop.
- Give every Wait for Signal action a non-zero timeout.
- Never create records in the same object from parallel branches.
- Never create in one parallel branch while another updates the same object.
- Build the full list and write Excel once outside the loop, never row by row inside it.
- Use Iterate over rows, not Extract data from sheet, for Excel files that can be large.
- Turn on streaming for Excel Iterate over rows.
- Prefer structured filters or parameterised queries over raw SQL execute actions.
- Break any Call Automation cycle where a downstream automation calls this one back.
- Never write to the object or stream that triggered the automation, directly or through a callee.
- Never call Thread.sleep or similar in Groovy code; use a Delay node, a signal or a retry policy.
- Assume an automation an app or agent calls runs IN_MEMORY: 5-minute timeout and 256 MiB budget, whatever mode it shows.
- Keep waits in an automation an app calls under 2 minutes; put long waits in the node's retry config.
- Keep an endpoint-fronted automation shorter than the endpoint timeout (often 30 s), or its runs are cancelled.
- Never have an automation call itself to fetch the next page; page inside one run with a loop.
- Pass a whole list to a child automation instead of calling it once per record; call it async if nothing reads the output.
- Count database and external calls per run, not loop turns; a loop that batches but still calls once per item is not fixed.
- Give every record read in an automation a date filter, with a default range when the caller passes none.
- Process and write each batch as you go; never collect every row into one list first.
- Loop over a list rather than until a condition; if a condition loop stays, cap its turns.
- Set a failure alert on the Alerts tab for every scheduled or client-facing automation.
- Give LLM steps an error path, and handle predictable bad input (a locked PDF) without crashing the run.
- Download a file once before the loop, never inside it.

## P2

- Remove or disable automation nodes whose output nothing downstream reads.
- Keep node retries to 5 or fewer, initial delay up to 1 s, max delay up to 30 s, backoff factor 1 to 5.
- Read the create-record node's output; never fetch the same record by id right after creating it.
- Run a Custom HTTP call asynchronously when its timeout is 60 s or more.
- Give every analytics SQL query a WHERE or a LIMIT clause.
- Nest loops at most two deep; move a third level into a sub-automation.
- Use Count records, not Fetch records, when only the count is read.
- Turn on retries for external Custom HTTP requests.
- Never call LLM automations through Call Automation (Batch); call each one on its own.
- Call a callable without waiting for completion when nothing reads its output.
- Replace if/else nested more than two levels deep with one Branch node.
- Keep analytics SQL to one JOIN at most; split the query or pre-aggregate.
- Set Custom HTTP nodes to Follow Error Path (MANUAL) with at least one node on the error path.
- Replace a single-record create, upsert or update inside a loop with one bulk node outside it.
- Don't build a list with Add item to list inside a loop; use the loop's collected output or Add items to list.
- Use one upsert instead of create in one branch and update in the other on the same object.
- Take a Custom HTTP base URL from an environment or workflow variable, not a literal.
- Keep a Custom HTTP base URL to scheme and host; put the path in the request path.
- Split an automation that reaches 75 nodes.
- Split an automation that reaches 125 nodes; it is hard to maintain and troubleshoot.
- Set Content-Type in the request's Content-Type field, never again in Custom HTTP headers.
- Define the output schema of every code node so downstream nodes get datapills.
- Remove skip nodes left over from development.
- Set triggerAfterCompletion false on stream triggers so events process in parallel.
- Use Create List, not an Array variable in Create Variables.
- Never delay an in-memory automation by more than 5 minutes.
- Give every condition node at least one condition.
- Declare main-flow variables in one Create Variables node; use more only inside branches.
- Turn on Capture Stdout on a Python code node that prints or logs.
- Turn on Capture Stdout on a C# code node that writes to the console or logs.
- End a code node by returning a map or object literal (or result = {...}), as the compiler expects.
- Check presence with the Is present operator, not LEN()>0 or LEN()>=1.
- Check emptiness with the Is not present operator, not LEN()=0.
- Send an auth header or auth query parameter on every Custom HTTP Endpoint call.
- List the fields a Fetch records node needs; never fetch every column.
- Turn off use_excelize on Extract headers unless excelize is needed.
- Map at least one input pill into every storage create or update node.
- Keep PII, payment data, credentials and health data out of node inputs, outputs and logs.
- Clear code-security findings in code nodes: injection, hard-coded secrets, exfiltration, unsafe deserialisation.
- Query objects only on indexed fields; an unindexed filter forces a full scan.
- Wait on many child automations with signals, not a blocking batch loop that stalls on the slowest child.
- Call an outside system with a list when it accepts one; write down when it does not.
- Send one summary email with a table, never one email per record.
- Fetch matching records once and use Run SQL query on list instead of one lookup per item.
- Use fetch distinct values instead of fetching every record to find one field's unique values.
- Set one value on many records with one update-by-filter call, not one update per record.
- Replace two loops over one table with one query that serves both.
- Give every batch size a stated reason; large batches exceed the 256 MiB per-execution budget.
- Move a fetch that does not depend on the iteration out of the loop.
- Combine separate queries that one query can answer, especially across branches.
- Use built-in actions, such as Excel iterate over rows, instead of parsing files by hand in code.
- Merge code steps that sit next to each other into one, and drop code steps a native step covers.
- Run independent checks in parallel branches instead of one after another.
- Map model parameters like maxOutputTokens from the model's own config; never above the model's cap.
- Pass ids or references between steps, not big payloads; one 20 MB payload grew to gigabytes.
- Check calls per shared connection against its pool size; parallel batches can exhaust it for every flow.
- Dedupe visited items in any recursive or call-graph walk.
- Use pages of 5,000 to 50,000 records in large jobs; never above 50,000.
- Replace an AI step doing predictable work in a loop with a code step or one batched prompt.
- Use keyset paging for big jobs whose later pages slow down under OFFSET paging.
- Split one huge source file into chunks rather than processing it in one run.

## P3

- Leave capture loop iteration off on nodes unless needed; it writes a report row per iteration.
- Remove a For loop whose counter is a fixed 1.
- Set an explicit timeout on every Custom HTTP call; unset or -1 waits forever.
- Use a Break or Continue node's own condition instead of wiring it from an If/Else.
- Turn on caching for a Custom HTTP call inside a loop.
- Prefer file-based SQL or analytics actions over list-based ones for large datasets.
- Add a JSON deserialize node after calling an LLM automation, before reading its fields.
- Use datapills without spaces in CSV or Excel header values.
- Give an API-triggered automation a non-200 response and return it from a Respond to API request node.
- Prefer a Groovy code node over JavaScript, Python or other runtimes for compute-heavy steps.
- Turn off a loop's Capture Iterations once debugging is done.
- Map one output field like {{node.outputs.id}}, never the whole {{node.outputs}} object.
- Use the REST or SOAP Multipart action for a multipart Content-Type.
- Check binding.hasVariable before reading an optional input in a Groovy node.
- Keep a For Each loop's batch size at 1000 or less.
- Remove or initialise a variable that is created empty and never assigned.
- Keep delays in an in-memory automation at 2 minutes or less.
- Remove a Change Text Encoding step whose current and new encoding match.
- Remove a MIME type conversion whose source and target types match.
- Use Call Automation, not the Batch variant, for a hard-coded parameter list of one.
- Use the update step's add-to-set option instead of fetch, change a list, write back.
- Store a derived value as a column instead of computing it with regex inside analytics queries.
- Collapse identical steps on both sides of a condition into one path.
- Move heavy row-by-row validation out of the parent into an async child automation.
- Don't flag a loop for its number of turns when its writes are already bulk.
