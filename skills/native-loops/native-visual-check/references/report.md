# The visual check report

`pass-report.html` is one self-contained file: the images are embedded as base64, downscaled to at most 1200 px tall (`sips -Z 1200` on macOS, the built-in resampler elsewhere); the full-resolution `device-<k>.png` files stay on disk and never enter the context. `--link` references the downscaled copies under `report-images/` instead of embedding them.

Per viewport, side by side at 1pt = 1.5 CSS px: the Figma screenshot clipped to the page band of that viewport (left) and the device shot (right). The Figma image is placed by the canvas → device mapping recovered from the spec's element pairs (a least-squares line per axis), so the slice lines up with the scroll offset of the viewport. In viewports after the first the pinned header and tab bar sit over scrolled content on the device while the Figma slice shows the content under them; only viewport 1 matches band for band.

Overlays for `off`, `missing` and `extra` rows: the expected box as a dashed blue rectangle on both sides, the measured box as a solid red rectangle on the device side, each with the row number. A checkbox puts the Figma slice at 50% opacity over the device shot. `--regions` limits the viewports shown to the ones overlapping the chosen regions.

The gap table below the images has a button per status; a row shows its judge, its noise rule, the block (displayName, id, how it was found) and the hint or the acceptance words.

Beside the report: `composite.png`, viewport 1 as device | Figma at 900 px tall, the one image a session looks at for the approval; and with `--crops`, `crops/<region>.png` for at most two regions with visual rows (device left, Figma right, ≤400 px wide each), the images the visual rows are judged from.

Sizes seen on the fixtures: a report with three small images is under 100 KB; a real pass with eight viewports and a Figma screenshot embeds about 9 downscaled images and stays well under the 15 MB the verification plan allows.
