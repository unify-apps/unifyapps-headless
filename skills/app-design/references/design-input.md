# Building from a design

Design input comes in four kinds. Use the best one you have:

1. A Figma link: read the Figma design context and a screenshot.
2. An SVG export.
3. A PNG.
4. Prose only.

When the task builds from a design and the spec holds no Figma link, note in
the report that one would help; do not stop to ask.

From an image, measure the real paddings and sizes before you build, then map
each measurement to the scale token that keeps its relationship to its
neighbours (the larger gap stays larger), never to an exact pixel. From
prose alone, use the spacing scale (4/8/12/16/24/32) and list the layout
choices you made in the report's `notes`.
