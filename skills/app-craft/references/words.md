# Words on the screen

Every label, button, empty state and message is part of the design. A page
with the right blocks and placeholder words still reads as unfinished.
Adapted from the copy rules the platform's own copilot loads.

1. **Replace every seeded word.** A new TextInput says "Label" and "Enter
   Value", a Button says "Button", a Typography says "Hello world", Tabs say
   "Tab 1". None of these ships. Read the block's sheet for where the
   seeded text lives.
2. **Labels name the thing, in the person's words.** "Green bean lot", not
   "Lot ID"; "Due date", not "Date". Show a format in the placeholder
   ("e.g. 24.5"), not in the label. Use the words the request used, never the
   object's field key.
3. **Buttons say what happens: a verb and a noun.** "Log roast", "Move to
   packed", "Save changes". Never "Submit", "OK" or "Click here". A
   destructive button names what it removes: "Delete order".
4. **An empty state says why it is empty and what to do next.** "No roasts
   logged today. Log the first batch to start the day's count." Not "No
   data". Put the action that fills it beside it.
5. **An error says what went wrong and how to fix it, without blame.**
   "Kilos must be more than 0. Enter the green weight you charged." Not
   "Invalid input".
6. **A success message confirms what changed.** "Order WO-4081 moved to
   Packed." Not "Success".
7. **A confirmation names the action and its cost.** "Delete lot
   ETH-2026-04? Its roast history stays." The buttons repeat the action
   ("Delete lot", "Keep it"), never "Yes" and "No".
8. **Menu and page titles are specific.** "Bean lots", "Roast log", not
   "Items" or "Records".
9. **Do not repeat what the screen already shows.** No subtitle that
   restates the title, no help text that restates the label.
10. **Numbers carry their unit.** "32.4 kg", "45 bags", "3 days late".
