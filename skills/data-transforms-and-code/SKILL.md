---
user-invocable: false
name: data-transforms-and-code
description: Read when transforming data in memory or considering a Code by UnifyApps node. Covers native utilities, list operations, templates, code selection, sandbox rules, input bindings, and result conventions. Not for files, persistence, external calls, or external SQL databases.
---

# Data transforms and code

## Choose the smallest native operation

Search native operations before writing code. Available utilies cover JSON, XML, TOON, list filtering and sorting, list indexing, SQL over in-memory lists, dates and epochs, text cleanup and encoding, hashing, JWT decoding, encryption, UUIDs, sequences, and templates.

Use file or document actions for files, Storage for persisted records, and Custom HTTP Endpoint for network calls. Use code only when no short native chain expresses the required algorithm or transform clearly.

Read `get_operation_schema` and its layout before writing a utility or code node. Use its keys, output names, enum values, modes, and filter grammar. Inspect the output and downstream pill; a green run can still return nothing useful.

Use native list operations for filtering, sorting, and indexing. SQL over lists is only for data already in memory. Use `.map()` to project an upstream list; use a fixed array only when authored elements determine its length.

## Write code only when needed

- Prefer Groovy > JavaScript > Python.
- Groovy is native to the automation runtime and can be run directly, avoiding the extra environment boundary and performance overhead of JavaScript and Python actions.
- Use JavaScript or Python ONLY when required and Playwright only for browser automation, since these come with their performance cost.
- The JavaScript code you write runs inside GraalJS sandboxes, which are not Node.js, V8 or bubblewrap. The code you write must be executable in the GraalJS sandbox.

Call `get_code_sandbox_restrictions` with the exact lowercase language. Blacklists and sandbox violations are hard constraints. An empty or failed lookup does not prove the code will run, but you should not block the automation build because of missing response. Presence of restrictions should not discourage you from picking a language, it simply indicates that some syntax or code might not run as expected, so you should work around it, in the **already decided** language.

The `code_by_unifyapps` nodes have an `input`, `output` which are strict JSON schema, `code` which the Groovy, JavaScript, or Python code to execute, and `parameters` is the object containing all the inputs passed to the code script. Keep names and types identical across schemas, mappings, script variables, and returned fields. Pass input values through `parameters`, never place pill syntax inside script text.

Inside the code script, the inputs are accessed directly, no `parameters`, `params`, `input` wrapper. If a variable is defined in the `input` as X, passed in the `parameters` as X, then it can be accessed directly as `X`.

For optional inputs, use the following to check if the variable is defined:

- Groovy and Java variant: `binding.hasVariable('X')`
- JavaScript and Playwright: `typeof X !== 'undefined'`
- Python: inspect `globals()` or handle `NameError`

Preserve meaningful zero and false values. Do not turn missing required input or parse failure into fake success.

Do not use fallback values for required lookup data. For a keyed lookup, require both the key and a non-null value; zero is valid. Validate other required fields, throw on a miss, and catch the error in the node's `catch` path.

## Return the declared result

All Groovy, JavaScript and Python return the data in `result` variable, which can simply be assigned as the last step in the code. All scripts execute as REPL, so the last operation is the one that is returned, and should be the assignment to `result`, which should be assigned an object. In code scripts, the `result` assignment should be the last statement, so you should collect your values in if/else branches and then assign `result = <value>` in the end.

Downstream DSL references use `node.result.field`. The code node adds the `result` wrapper, which is what you assign in the script.

### Groovy string return handling

Return plain strings from Groovy. A double-quoted string with `${...}` inside is a GString, not a `String`, and the next node receives it as an object such as `{bytes, strings, values}` instead of text. Call `.toString()` on it, as in `"${name} (${qty})".toString()`, or join single-quoted strings with `+`. This applies to every string in `result`, including the ones inside lists and maps.

Never pass a char to a String method. For example, `name.indexOf((char)92)` saves clean but throws `No signature of method ... (Character)` on every run that reaches it. Pass the code as an int, `name.indexOf(92)`, or a one-character string, `name.indexOf('x')`. `contains` takes only a string: `name.contains('x')`. `startsWith`, `endsWith`, `split`, `replaceAll`, `concat` and `join` also take a string, never a char: `name.split('/')`.

Use only supported settings and standard built-ins. Do not assume packages exist, install at runtime, use remote imports, reflection, or evaluated downloaded source.

Check a pure Groovy node before saving with `run_connector_operation`: use `appName: 'code_by_unifyapps'`, `resourceName: 'code_by_unifyapps_groovy'`, and pass the node's `input`, `output`, `parameters`, and `code` as tool inputs. Try a valid case and an invalid case, inspecting the returned `result`. Probe the final script, since any edit voids an earlier probe, and make the valid case reach every line: an input that skips a line proves nothing about it. This runs the real Groovy node independently; `executeCodeInSandbox` has no Groovy runtime. Keep the script limited to computation from its parameters: no network, Storage, or other side effects. `get_code_sandbox_restrictions` reports tenant-owned restrictions and is not proof that arbitrary Groovy code is read-only.

Submit the workflow with `compile_and_save_workflow`. Correct diagnostics in the code until the response confirms the save. When the transform needs runtime verification and execution is authorized, test the saved workflow with a small known input and inspect the actual output.

## Examples

This is an example code node, part of a larger workflow. The code node `normalized` has an input of names (array of strings), output of normalizedNames (array of strings), and the code script defined. The consuming node uses the `normalized.result.normalizedNames` value, result is inherent from the code script's return convention, and `normalizedNames` is the name of the output field. Also notice that since names is an optional input, the code script handles it gracefully with a binding check.

```ts
// Normalize the supplied names
const normalized = op('code_by_unifyapps', 'code_by_unifyapps_groovy', {
  input: {
    type: 'object',
    properties: {
      names: { type: 'array', items: { type: 'string' } },
    },
  },
  output: {
    type: 'object',
    properties: {
      normalizedNames: { type: 'array', items: { type: 'string' } },
    },
    required: ['normalizedNames'],
  },
  parameters: {
    names: t.names.map((name) => name),
  },
  code: `def safeNames = binding.hasVariable('names') ? binding.getVariable('names'): [];
def normalizedNames = safeNames.collect { it.trim().toLowerCase() }.findAll { it }
result = [normalizedNames: normalizedNames]`,
});

// Use the result somewhere else
const node = op('node', 'action', {
  normalizedNames: normalized.result.normalizedNames,
});
```
