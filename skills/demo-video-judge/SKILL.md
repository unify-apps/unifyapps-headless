---
name: demo-video-judge
description: Judges two videos side by side, or one alone, against a fixed 100-point rubric of what a viewer sees and hears (story, words, visual design, motion, editing, picture and sound together, sound, credibility, technical quality) and says which is better, by how much and how sure, with a score per group and per check. A script measures what it can (loudness, pace, reading level, still and silent stretches, blank frames, resolution, length); three fresh judges per video score the rest blind from frames and the transcript, citing a time for every score. Writes a learnings file, what each video does better and how to use it in the other. Judges any video however it was made, by hand, with a tool or with the content loop. Use when the person types /ua:demo-video-judge, asks which of two videos is better, how their video compares with someone else's, or what to learn from another video.
argument-hint: "<video> [<other video>] [brief file] [captions files]"
allowed-tools: Bash(node:*), Bash(ffmpeg:*), Bash(ffprobe:*), Bash(whisper-cli:*), Bash(open:*), Read, Write, Agent, AskUserQuestion
---

# Video judge

`/ua:demo-video-judge <video> [<other video>]` scores videos against the
[rubric](references/rubric.md): 39 checks in 9 groups, worth 100 points. It
judges the file as a viewer meets it, never how it was made, so a video made
by hand, with another tool or with `/ua:content-loop` is held to the same
words. With two videos it says which is better and writes what each can learn
from the other. With one, it scores it and lists its weakest checks.

`J` below is the folder `${CLAUDE_PLUGIN_ROOT}/skills/demo-video-judge/scripts`
and `R` the run folder.

## Why the verdict is not a matter of taste

- **Measured where a script can.** Loudness, speaking pace, reading level,
  still and silent stretches, blank frames, resolution and length come from
  the file, the same way for every video.
- **Small, written checks.** Each judged check has its own words for a 0, a 1
  and a 2. No judge gives a score out of 10.
- **Evidence for every score.** A judge cites a time and a file for each
  score; the script refuses a file that does not.
- **Blind and repeated.** Three fresh judges per video, each seeing one video
  under a letter, never its file name, its maker or the other video. A check
  takes the median of their scores.
- **The same checks for both.** A check that does not apply to one video, or
  that no one listened for, is left out of both totals.
- **A margin rule.** The leader must beat the other in at least three in four
  of the judges' pairings; closer than that, two side-by-side judges decide,
  once in each order, and they must agree.

## What it needs

- **ffmpeg and ffprobe**, and **Chrome for Testing** to label the contact
  sheets. When Chrome is missing, `npx playwright install chromium` adds it.
- **A transcript, the same kind for every video:**
  1. captions files (`.srt` or `.vtt`) for every video: the content loop
     writes one next to its video, and most editors export one;
  2. else `whisper-cli` with a model, when this laptop already has them;
  3. else none: the words are judged from the screen, and the measured
     narration checks are left out of both totals.

  Never install whisper or download a model for this. When the videos would
  get different kinds, the pack says so and gives none to any.

## Steps

1. **The videos and the brief.** Take the videos, a brief file and captions
   files from the arguments. The brief is what the videos are judged
   against; for two videos it is one brief, since both answer the same ask.
   Ask, in one AskUserQuestion round, only what is still open:
   - the brief, when none was given: the audience, what they should think or
     do afterwards, the length, the points the video must include, and any
     facts its figures must match;
   - which video is theirs, when they compare their own with someone else's,
     so the learnings are written for theirs.

   Write the brief to `R/brief.md`, where `R` is
   `video-judgements/<YYYY-MM-DD-HHmm>` in local time, as:

   ```markdown
   Audience: <who will watch>
   Purpose: <what they should think or do afterwards>
   Length: <2-3 minutes, 90 seconds, …>
   Must include:
   - <a point>
   Facts:
   - <a figure and its source>
   ```

   Leave out a line the person did not give; a check that needs it is then
   left out of both totals.

2. **Pack each video.**

   ```bash
   node J/pack.mjs R --brief R/brief.md --video <first> [--srt <its captions>] [--video <second> [--srt <its captions>]]
   ```

   It gives each video a letter in a random order, writes its evidence pack
   to `R/A/` and `R/B/` (the measures, the transcript, labelled contact
   sheets, strips 0.1 s apart across every change, full-size frames where
   the picture rests) and keeps which letter is which file in `R/key.json`.
   Say the line it prints about transcripts. A failure names what is
   missing: say it and stop.

3. **Judge.** Start three `general-purpose` agents per video, all in one
   message, in the background, each with the prompt in
   [the judge](references/judge.md): `<pack>` is `R/A` or `R/B`, `<label>`
   its letter, `<out>` is `R/judge/<label>-<n>.json` (n is 1 to 3). Tell a
   judge nothing else: not the file name, not who made it, not that there is
   another video. Each reads about 50 pictures, so the judging takes 10 to 15
   minutes; say so while it runs.

4. **Listen, when someone can.** Loudness is measured; the voice, its
   delivery and the music need ears. Ask once whether someone will listen.
   When they will, ask the three sound checks of the rubric (A2, A3, A4) for
   each video, with its three levels as the options, and write
   `R/listen-<label>.json`:

   ```json
   { "video": "A", "listener": "<who>", "madeOne": false, "checks": { "A2": { "score": 2, "note": "…" }, "A3": { "score": 1, "note": "…" }, "A4": { "score": 2, "note": "…" } } }
   ```

   `madeOne` is true when the listener made one of the videos; the report
   says so. A check that does not apply takes `"score": "na"`. Without a
   listener, the three are left out of both totals.

5. **Score.**

   ```bash
   node J/score.mjs R [--mine <A, B or their video's file>]
   ```

   It writes `R/report.md`, `R/learnings.md` and `R/report.json`. A judge
   file it leaves out is named with its problems: start one fresh judge for
   that file with the same prompt, once, and score again.

6. **Break a tie.** When it prints `too close`, start two `general-purpose`
   agents with [the side-by-side judge](references/pair.md), one with A
   first and one with B first, writing `R/judge/pair-1.json` and
   `R/judge/pair-2.json`, then score again. A video wins only when both
   orders pick it.

7. **Hand over.** Show the scores table and the verdict from `report.md`,
   the three biggest learnings each way from `learnings.md` (each with its
   time), and the paths of both files. For one video, show its scores and
   the five checks where it loses the most points, with their fixes. Say which checks were left out and
   why, and any critical defect. Open `report.md` when the person asks.

## Reading the result

- **Clear**: the leader's judges beat the other's in every pairing.
  **Likely**: in at least three in four. **Tie-break**: too close on points,
  and both side-by-side judges chose the same video. **Tie**: they did not.
- A critical defect two judges agree on (a wrong name, a figure that
  contradicts the brief, placeholder text, a broken frame, a sound fault,
  private data) costs 3 points and means the video is not ready to send.
- The learnings are the checks where one video scored higher: what it does,
  where, and what the other did instead. They are about these two videos,
  not rules for every video.
