# The video

`D video F --cut full` voices the lines with when each word is said, lands
every build on the word that names it, renders the story page frame by
frame with a camera that reframes on each build and captions that light
each word, scores it, adds the sounds of what happens on screen (clicks,
keys, pops, whooshes) and mixes it: `F/out/<slug>-full.mp4` (1920 x 1080, -16 LUFS), its captions (`.srt`),
a share copy under 30 MB for chat and email, a preview page that plays it
with sound, and `F/versions/<time>/` keeping this build with its story.json
and facts.json. About two minutes to make a 2-minute video, and in
proportion for a longer one.

## The voice and the music

Write the `video` block into story.json before the first build:

- The voice: `{ "engine": "edge", "name": "andrew" }`; `ava` when the
  person asked for a woman's voice; `{ "engine": "say" }`, the Mac's own
  voice, only when they asked that nothing leave the laptop. Other online voices: brian, emma,
  sonia, ryan, neerja, prabhat.
- `music.mood`: `warm` for a use-case story, `bright` for a teaser, `calm`
  for leadership; `"on": false` when the person asked for none.

## Shape it for watching

A video has no presenter, so the lines carry everything. Write them by the
kit's [lines for a video](../../../skills/demo-kit/references/writing.md#lines-for-a-video):
a build every 6 to 10 words, one short phrase per build that names what the
build shows, and the pieces revealed across the scene.

- Its length is the one the person picked: 2, 5 or 10 minutes, or 20 to 40
  seconds for a teaser, written as `video.length`. The scenes and words for
  each are in the [film plan](film-plan.md#length-and-pace). `D check F`
  prints how long each cut would run, and fails a full film more than a
  fifth off its length.
- One ground for the whole film unless the plan's colour meanings give a
  change a reason; the kit fades it in across the cut.
- Each scene's `short` is its one-line version, for the shorter cuts.

## Make it

1. `D video F --cut full`. It prints its checks: the length, 1920 x 1080,
   -16 LUFS, a true peak at or under -1.5 dB, and the motion line: how much
   of the picture has nothing moving, the longest such stretch (at most
   3 s before the end card), how many builds landed on their word, how many
   sounds play. It exits 1 when one misses. A failed check is fixed and the
   build run again, never handed over. A dead stretch is fixed in the story:
   find its scene from the time, then shorten the line that plays over it,
   split it, or give it a build. A build that missed its word: rephrase the
   line to name it, or pin the word with braces.
2. Check the timing of builds against the lines; the layout is already
   checked, since the video uses the deck's scenes. Take a frame at the
   start time of a few captions in the opening and one middle scene
   (`ffmpeg -ss <seconds> -i <video> -frames:v 1 <frame>.jpg`, the times
   from the `.srt`), read it, and check that the build the line names is on
   screen.
3. When the person asks for something shorter: `D video F --cut short`,
   every scene speaking its `short`, about a third of the length. A 20 to
   30 second taste of the look, voice and music: `--cut sample`.
