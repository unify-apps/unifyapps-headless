# Verify

Every finding that depends on how the page behaves is proven before it is reported. First decide the path. Below, `S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-device-pool/scripts"`.

## 1. Is there a Preview build?

Run `bash "$S/device-pool.sh" pool status --json`.

| What it shows | Path |
| --- | --- |
| At least one `ua-sim-<nn>` device with the app `installed` | `simulator` |
| No pool, but a booted simulator carries the app: `xcrun simctl get_app_container <udid> <bundle id> app` exits 0 for a Preview variant (`com.unifyapps.matrix`, `.preview`, `.internal` or `.development`) | `simulator`: run `pool init` so the device can be reserved ([pool](../../native-device-pool/references/pool.md)) |
| No app anywhere | Ask the person once for the UnifyApps Preview app's simulator build and install it (`loops preview install --app <path>` or `--url <url>`, about 200 MB per simulator). Installed → `simulator`. No build → `mcp-only` |
| No app and no URL | `mcp-only`. Say in one line that the device check was skipped because no Preview build is installed, and that `native-setup` installs one |

Write the path and the reason into `review.json`.

## 2. Simulator path

Follow the [device-step protocol](../../native-device-pool/references/protocol.md), steps 1–8: reserve, boot, connect, open the app by deep link, signed in, fresh config, actions, release. The page under review must be on the device at the version pinned in step 2 of the procedure; the protocol's refetch proof is the check.

Then for each item on the device list:

| Finding | Prove it with |
| --- | --- |
| A tap does nothing, or does the wrong thing | Tap it (point from `describe`), then `describe` again: the screen did not change, or changed to the wrong page |
| A source loads twice (R7), or a duplicate source (R2) | `native-network-logs` across one page open: count the calls per automation |
| A missing loading, empty or error state | Open the page with the empty test user (`testUsers.empty`), and once with the network slow if the profile allows; screenshot each |
| Double tap runs the write twice | Two quick taps, then `native-network-logs`: two write calls |
| Back loses the result (H16) | Walk there and back by taps from the tree, `describe` after each hop |
| UI: hierarchy, spacing, contrast, overflow | `screenshot {scale: 1.0, includeImageInContext: false}` to `$OUT`, then look at one downscaled copy |

Never type a password. Never tap an action that deletes, pays or sends to a real person; mark that finding `unverified (unsafe to tap)`. Release the reservation on every exit path.

## 3. MCP-only path

No device, so prove what the platform can show through the UnifyApps Headless tenant tools (read tools only):

| Finding | Prove it with |
| --- | --- |
| A block, event or binding is what the cache says | `application-builder` `get_blocks` on the ids, live, to rule out a stale cache |
| Something is unused (R1, R3, R4) | `search_app` for its id and name across the app; `get_dependency_graph` for the page |
| A binding reads a field the source does not return | `get_data_source_output_schemas` for the source |
| What the automation behind a source really returns | `automation-code` `open_workflow` to read it. A test run (`trigger_workflow_run`) only with the person's yes, and never for an automation that writes |
| Navigation targets and page paths | `get_navigation`, `get_page_paths` |
| UI | Not provable here. Mark every UI finding that needs a screenshot `unverified (no device)` |

## Evidence row

Use the row from the [protocol](../../native-device-pool/references/protocol.md#evidence-row). On the `mcp-only` path the last two columns are `version (draft vN)` and `mcp read <tool>` instead of a refetch proof.
