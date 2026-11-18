# The intake

The questions a film may need, in AskUserQuestion rounds of up to four, and
their usual options. Ask only what the request, the material and earlier
answers leave open, as the loop's step 1 says.

**Round 1, what to make.**

1. *What should I make?* (several may be picked) The HTML presentation
   (recommended: animated, one file, presented build by build, with speaker
   notes); the PowerPoint (editable slides, each build a click with its
   motion, with speaker notes, to present, send or edit); the video (a
   narrated MP4 with music and captions). Named formats answer it ("HTML",
   "PowerPoint", "PPT", "video"), as do `/ua:demo-presentation-loop`,
   `/ua:demo-ppt-loop` and `/ua:demo-video-loop`; "a presentation", "a
   deck", "a pitch", "slides" or "content for Acme" do not.
2. *What kind of story?* A use-case story for a client (how UnifyApps
   solves their problem); a product demo (a walkthrough of an app, the
   builder, a command or a feature); a UnifyApps overview (what UnifyApps
   is, with some examples, for a room new to it); a teaser (20 to 40
   seconds, video only). A film about how something works is a demo.
3. *Who is it for?* A CFO or finance leader; a CIO or IT leader; a CTO or
   engineering leader; the team who do the work (a partner, our own team or
   another leader in "Other").
4. *Which look?* UnifyApps light (recommended: gold on warm paper, deep
   green for the key moments); UnifyApps dark (near-black forest green
   throughout, with gold type); another theme: "A client's brand or any
   other look, from a theme file, the logo, screenshots, a deck or a site,
   as paths or a link in Other." Vox and Kinetic are never offered by name:
   an explainer or "Vox style" takes Vox; a teaser, a launch, or bold,
   punchy type takes Kinetic; a logo, site or brand guide to match takes
   the client's brand.

**Round 2, the film.**

5. *How long?* For a video, these options and no others: **2 minutes**
   (recommended), **5 minutes**, **10 minutes**. A teaser is 20 to 40
   seconds and is not asked. For a deck or PowerPoint with no video, the
   time to present it: 10, 20 or 30 minutes. Write a video's length into
   story.json as `video.length` in seconds (120, 300, 600; 30 for a
   teaser); `D check` holds the film to it.
6. *What should they do or believe after it?* The one thing it must land:
   approve a pilot or a next step; understand what UnifyApps is and where it
   fits; book a deeper session; their own words in "Other".
7. *Where will it be shown?* Presented live, on a call or in a room;
   sent as a link to watch alone; played at an event on a big screen;
   posted on social, playing muted with captions.
8. *What should it feel like?* Calm and cinematic; bold and energetic;
   a clear explainer that builds its diagrams; product first, real screens
   in use. "Other" takes a film, a site or a deck whose motion they love, as
   a link or a path: the film plan borrows from it.

**Round 3, the material and the specifics.** Only what is still open, up to
four:

- *The material*, by kind, each with its paths: call transcripts (`.vtt`,
  `.srt`, `.txt`, `.docx`) or notes; their documents (the RFP or brief,
  process documents, the figures they shared, screenshots of their
  systems); recordings; a deck, film or page to build on or match. Never
  offer a short pick-list that lets "UnifyApps facts only" stand in for
  material the person has. For an overview, the company's own presentation
  is already in the kit as its
  [standard diagrams](../../../skills/demo-kit/references/unifyapps-standards.md).
- *What to stress or leave out*: the use case, a capability, a connector,
  a customer story it may name; anything confidential; for an overview, a
  standard diagram to leave out.
- *For a product demo*: the app (its preview or live address, or its name
  in this solution), the flow to show, and for an app outside this
  solution that needs its own sign-in, screenshots of the screens to show.
- *For a video, the voice*: Andrew (recommended, an online voice: its lines
  go to Microsoft's speech service); Ava (an online woman's voice); the
  Mac's own voice (flatter; nothing leaves the laptop).
- *Another theme with no source given*: what to take it from.
- *A term the film must explain*: when the request names an idea of the
  person's own (a framework, levels, a name for how their work is split)
  whose meaning the loop would otherwise guess, ask what it means, with one
  example. Never take its meaning from older material that only uses it.
- *Figures the material does not give*: only when the story would show
  numbers the material lacks. Say it in words, with no figures
  (recommended); or illustrative figures worked out from what the person
  gives in "Other" (their volumes, their team size, their hours).

The music follows the feel and is not asked: warm for a use-case story,
calm for leadership or a cinematic feel, bright for a teaser or an energetic
one. The customer's logo comes from the material or the customer's own site
(an SVG, or a PNG at least 600 px wide, saved in `F/assets/`); it is asked
for in step 2 only when neither works.
