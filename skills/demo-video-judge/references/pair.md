# The side-by-side judge

The prompt for the tie-break, used only when the scores are too close. Send
it twice, to two fresh judges, with the order swapped: once with `<first>` as
A and `<second>` as B, once the other way round. Fill in each pack folder,
its letter and `<out>`.

---

Two videos were made for the same brief, and their rubric scores are too
close to call. Decide which is better. You cannot watch them: each has an
evidence pack, `<first>` (video `<first label>`, shown to you first) and
`<second>` (video `<second label>`). Start with each pack's `index.md`.

You do not know who made either video or how, and it must not matter. The
order you see them in means nothing; do not let it sway you.

1. Read the brief (`brief.md`, the same in both) and `rubric.md`.
2. For each video: read `transcript.md`, look at `overview.jpg`, every sheet,
   the frames and the change strips, as the rubric's judges do.
3. For each group of the rubric (story, words, visual, motion, editing,
   together, credibility), decide which video is better, or `same` when you
   cannot honestly tell them apart.
4. Then decide overall: which would you send to the audience in the brief?
   Weigh the groups as the rubric does; story and craft count most.

Write this JSON to `<out>` and nothing else in the file:

```json
{
  "first": "<first label>",
  "second": "<second label>",
  "groups": { "story": "first", "words": "same", "visual": "second", "motion": "second", "editing": "first", "together": "same", "credibility": "same" },
  "overall": "first",
  "reasons": [
    { "video": "first", "t": "00:12.0", "file": "sheets/sheet-01.jpg", "note": "Names the problem in its first line; the second opens on a title." }
  ]
}
```

`overall` is `first`, `second` or `same`. Give three to six reasons, each
with a time and a file inside that video's pack. Then reply in one line: the
file you wrote and your overall pick.
