# Guide

How to work with UnifyApps Headless, from an empty folder to a finished change. Install the plugin first: see [Install](./README.md#install).

## One folder per solution

Every UnifyApps solution you work on gets a folder of its own on your computer.

- **Start something new in a new, empty folder.** Before you begin, make sure you know which folder you are working in.
- **The folder holds everything about that solution:** which tenant and solution it is, the plans, the notes, the cached copies of its apps, objects and automations, and the history of what was built. UnifyApps Headless writes these for you.
- **Do not mix solutions in one folder.** Don't work on two solutions in the same folder, and don't move files between solution folders. To work on another solution, open its own folder.
- **Coming back later?** Open the same folder again. Everything from last time is still there.

For example, keep a **UnifyApps** folder with one folder inside it for each solution: **Purchase Orders**, **Leave Manager**, **Customer Portal**.

## 1. Open your agent in the solution's folder

1. Make a new, empty folder for the solution, for example **Purchase Orders**, wherever you keep your work.
2. Open Claude Code (or Codex, OpenCode or whichever agent you installed the plugin in), and choose that folder as the one to work in. In the desktop apps, pick the folder when you start a new chat or project.

Everything from here on happens in a chat in that folder.

## 2. Set up the folder

In the agent, type:

```
/ua:setup
```

In Codex type `$ua:setup`. In Copilot CLI, ask in words: "set up UnifyApps Headless here".

Setup asks a few questions and does the rest:

1. **Your tenant:** the UnifyApps address you work on, such as `your-company.unifyapps.com`.
2. **Sign in:** your browser opens the tenant's sign-in page. Sign in there and setup carries on by itself. If no tab opens, the agent shows you a link to paste into your browser.
3. **Your solution:** pick an existing solution or create a new one.

When setup is done, the folder is linked to that solution. You only do this once per folder.

## 3. Ask for what you need

Describe the work in your own words. You don't need to know the platform's screens or terms.

```
Add a purchase order form. Orders over $5,000 need a manager's approval.
```

```
Show me every automation in this solution that writes to the Invoice object.
```

```
The Orders page is slow to open. Find out why and fix it.
```

UnifyApps Headless reads your tenant, works out what the change touches, builds it, and reads each part back from the platform before it says done. It always asks before deleting anything.

To review a plan before anything is built, type `/ua:plan`.

## 4. Use a loop for bigger work

A loop runs a whole piece of work end to end: it plans, builds, checks the result and fixes what the check finds, until the work is done.

| Command | Use it to | Example |
|---|---|---|
| `/ua:build-loop` | Build a feature, a page or a ticket, from a description, a Figma link or a ticket | `/ua:build-loop Build the Purchase Orders list page from this Figma: <link>` |
| `/ua:repair-loop` | Fix what is wrong, whatever it is about | `/ua:repair-loop The approval automation fails for orders with no manager` |
| `/ua:scope-loop` | Turn an idea or call notes into a plan and tickets | `/ua:scope-loop Customers want to track their orders online` |
| `/ua:test-loop` | Write and run tests for an app or an AI agent | `/ua:test-loop Test the New Order page` |
| `/ua:review-loop` | Review a finished app before a demo or go-live | `/ua:review-loop Review the Purchase Orders app` |

You can also just say it in words, such as "build this page from the Figma" or "fix the approval automation", and UnifyApps Headless picks the right loop.

Loops leave pages and apps as drafts. Nothing is published until you say so.

## Tips

- **Another solution means another folder.** If you ask about something on another tenant, UnifyApps Headless offers to start a new chat in a folder for it.
- **Signed out?** Run `/ua:setup` again and it signs you back in.
- **Something went wrong?** Type `/ua:give-feedback` to send a report with what happened. Nothing is sent unless you run it.
