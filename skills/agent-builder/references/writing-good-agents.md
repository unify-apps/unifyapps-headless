# Writing an agent that is any good

`SKILL.md` covers making an agent **work**: the fields it needs, the switches that must be on, the traps that answer 200. This file covers making it **good**, for any job. That could be a refund helper, an HR policy desk, a sales lookup, an IT triage bot, or anything else.

Every rule here has a reason. The reason is the part to keep, because it lets you handle a case this file never mentions.

## Contents

- [Think before you write](#think-before-you-write)
- [Put each thing in the right place](#put-each-thing-in-the-right-place)
- [Shape the instructions](#shape-the-instructions)
- [Word every rule so a model can follow it](#word-every-rule-so-a-model-can-follow-it)
- [Name what the agent has](#name-what-the-agent-has)
- [Answer from sources, and say when you do not know](#answer-from-sources-and-say-when-you-do-not-know)
- [When to ask and when to go ahead](#when-to-ask-and-when-to-go-ahead)
- [Scope, refusals and handing over](#scope-refusals-and-handing-over)
- [Actions that change something](#actions-that-change-something)
- [Tasks](#tasks)
- [Tool descriptions](#tool-descriptions)
- [One agent, many models](#one-agent-many-models)
- [Test it, then change one thing at a time](#test-it-then-change-one-thing-at-a-time)
- [On this platform](#on-this-platform)
- [Signs of weak instructions](#signs-of-weak-instructions)
- [Check before you publish](#check-before-you-publish)
- [A worked example](#a-worked-example)

## Think before you write

Most weak agents are weak before the first word of the instructions. Answer these questions first, in writing. If you cannot answer one, the agent will not be able to either.

1. **Who uses it, and what do they want done?** "Employees ask about leave" is a start. "Employees check how many leave days they have left and ask what happens to unused days at year end" is something you can build and test.
2. **What does a good answer look like?** Write at least 3 real questions and the answer you would be happy with. These become your first tests.
3. **What must it never do?** Promise money, share one person's data with another, give legal advice, change a record without asking. Name them.
4. **Where do the facts come from?** A document, a tool, the person in the chat. An agent with no source for a fact will invent one.
5. **What happens when it cannot help?** Say who it hands over to, and how.
6. **What can it change in the world?** Every tool that writes something needs its own rule about when to ask first.

Start from what your company already has. A policy, a help article or a script a person follows today is the best first draft of a task.

## Put each thing in the right place

An agent has several places to hold what it knows. They are read at different times, so they cost different amounts.

| Place | When the model reads it | Put here |
|---|---|---|
| **Role** | every turn | one line: who the agent is |
| **Goal** | every turn | one line: what it is for |
| **Instructions** | every turn | how it behaves in every conversation |
| **Task** | when a request matches that task | one job, with its own steps and tools |
| **Skill** | when the agent loads it by name | guidance for one situation, too long for the instructions |
| **Document** | when the agent searches | facts: policies, price lists, product details |
| **Tool description** | every time it decides whether to call the tool | what the tool does and when to use it |
| **Automation** | when a tool runs it | steps that must happen in a fixed order, and checks that must pass |
| **Guardrail** | on every message, outside the model | topics it must refuse, data it must mask |

Three rules decide most cases:

- **Behaviour goes in instructions, facts go in documents.** "Answer leave questions from the leave policy" is behaviour. The leave policy itself is a document. If you paste the policy into the instructions, the agent pays for it on every turn, and the copy goes out of date the day the policy changes.
- **Keep the instructions for what applies every turn.** The model reads them on every turn, so every extra line costs something on every turn. A rule that matters for one kind of request belongs in that task or a skill.
- **A check beats a sentence.** A line in the instructions is a request the model can forget. If something must happen exactly, and every time, put it where the model cannot skip it. That means an automation for a fixed order of steps, a required tool input for data that must be there, a guardrail for a topic it must refuse, and a yes from the person before a payment or a delete. More than 3 steps that must run in order is too many for instructions. Keep a sentence as well, so the agent can explain what happened.

## Shape the instructions

**Open with who the agent is.** One plain sentence: "You help employees of Acme understand and use their leave." Naming the role does work no list of rules can.

**Use a few short sections, in the same order every time.** For example: who you are, how you work, rules, how to answer. The model finds its way around them more easily, and so does the next person who edits them.

**Write at the right height.** There are 2 ways to get this wrong. Too low is a script for every case: "If the user says X, reply Y." It breaks on the first question you did not predict. Too high is a wish: "Be helpful and accurate." It gives the model nothing to act on. Aim between them. Pin the **what** (inputs, outputs, limits, what is forbidden). Leave the **how** to the model, with a short rule of thumb.

**Keep it lean. The number of rules is what matters.** A model follows each rule less reliably as the number of rules grows. There is no safe number, and every new rule competes with every old one. Before you add a rule, ask whether it can replace or merge with one that is already there.

**State each rule once.** Saying the same rule 4 times does not make it stronger. It wastes space and weakens the other rules.

**Remove rules that contradict each other.** Models handle a contradiction badly, and each model handles it differently. Some spend effort trying to satisfy both rules. Others simply follow whichever rule comes later. Either way, you did not decide the outcome.

**Put the most important rules first.** Models favour earlier instructions, and in a long text the middle gets the least attention. If the instructions are long, repeat your single most important rule at the end.

**Write steps as a numbered list** when they have an order: check the order number, look the order up, then answer. Write the rest as short paragraphs. Remember that the model may still skip a step. If skipping it would do harm, move the order into an automation (see above).

## Word every rule so a model can follow it

**Say what to do, not only what to avoid.** "Don't use jargon" leaves the model guessing what to use instead. "Use the words an employee would use: 'days off', not 'accrual units'" tells it.

**Give every "never" a reason and something to do instead, in the same sentence.** A bare "never" is where models freeze or invent. The reason lets the model apply the rule to cases you did not list.

> Weak: `Never give tax advice.`
>
> Strong: `You are not a tax adviser, and a wrong answer can cost the employee money. When asked about tax, explain what the payslip shows and suggest they speak to payroll or their own adviser.`

**Show the words when the words matter,** and say whether they are fixed. "Decline politely" produces anything. A sample sentence produces something close to it. But models copy sample sentences word for word, and an agent that says the same sentence to every person sounds like a machine. So say which it is. "Say exactly:" is for legal or safety wording. "For example:" means the model should vary the words.

> Weak: `Tell the customer politely that the discount has expired.`
>
> Strong: `Tell the customer the code has ended and offer what's on this month. For example: "That code ended on 31 March, so I can't apply it. I can show you what's on offer this month instead."`

**Show an example, not an adjective.** "Write a good summary" means something different to every model. One short example of a good summary, next to a bad one, teaches more than a paragraph of description.

**Don't ask for what the model already does.** Telling it to be polite or helpful adds a rule and changes nothing. Spend the space on what is special about your job.

**Use capitals and "CRITICAL" for one or two rules at most.** When every third line shouts, nothing stands out. Heavy "MUST" wording also makes models over-react. They call tools when they should not, and fill in tool inputs they do not have. Save emphasis for the rule whose failure you cannot undo.

**Give a default for judgment calls instead of a list of cases.** One sentence like "When unsure whether a request is in scope, treat it as out of scope and say what you can help with" covers cases a list of 20 would miss.

**Leave out history.** "We added this after an incident in March" means nothing to the model. Write the rule and its reason, not how it got there.

## Name what the agent has

Attaching a document or a skill makes it **reachable**. The instructions are what make it **used**.

An agent had a document attached, indexed, with the knowledge switch on. It answered "that is not in my knowledge" to 7 questions in a row. One line added to the instructions, and it quoted the document on the first try:

```
When asked about anything factual, FIRST search your company knowledge, then answer from what you find.
```

So:

- **A document:** tell the agent to search it, and for what.
- **A skill:** tell it to load the skill when a request matches, and name the skill exactly.
- **A tool:** you don't need to list every tool. The model already sees each tool's name and description. Name a tool in the instructions when two tools could fit the same request, or when it must be called at a certain step.

**Use the exact name.** A name that is almost right works worse than the exact name. "The Leave Balance tool" and `GetLeaveBalance` are not the same to a model. And never name something the agent does not have. It will try to use it, or apologise that it can't.

**Tell the agent to search, but not how to search.** Instructions cannot change how the search ranks documents. Lines like "prefer newer documents" or "match on the title" do nothing, so leave them out. If the right passage is not found, fix the document: split it, give it clear headings, or use the words people really use.

## Answer from sources, and say when you do not know

Your company's policies, prices and people are in no model's training. A model that is not told where to look will answer from general knowledge. It will sound sure and be wrong.

**Make checking a step, not a hope.** "Be accurate" is a hope. "Before you answer a question about a policy, search the policy documents, and quote the line you used" is a step.

**Always pair "don't guess" with what to do instead.** A "never guess" rule with no way out is exactly where a model invents something, because it still has to say something. Give it the exact words to use:

```
If the documents do not answer the question, say: "I don't have that information." Then say what you did find, and offer to pass the question to the HR team.
```

**Documents make "I don't know" harder, not easier.** A model given documents that do not quite answer the question gives a wrong answer far more often than a model given no documents at all. A passage that is almost right looks like permission to answer. Instructions alone do not fix this. Test it with questions your documents *nearly* answer (see [testing](#test-it-then-change-one-thing-at-a-time)).

**Prefer a clear "I don't know" to a made-up answer.** People believe a fluent answer. A confident wrong answer about a refund, a salary or a contract does more harm than no answer at all.

**Ask for the source in the reply** when it matters: "Quote the policy line you used." That makes the agent's evidence visible, and a missing quote is easy to spot in a test.

**Tell the agent to look up account facts, but don't force a tool call on every turn.** "Before you say anything about an order, look it up" is good. "You must call a tool before every reply" is not. It makes the model invent tool inputs when it has none. Add the way out: "If you don't have the order number, ask for it."

## When to ask and when to go ahead

Models differ a lot here, so never leave it to the model. Some models ask too often. Others almost never ask. If the instructions say nothing, the same agent behaves differently on each model.

**Going ahead is the default. Asking must pass 2 tests together:**

1. One answer from the person would unblock you, **and**
2. A wrong guess would cost more than the time it takes to ask.

If a sensible guess exists and a wrong guess is cheap to fix, make the guess, say what you assumed, and carry on. "I've assumed you mean this year's leave. Tell me if you meant last year's."

**Two cases always pass the test, so always ask:**

- **A required detail is missing.** Never invent an order number, a date or an amount. Ask for it.
- **The next step changes something:** cancel, refund, send, book, delete. Show what you are about to do and wait for a yes.

**Ask about the goal early, and about missing details when you need them.** If you don't know what the person is trying to do, ask at the start, because the answer changes everything after it. If you only need one detail, ask for it at the point you need it.

**When you offer choices, offer 3 or fewer,** each short and plain. Test the question before you ask it. If the person could pick any option and you would still need to ask again, the question is badly formed.

**Treat a question as a question.** "Can I carry leave over?" asks for information. It does not ask the agent to submit a leave request. Only act when the person uses a clear action word, such as "book", "cancel", "update" or "send".

## Scope, refusals and handing over

**Say what the agent does not do, as plain facts.** "You cannot change a payment. You cannot see other employees' records." A model told its limits refuses early and cleanly. A model left to find them out tries, fails, and invents an explanation.

**Fence the scope in both directions, in one sentence.** "Do exactly what was asked. Suggest related help at the end, but don't do it unless asked, and don't stop halfway."

**Every refusal names the reason and the next step.** Stopping at "I can't help with that" leaves the person nowhere.

> Weak: `I can't help with that.`
>
> Strong: `I can't change a salary. The payroll team can, and you can reach them at payroll@acme.example. Would you like me to draft the request?`

**Say when to hand over.** 2 triggers apply to almost every agent:

1. **It has failed more than once** at the same thing.
2. **The request is high-risk:** a large refund, a cancellation, anything legal or medical, anything it cannot undo.

Name the person, team, channel or form it hands over to. A handover is a success, not a failure, when the agent is out of its depth.

**Use a guardrail for any topic it must never discuss.** The instructions explain the refusal, and the guardrail makes sure it happens.

## Actions that change something

A tool that reads is cheap to get wrong. A tool that writes, sends, pays or deletes is not, and most have no undo.

1. **Sort the tools by risk.** Use low, medium and high, based on 3 questions. Does it only read? Can it be undone? Does it move money? Write the high-risk list into the instructions: "Before you cancel an order, issue a refund, or email a customer, show what you are about to do and wait for a yes."
2. **Read before you write.** Look the record up before changing it, so the change starts from what is really there.
3. **Check after you write.** Read the record back, and tell the person what changed. If it did not change, say so. Never report success you have not seen.
4. **Stop after 2 failed tries.** Repeating the same failing step helps no one. Say what failed and hand over.

## Tasks

A task is one named job inside an agent, with its own instructions and its own tools. Split an agent into tasks when it does several jobs that need different steps or different tools. For example, an HR agent might have one task for leave balance, one for leave requests, and one for policy questions.

**The model picks a task mostly from its name and short description.** Write every task as if the name and description are all the model sees when it chooses.

- **Give each task a name and description that sound different from every other task.** What matters most is how different they are. Two tasks that sound alike will be mixed up.
- **Say what the task does and what it does not do.** "Handles leave requests for the employee's own leave. Does not handle leave balances or approvals."
- **Add a few sample requests** in the words a person would use. A few help. A long list does not, because the model starts matching the list instead of the meaning.
- **One job per task.** If you need "and" to describe a task, it may be two tasks.
- **Keep the numbers small.** Aim for at most 10 tasks per agent and 10 tools per task. When the if-this-then-that branches keep growing, build a second agent instead.
- **Give each task only the tools it needs.** A model offered fewer tools picks the right one more often.
- **Keep shared rules in the agent's instructions, not repeated in every task.** Tone, privacy and handover apply everywhere.

**When the agent picks the wrong task, fix the name and description first,** before you touch the instructions.

## Tool descriptions

The description is what the model reads when it decides whether to call a tool. It is an instruction to the model, not documentation for a person. It matters more than anything else about the tool.

Write at least 3 or 4 sentences, covering 4 things:

```
<What it does, starting with a verb>. Use it when <2 to 4 real situations>.
Don't use it for <cases it should not handle>; use <other tool> instead.
Input: <what to pass, with one good example>.
Returns: <what comes back, and any limit, such as "at most 20 results">.
```

> Weak: `Look up an order.`
>
> Strong: `Looks up one order by its number. Use it when the customer gives an order number or asks where an order is. Don't use it to search by name or email; use FindCustomer instead. Input: the order number exactly as the customer wrote it, for example "A-10442". Returns: status, items and delivery date, or "not found".`

**Fewer tools that don't overlap beat many that do.** An agent can handle more than 15 tools that are clearly different, and fail with fewer than 10 that overlap. A simple test: if a person can't say for certain which tool fits a request, the model can't either. Merge overlapping tools, or say in each description when to use the other one.

**Name the inputs so a person would understand them.** Use `employee_id`, not `id` or `user`. When an input is missing, the agent may ask the person for it, and it will word the question from the input's name.

**Return short, useful results and clear errors.** A tool that returns 200 fields makes the model hunt. An error like "order A-10442 not found; check the number" tells the model what to do next. "Error 404" does not. On UnifyApps, what a tool returns is what its automation returns, so shape it there.

**Keep behaviour out of the description.** "Always call this first" is a rule about how the agent works, so it belongs in the instructions. The description says what the tool is, when it fits, and what goes in and out.

**When a tool is never called, or called at the wrong time, fix its description first.** That is almost always the cause, and it is faster than rewriting the instructions.

## One agent, many models

The same instructions may run on Claude, GPT or Gemini, and each model reads them a little differently.

- **Keep to plain words, short sections and plain Markdown.** Avoid tricks that only one model understands.
- **Spell out anything models do differently by nature.** The biggest one is when to ask (see above). Length and format are next. Some models answer short by default, and some don't use lists unless told to. So say how long an answer should be, and whether to use lists.
- **Remove contradictions.** Models differ most in how they break a tie between two rules.
- **Don't write the model's name or a date into the instructions.** "You are model X" or "the latest version is 5" goes stale and breaks when the model changes.
- **Don't demand a fixed thinking format,** such as "think inside <thinking> tags". Models handle these differently.
- **Test on every model the agent will really run on.** What works on a large model may need more detail on a small one.

## Test it, then change one thing at a time

An agent that answers the happy path and invents answers for everything else is worse than no agent, because people trust it.

**Write at least 3 test questions before you write the instructions,** and run them once on a bare agent. That first result is your baseline, and it shows what the instructions really need to fix. Start with almost no instructions, and add them one at a time.

A useful test set has at least these 6 kinds of question:

1. **The job it was built for**, asked the normal way.
2. **The same job, asked badly:** vague, misspelled, or missing a detail.
3. **Just outside what it knows.** It should say so, not guess.
4. **Nearly answered by a document.** This is the question most likely to get a confident wrong answer (see above).
5. **Something it must refuse.** It should refuse, give the reason and point somewhere.
6. **An action that needs a yes.** It should ask before it acts.

Then:

- **Change one thing at a time,** and run the whole set again. Changing 3 things at once hides which one helped and which one broke something.
- **Read what the model was really given,** not only its answer. The trace shows which instructions, documents, tasks and tools reached the model, and which one it picked. When the answer is wrong, the trace usually shows why.
- **Keep the tests.** Every time the agent gets something wrong, add that question to the set.

## On this platform

A few facts about UnifyApps agents change how you write:

- **Instructions are replaced whole.** `update_agent` does not add to them. Whatever you send becomes the entire text. Read the current text with `get_agent`, edit it, and send the full new version.
- **Don't break lines in the middle of a sentence.** The platform shows stored line breaks exactly as they are. `update_agent` joins wrapped sentences back together, and leaves lists and headings alone.
- **A tool's inputs come from its automation.** A tool has no input list of its own. The inputs the bound automation declares are the tool's inputs. If the automation declares none, the model gets a tool it cannot pass anything to, however good the description is. Check what the model was offered with `read_trace`.
- **A fluent apology can mean the agent never ran.** "I'm sorry, I can't process your request right now" often means the run failed before the model answered. `send_test_message` flags this with a warning. Read the trace before you believe a reply that carries one.

## Signs of weak instructions

Check your draft for these:

- **Everything is CRITICAL.** Nothing stands out.
- **A bare "don't"** with no reason and nothing to do instead.
- **The same rule said several times,** or 2 rules that contradict each other.
- **Adjectives instead of examples:** "be professional", "write a good answer".
- **Asking for what the model already does:** "be polite", "be helpful".
- **Facts pasted into the instructions:** prices, policies or dates that belong in a document.
- **Model names, version numbers or dates** in the instructions.
- **A document or skill the instructions never mention,** or a name that does not exactly match.
- **A tool list copied into the instructions.** The model already sees the tools.
- **Lines that try to steer the search.** They do nothing.
- **"Never guess" with no way out.**
- **A long fixed order of steps written as prose,** when it should be an automation.
- **Rules about how to call a tool, stored in the tool's description.**
- **History instead of rules:** "we added this because...".
- **Guilt or threats as control:** "you will be punished if...". It does not work reliably on any model.

## Check before you publish

Every time you change an agent, before you publish:

1. **Read every example in the instructions again.** The model copies an example more than it obeys a rule. An example that breaks a rule teaches the model to break it.
2. **Follow each change through.** When you change a rule, find every place that states it, shows it or depends on it: the instructions, each task, the skills, the tool descriptions. Change them together.
3. **Remove names of anything that is gone.** If you removed a tool, a skill or a document, search the instructions for its name.
4. **Pay for what you added.** If you added a rule, see whether one can merge or go.
5. **Run the test set** on every model the agent uses, and read the trace for anything that surprised you.

## A worked example

An HR leave agent with a policy document, one tool, one task, one skill and a guardrail.

**Role:** `An HR assistant for Acme employees.`

**Goal:** `Help employees understand and use their leave.`

**Instructions:**

```
You help Acme employees with questions about leave: how many days they have, what the rules are, and how to request time off.

How you work
1. For any question about a leave rule, FIRST search the leave policy documents. Answer from what you find, and quote the line you used.
2. If the documents don't answer the question, say: "I don't have that information." Then say what you did find, and offer to pass the question to the HR team at hr@acme.example.
3. When someone is upset or the situation is sensitive (illness, bereavement, a complaint), load the skill "sensitive-conversations" and follow it.
4. If you have tried twice and still can't help, or the request is about pay or a dispute, hand over to the HR team.

Rules
- You can read leave balances. You cannot change them or approve leave; managers approve leave in the HR system.
- You only discuss the employee's own leave, because other employees' records are private. If asked about someone else, say you can only help with their own leave.
- When unsure whether a question is about leave, treat it as out of scope and say what you can help with.

How to answer
Two to four short sentences. Use "days off", not HR terms. No lists unless the person asks for several items. End with the next step if there is one.
```

The instructions don't list the tool. `GetLeaveBalance` is the only tool that returns a balance, so its description is enough.

**The tool's description:**

```
Looks up how many leave days one employee has left this year, by type (annual, sick, personal). Use it when an employee asks how many days they have or whether they can take time off. Don't use it to request leave; the "Request time off" task does that. Input: employee_id, for example "E-20417". Returns: days left per leave type, and the date the year resets.
```

**The task:** "Request time off". Its description says: "Books leave for the employee's own time off. Use when someone wants to take, book or request days off. Does not answer balance or policy questions." Its steps run in an automation: check the balance, confirm the dates, then show the request and wait for a yes before submitting it.

**The skill:** "sensitive-conversations". It holds a few paragraphs on tone and wording, loaded only when needed.

**The guardrail:** a denied topic for medical diagnosis. The agent refuses to discuss symptoms, even when a leave question leads there.

Here is how the parts fit. The document is searched because the instructions say to. The skill is loaded because the instructions name it exactly. The tool is called because its description says when. The fixed order of steps lives in an automation, where it cannot be skipped. The one refusal that must never fail is a guardrail. And every "cannot" comes with a reason and somewhere to go.

