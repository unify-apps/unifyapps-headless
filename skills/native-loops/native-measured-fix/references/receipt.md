# Fix receipt

One record per fix:

| Field | Value |
| --- | --- |
| fix | What changed, on which blocks or sources |
| backup | The backup files and the page version read |
| criteria | Target metric, useful improvement threshold and every required check |
| versions and conditions | Loaded baseline and changed variants with proof; device, data, open kind, warm-up, refresh state and instrumentation |
| before / after | Raw sample paths, run order, sample count, median and spread, plus explanatory counts |
| same behaviour | Each required check: pass, fail, or incomplete with the reason |
| result | kept, undone with the reason, or blocked with the missing check and verified trial restoration |
| evidence | Each statement marked KNOWN (seen) or GUESS (inferred) |

## Seen in real work

- A builder's report said done when the change was not there. Only a live read-back counts.
- A config that looked safe changed behaviour. Resetting a draft variable to `{}` changed what a save sends. This is why the save payload is in the snapshot.
- Removing a wrapper block took a keyboard setting with it. Check the diff for settings on the removed block, and check typing on the device.
- A delete ran without the confirm that was expected. Check the backup exists before the write, not after.
