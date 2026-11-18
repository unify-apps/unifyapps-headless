# Native block catalog — MOBILE apps, the UnifyApps mobile renderer

## Contents
- Native-built (44)
- Shared with web (30)

75 blocks are registered on native: 45 with their own native build and 30
shared with web. The 44 native-built blocks you can place are below, one entry
each; CopilotChat is internal to `copilot`. The 30 shared blocks are listed at
the end. A MOBILE app renders ONLY these. Pick from THIS file, never from memory and
never from the web catalog — a web-only type stores fine and renders NOTHING
on the phone. Which sheet to read for each: `app-native` § Sheets on a native target. Two
lines each: what it is, and when it is the right choice over its neighbours.

## Native-built (44)

- **avatar-group** — An overlapping row of avatars with an overflow count.
  Use for "assigned to" or participants; one identity is the web `avatar`, which native shares.
- **bottom-sheet** — The native overlay that slides up from the bottom: snap points, drag handle, its own scrolling content, and keyboard avoidance once `appearance.behaviour.keyboardAvoidance` is true (off by default).
  Use for detail, pickers and short forms; opened ONLY via `controlDrawer` `{drawerId, operation:'show'}` — `controlBottomSheet` does not exist.
- **button** — The labelled tap target, confirmed tappable on native, with loading arc over the label and haptic/press feedback.
  The default for any explicit action; icon-only is `icon-button`, a tappable region is `pressable`.
- **button-group** — A segmented toggle or row of related buttons holding a selected value.
  Use for a compact choice between a few options; a long list of options is `repeatable` or a form field.
- **calendar** — A month/week/agenda calendar of events from bound data (componentType `EventsCalendar`, sheet `native/blocks/events-calendar`), with day selection events.
  Use for scheduling views; a simple date picker is the Form's date field, not this block.
- **camera** — Opens the device camera for a photo or video capture and exposes the captured file.
  Use for capture flows (KYC, proof of delivery); a styled photo experience with overlays is `photo-booth`.
- **card** — A bordered panel with `header`/`body` Stack slots and a tappable surface (`onClick` works on native).
  Use to frame a unit of content that may also be tapped; plain grouping is a `stack`, a repeated row template should be Stack + Typography (a Card row renders empty on raw-written pages).
- **carousel** — Paged, swipeable slides with pagination dots; one slide visible at a time.
  Use for banners, onboarding, galleries; a horizontally scrolling rail of items is a horizontal `repeatable`.
- **chart** — A chart from a bound series. Only pie, gauge and line render; bar and column render nothing, and every other type draws as a pie.
  Use for numeric series on the phone; a single number tile is `stat-card` (web block, shared).
- **container** — A grid with fixed column ratios; cells hold blocks.
  Use when columns must keep proportions (2:1 layouts); flow layout is `stack`, and customStyles are NOT read here.
- **date-picker** — A date picker (stored componentType `Calendar`, sheet `native/blocks/calendar`; not to be confused with `calendar` above).
  Use for a single date outside a form; inside a form use the form's date field.
- **copilot** — The embedded AI assistant surface on the phone: thread, composer, voice.
  Use to put an agent in the app; composes its own message blocks.
- **copilot-voice** — A voice call with an AI agent, with your own call screen and controls. On MOBILE it is created with two `copilot-video` tiles and a microphone and a camera button; the phone has no screenshare. Gated per client.
  Use for a call with no typed conversation; a typed conversation with a voice mode is `copilot`. Its only sheet, `blocks/copilot-voice`, describes the web scaffold.
- **copilot-video** — One live picture from a running `copilot-voice` session: the person's camera or the agent's video. Gated per client.
  Use inside a `copilot-voice` call screen; on the phone it is a fixed tile, never floating. Its only sheet is `blocks/copilot-video`.
- **counter** — A number stepped up and down with minus and plus buttons, kept between `minValue` and `maxValue`. Use this instead of hand-built +/- pressables.
  Use for a quantity; a number picked outright is `rating` (shared), and a number only shown is `stat-card`.
- **drawer** — An edge panel sliding over the page, opened/closed via `controlDrawer`. It never lifts for the keyboard.
  Use for side navigation or filters; bottom-anchored flows and short forms are `bottom-sheet`.
- **flippable-card** — NATIVE-ONLY: a card with a front and back face that flips on tap.
  Use for reveal interactions (flashcards, offer/detail); a static framed panel is `card`.
- **form** — The schema-driven form with native field renderers, validation, per-field custom styles and keyboard handling.
  Use for any multi-field input; a single field can also be the shared `TextInput` block, with `onChange` wired.
- **icon-button** — A tappable icon with variants, sizes and press feedback; the icon dims while loading.
  Use for compact actions; a labelled action is `button`.
- **icon** — One glyph from the icon registry.
  Decorative only — its `onClick` is DEAD on native; wrap it in a `pressable` to make it tappable.
- **iframe** — The native WebView: renders a URL in-app with an explicit size.
  Use to embed web content; never `data:` URIs (hard crash) and always size it — it paints white for ~2s while loading.
- **image** — Renders an image from URL/upload with fit and radius; needs explicit width/height styles or the box is 0 until load.
  Use for pictures and logos; a person is `avatar`, a photo grid is `repeatable`.
- **key-value** — Label/value rows from a bound object or explicit pairs.
  Use for detail screens; editable pairs are a `form`.
