---
name: demo-ppt-loop
description: Makes a professional PowerPoint from a client's material, end to end, in the UnifyApps theme by default - editable slides in PowerPoint's own text, shapes and pictures with the story's fonts inside, each build a click that plays the deck's motion, a morph where a build replaces what is on screen, and the lines as speaker notes. It is the content loop with the output already chosen, so it runs the same steps - every question at the start, the brief from every file, the film plan, each scene designed and animated for this story and held to four checks, the build and the hand-over. Use when the person types /ua:demo-ppt-loop.
argument-hint: "[what it is about] [transcript or folder paths]"
allowed-tools: Bash(node:*), Bash(bash:*), Bash(open:*), Bash(ffmpeg:*), Bash(ffprobe:*), Bash(whisper-cli:*), Read, Write, Edit, Agent, Skill, AskUserQuestion, ToolSearch, WebFetch(domain:www.unifyapps.com), WebFetch(domain:unifyapps.com), WebFetch(domain:trust.unifyapps.com)
---

# Demo PowerPoint loop

The content loop, with the output chosen: the PowerPoint. Everything else is
the content loop's.

Load `ua:content-loop` with the Skill tool and follow it as written with
the same ask, from its first step to the hand-over, with two answers
already given:

- **What to make** (its first question) is the PowerPoint. Add the HTML
  presentation or the video only when the ask names them. The HTML deck is
  still made first, as the content loop always does: the PowerPoint is laid
  out from it. Hand over the `.pptx` first and the HTML as its source.
- **The kind** (its second question) never offers the teaser, which is a
  video.

At the hand-over, say what the PowerPoint is: editable slides with each
build as a click, a new slide that morphs in where a build replaces what is
on screen, the fonts inside the file, and the lines as speaker notes with
each click marked.

Its questions, rules, signals and self-review are this command's, and its
closing summary is this one's.
