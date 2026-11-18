---
name: demo-presentation-loop
description: Makes an animated HTML presentation from a client's material, end to end, in the UnifyApps theme by default - one self-contained file that steps through each scene build by build, with speaker notes, a presenter view and all scenes at a glance. It is the content loop with the output already chosen, so it runs the same steps - every question at the start, the brief from every file, the film plan, each scene designed and animated for this story and held to four checks, the build and the hand-over. Use when the person types /ua:demo-presentation-loop.
argument-hint: "[what it is about] [transcript or folder paths]"
allowed-tools: Bash(node:*), Bash(bash:*), Bash(open:*), Bash(ffmpeg:*), Bash(ffprobe:*), Bash(whisper-cli:*), Read, Write, Edit, Agent, Skill, AskUserQuestion, ToolSearch, WebFetch(domain:www.unifyapps.com), WebFetch(domain:unifyapps.com), WebFetch(domain:trust.unifyapps.com)
---

# Demo presentation loop

The content loop, with the output chosen: the HTML presentation. Everything
else is the content loop's.

Load `ua:content-loop` with the Skill tool and follow it as written with
the same ask, from its first step to the hand-over, with two answers
already given:

- **What to make** (its first question) is the HTML presentation. Add the
  PowerPoint or the video only when the ask names them.
- **The kind** (its second question) never offers the teaser, which is a
  video.

Its questions, rules, signals and self-review are this command's, and its
closing summary is this one's.