- **loader** — Arc spinner (`DEFAULT`), animated mark (`AI`) or `CONTENT` skeleton (bars or one solid block) sized by its own styles. Use this instead of hand-built skeleton stacks (`CONTENT` needs `styles.width` and `styles.height`).
  Use as a SIBLING beside the content it stands in for, visible while the source has neither `data` nor `error`, never on `isLoading` alone (`concepts/pages/loading-states`); a Button's or IconButton's own spinner is its `appearance.loading`.
- **lottie-animation** — Plays a Lottie animation; on native reads the file extension/type, and autoplay must be written explicitly (absent = off on native).
  Use for illustrative motion; a plain spinner is `loader`.
- **mobile-contextual-dialog** — NATIVE-ONLY: a popover/action sheet anchored to a trigger with its own trigger events.
  Use for inline menus and quick actions on the phone; the web `contextual-dialog` does not exist here. It opens only from its trigger and has not been checked on a device yet — prefer `bottom-sheet` when a sheet will do.
- **module** — Embeds another interface module with inputs and outbound events.
  Use to reuse a screen fragment; the module's own contract comes from `get_module_options`.
- **organization-chart** — Registered, but its native build renders nothing. Do not use it.
  Show reporting lines with a `repeatable` or your own layout.
- **pdf-viewer** — Renders a PDF in-app with paging.
  Use to show documents inline; download-only is a `button` with `downloadFile`.
- **photo-booth** — NATIVE-ONLY: a guided camera experience with overlays, framing and retake.
  Use for identity/document capture with guidance; raw capture is `camera`.
- **pressable** — NATIVE-ONLY: the tap primitive — a flex container (direction, align, justify, wrap) that fires `onPress`, with ripple/opacity/haptic feedback and `hitSlop`.
  Wrap anything that must respond to a tap (Stack/Icon onClick are dead); do NOT put a Stack inside it just for layout — it lays out its own children.
- **qr-code** — Renders a QR code from a text value.
  Use to display a code for another device to scan; scanning is `scanner` (gated per client).
- **repeatable** — The VIRTUALIZED list: a row template per item of a bound array, and in practice the page's scroll owner (`scrollable:true` + `customStyles {flex:1}`). Arrives with one template child and holds exactly one — a `create_block` under it while the scaffold stands is refused; delete the scaffold in an earlier step, or build inside it.
  Use for any data-driven list; never wrap it in a `scrollable` (kills virtualization, breaks pagination/pull-to-refresh) and never put inputs in its rows (they don't take taps).
- **scrollable** — NATIVE-ONLY: a plain scroll container for FIXED content (a bounded panel, a horizontal rail); not virtualized.
  Use when static content overflows; long data belongs in a `repeatable`, and it needs a bounded height — `flex:1` inside another scroll region collapses to 0.
- **signature** — A signature pad that captures a drawn signature as an image/file.
  Use for consent and approvals; general drawing is not supported.
- **stack** — The layout box: column/row, gap, alignment, padding, background, plus native-only gradient/blur/keyboard via customStyles (the gradient's shape: [gradient.md](gradient.md)).
  The default container; it scrolls only with a scroll `overflow` token from its sheet, and its `onClick` is DEAD — prefer `scrollable`/`repeatable` to scroll, `pressable` taps.
- **step-separator** — The connector/label piece between steps of a stepper.
  Use only inside a `stepper-v2` layout; on its own it is decoration.
- **stepper-v2** — Multi-step flow with progress indicator and `controlStep` navigation.
  Use for wizards; section switching is `tabs`.
- **stories** — NATIVE-ONLY: Instagram-style full-screen stories with progress bars, tap-to-advance and swipe between groups.
  Use for onboarding narratives or content highlights; a paged banner is `carousel`.
- **swipeable-stack** — NATIVE-ONLY: a stack of cards the user swipes left/right to dismiss/accept (Tinder-style), firing swipe events.
  Use for triage and card decks; ordinary paging is `carousel`.
- **table** — The data table on the phone: typed columns, sorting, row actions, add-ons. It loads more rows on scroll only. There is no pager on the phone. Lists page with `repeatable` set to `INFINITE`.
  Use for record sets; a card-per-row list is `repeatable`, which scrolls better on small screens.
- **tabs** — Tabbed sections with an active value, native tab bar styling via customStyles parts.
  Use for in-page view switching; the most robust tab strip for custom looks is a Pressable-based recipe (see the pressable sheet).
- **typography** — All text: variants, weight, colour, truncation.
  Text goes here and nowhere else; it is not tappable on native — wrap in `pressable` for a text button.
- **video** — Plays a video from URL/upload with controls.
  Use for media playback; capture is `camera`, animation is `lottie-animation`.

## Shared with web (30)

These have no native build; the cross-platform component renders. Most still
have a `native/blocks/…` sheet, and on MOBILE that is the one to read
(`app-native` § Sheets on a native target). The rules in the `app-native`
SKILL.md still apply.

Alert, Avatar, Checkbox, CopilotInput, Dictation, Divider, FileUpload, Filters,
FloatingActionButton, Link, Marquee, Media, MessageInput, Modal, PinInput,
Progress (stored `ProgressBar`), RadioButton, Rating (stars picked by a tap),
RepeatableGrid, RepeatableList, Scanner, SingleSelect, StatCard, StepIndicator,
SwipeableButton, Tag, TextArea (typing works; inside a BottomSheet
`focusTextArea` does nothing), TextInput (wire `onChange`; a password is
`content.inputType: "password"`), Timer, Toggle.
