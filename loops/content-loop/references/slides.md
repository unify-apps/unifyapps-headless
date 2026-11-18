# The PowerPoint

`D slides F` makes `F/out/<slug>.pptx` from the HTML presentation (made
again first when the story has changed since). It rebuilds each scene in
PowerPoint's own shapes, so the file can be edited like any deck:

- **Text is text**, in the story's fonts, sizes and colours, line for line
  as the deck sets it, and the heading is the slide's title.
- **Boxes, lines and pictures are shapes**: cards with their corners,
  borders and shadows, a diagram's wires and arrows, the logos and
  screenshots. What PowerPoint cannot draw (a gradient panel, a masked
  icon) is a picture of just that piece; the ground and its glow are the
  slide's background.
- **Each build is a click** that plays the deck's motion, quickened for a
  room: a card floats up, a line wipes along its path, a heading rises word
  by word, a highlight moves on. A scene written for the story carries its
  own motion across, whether it moves with the kit or with GSAP. A click is over in under a second, so the
  next one never waits. Pieces that come in together (a card's box, title
  and text) are one group with one entrance. The scene's entrance plays as
  the slide arrives.
- **A build that replaces what is on screen** (a stage card giving way to
  the next, a number counting on) starts a new slide that morphs from the
  one before, so no slide holds two states on top of each other. The
  slide's name says which part of its scene it is, `4 Engagement (2 of 5)`.
- **The scene's lines are the speaker notes**, each click's line marked
  `[Click]`.
- **The fonts travel inside the file**, so it shows its own type on a
  machine without them. A font that is not on Google Fonts stays a name: on
  a machine without it, PowerPoint shows a stand-in.

Motion that never stops in the deck (a wire's current, a breathing glow, a
turning mark) holds still in PowerPoint. Morph needs PowerPoint 2019 or
later, or Microsoft 365; an older PowerPoint fades between the parts.
Keynote plays each click's pieces one after another rather than together,
which still ends within a second or two, and it does not use the fonts
inside the file: on a Mac without the story's fonts it shows a stand-in
until they are installed from Google Fonts. Google Slides plays the clicks
its own way.

The PowerPoint is laid out from the deck, so the deck's layout check is its
check: a clean deck is a clean PowerPoint. `slides` exits 1 on any issue
the deck's check holds, as `deck` does. A change goes into story.json and
the slides are made again; the person can add their own slides before or
after these, or edit them in place.
