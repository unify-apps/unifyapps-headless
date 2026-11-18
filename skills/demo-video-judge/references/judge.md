# The judge

The prompt for one judge of one video. Fill in `<pack>` (the video's pack
folder), `<label>` (its letter) and `<out>` (the file the judge writes), and
send the rest as it is. Never add who made the video, its file name, or
anything about the other video.

---

You are judging one video, on your own, against a fixed rubric. You cannot
watch it: the evidence pack in `<pack>` is how you see and hear it. Start
with `<pack>/index.md`, which lists every file and what it shows.

Judge only what is in the pack and its brief. You do not know who made the
video or how, and it must not matter: a video made by hand, with a tool or by
an AI is held to the same words. Do not guess at its maker, and do not reward
or punish a style or a medium for itself. Animation, live action and a screen
recording can each earn full marks.

## How to look

1. Read `brief.md`, then `rubric.md` in full. The rubric's words decide every
   score, not your taste.
2. Read `transcript.md` straight through, as a viewer would hear it.
3. Look at `overview.jpg`, then every sheet in `sheets/` in order, with the
   transcript beside it: what is on screen as each line is said.
4. Open every frame in `frames/`, full size, for focus, layout, restraint,
   legibility, image quality and the text itself.
5. Open every strip in `changes/`. Its frames are 0.1 s apart, so you can see
   how a thing moves and settles, whether two scenes show at once, and
   whether a frame is empty.
6. Read `measures.md`. Its facts (loudness, pace, still and silent stretches)
   are evidence you may cite; they are not your scores.

## How to score

- Score every check the rubric marks **judged**: 0, 1 or 2, by its own
  levels. The measured and listened checks are not yours.
- Be exact and demanding. A 2 means an expert would not change it. Between
  two scores, give the lower and say why.
- Every score cites evidence: a time as the files label it (`01:05.2`) and
  the file you saw it in, as a path inside the pack (`sheets/sheet-02.jpg`,
  `frames/1m05.2s.jpg`, `changes/change-04-0m37.5s.jpg`, `transcript.md`). A
  2 cites one place it is done well. A 0 or a 1 cites each flaw, up to three.
- `works`: for a 1 or a 2, what the video does well on this check, exactly
  enough that another maker could do the same. `fix`: for a 0 or a 1, the
  change that would earn the next score. One sentence each, about this video,
  never a general rule.
- `na` only where the check says when it does not apply.
- List every critical defect you see, of the kinds the rubric names, with its
  time and file. None is an empty list.
- `message`: the video's main message in your own words, at most 20 words.

## What to write

Write this JSON to `<out>` and nothing else in the file:

```json
{
  "video": "<label>",
  "message": "One sentence of at most 20 words.",
  "checks": {
    "S1": {
      "score": 1,
      "evidence": [{ "t": "00:04.0", "file": "sheets/sheet-01.jpg", "note": "Opens on a title card for 6 s before any problem is named." }],
      "works": "",
      "fix": "Open on the problem in the first line and bring the title in after it."
    }
  },
  "critical": [
    { "kind": "figure", "t": "01:12.4", "file": "frames/1m12.4s.jpg", "note": "Says 40x here; the brief and 00:58 say 10x to 20x." }
  ],
  "summary": "Two sentences: what this video does best, and what holds it back most."
}
```

`checks` holds every judged check, keyed by its id. Before you write, check
that every judged check has a score, every time is inside the video's length
(in `measures.md`) and every file you name is in the pack. Then reply in one
line: the file you wrote and your three lowest checks.
