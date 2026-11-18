---
name: demo-video-loop
description: Makes a narrated demo video from a client's material, end to end, in the UnifyApps theme by default - an MP4 with a voice, music and captions, its share copy and a preview page. It is the content loop with the output already chosen, so it runs the same steps - every question at the start, the brief from every file, the film plan, each scene designed and animated for this story and held to four checks, the build and the hand-over. Use when the person types /ua:demo-video-loop.
argument-hint: "[what it is about] [transcript or folder paths]"
allowed-tools: Bash(node:*), Bash(bash:*), Bash(open:*), Bash(ffmpeg:*), Bash(ffprobe:*), Bash(whisper-cli:*), Read, Write, Edit, Agent, Skill, AskUserQuestion, ToolSearch, WebFetch(domain:www.unifyapps.com), WebFetch(domain:unifyapps.com), WebFetch(domain:trust.unifyapps.com)
---

# Demo video loop

The content loop, with the output chosen: the video. Everything else is the
content loop's.

Load `ua:content-loop` with the Skill tool and follow it as written with
the same ask, from its first step to the hand-over, with one answer already
given:

- **What to make** (its first question) is the video. Add the HTML
  presentation or the PowerPoint only when the ask names them. Its length
  is asked unless the ask gives it: 2, 5 or 10 minutes, or a teaser.

Its questions, rules, signals and self-review are this command's, and its
closing summary is this one's.
