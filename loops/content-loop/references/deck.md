# The HTML presentation

`D deck F` makes `F/out/<slug>.html`: the whole story in one file, about
1 MB plus its pictures, with its fonts, pictures and logo inside. It plays
offline, from email, from a shared drive, or uploaded to a page with a
strict security policy, such as the Demo Library.

## Make it

1. `D deck F`. It writes the file, then takes a still of every build of it:
   `F/build/deck/contact-<n>.jpg` (20 stills a sheet), `storyboard.html`
   (each still with the lines under it) and the layout check. It exits 1
   when the check finds text that leaves the frame, is clipped, is under
   18 px, sits on other text, or ends a heading on one word alone; the file
   is still written.
2. Read every contact sheet, fix in story.json or the scene's file, and
   make it again until the check is clean and the sheets read well (the
   loop's step 8).
3. Open it the way the audience will see it: `open F/out/<slug>.html`.

## Shape it for presenting

A deck is clicked through by a person talking, so it can carry more than a
video and asks less of each line:

- Its scenes follow the time to present it, as the
  [film plan](film-plan.md#length-and-pace) says; a product demo, one
  `screen` scene per screen plus an opening and a close.
- Every build is a click. More than five builds in a scene: split it in
  two.
- The lines are the speaker's notes: what to say while that build is on
  screen, in the speaker's words. One line per build, as in a video.
- A quiet scene, one line or their own words, makes a good pause between
  dense ones.

## What to tell the person

At the hand-over, say how to present it, in a few lines:

- Click, → or Space for the next build; ← to go back.
- **P** opens the presenter view in a second window: the notes for each
  build, the next build, and a timer. Put the deck full screen (**F**) on
  the shared screen and keep the presenter view on the laptop.
- **O** shows every scene as a thumbnail to jump to; **N** shows the notes
  over the deck; **B** blacks the screen; **A** plays it on its own, for a
  booth or a waiting room; **M** turns the motion off.
- The address keeps the place (`#4.2` is scene 4, build 2), so a link can
  open on a given scene.
