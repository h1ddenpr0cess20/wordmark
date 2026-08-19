# Autonomous Work

Autonomous work turns a single message into a run: instead of answering once and stopping, the assistant keeps taking turns until the goal is met, the turn budget runs out, or you stop it. It is built on the prompt queue — the same queue that holds messages you type while a response is streaming — with one addition: the assistant can put work in it too.

Off by default. Every step is a billed request, so nothing runs unattended until you switch it on.

## Turning it on

**Settings → Agent**:

- **Keep Working Toward the Goal** — the switch. While it is off, no run starts and the `queue_followup` tool is not offered to the model at all.
- **Turn Budget** — how many turns a run may take before it pauses and asks whether to continue. Default 8, range 2–50.

Switching the feature on also switches on **Auto-Compact History** (Settings → Model) if it was off, and says so. A run spends many turns on one conversation and will outgrow the history budget partway through; without compaction the oldest turns are dropped outright, which is how a run forgets the goal it was given. It stays a normal checkbox — turn it back off if you want, and switching autonomous work off again leaves it on.

Switching the feature off ends any run in progress.

## How a run works

Send a message while the feature is on and it becomes the run's goal.

1. **The goal is framed.** While a run is active, the developer message gains a short block naming the goal, the current turn number, and how many turns remain. The assistant knows it is one step into a longer effort rather than answering a one-off question.
2. **The turn runs normally.** Streaming, reasoning panels, tool calls, attachments, compaction, and persistence all behave exactly as they do in ordinary chat — a run is made of ordinary turns.
3. **The next step is chosen**, by whichever of these applies first:
   - **The model schedules it.** If it called `queue_followup`, those steps are already queued and are used as-is.
   - **The continuation check decides.** Otherwise a cheap, non-streaming request — outside the conversation, with no tools — is asked whether the work is finished. It answers `CONTINUE` with the next instruction, `DONE` with what was accomplished, or `BLOCKED` with what it needs from you.
4. **The queued step is sent** as a normal turn, and the loop repeats.

The run remembers what it has scheduled: the steps still queued, and the ones already sent as turns. Both lists are named back in the developer message block, so the model plans around them instead of restating them, and both are what a new step is checked against.

A run ends when the check says `DONE` or `BLOCKED`, when the budget is spent, when a turn fails, or when you stop it.

### The continuation check

The check is deliberately asked *outside* the conversation. It sees the goal, the last reply, the turn count, and the steps the run has already queued or sent — not the transcript — so an assistant turn ending in "shall I keep going?" cannot talk it into continuing. An unreadable or empty answer is treated as `DONE`: the safe failure for a loop that spends money is to stop, and so is a `CONTINUE` that hands back an instruction the run has already worked through.

### No step is scheduled twice

A model cannot see the queue, so left to itself it re-plans from scratch each turn and schedules the work it just finished — or queues a step and then carries it out in the same turn, only to be handed it again afterwards. Every such copy costs a turn of the budget redoing finished work.

Three things prevent it:

- **The plan is listed back.** While a run is active the developer message names what is queued and what has already been sent, with instructions not to schedule either again — and not to queue work the current turn is doing.
- **Repeats are refused.** A step matching one the run has already queued or sent — or the goal itself — is turned away rather than appended. Matching ignores case, wrapping, bullets, emphasis, numbering, and trailing punctuation, so a re-phrased copy of the same instruction still collides.
- **Refusals are explained.** `queue_followup` reports the skipped steps in a `duplicates` list and says why, instead of silently accepting or silently dropping them. The rest of the batch still queues — a duplicate in the middle of a list of new work does not discard the work after it.

A step you remove from the queue by hand counts as dealt with: the run will not schedule it again.

## The control bar

While a run exists, a bar sits above the composer showing what it is doing and how much of the budget it has spent:

- **Pause** — halts at the current checkpoint. The in-flight turn finishes; nothing new is sent.
- **Resume** — picks the run back up with the turns it already spent still counted.
- **Continue** — shown when the budget is exhausted. Grants a fresh budget rather than raising the ceiling, so pressing it always means the same amount of further work.
- **Stop** / **Dismiss** — ends the run and discards the steps it had planned.

Pausing and stopping discard any steps the run had queued; exhausting the budget does not, so **Continue** picks the plan back up where it left off.

The composer's own stop button ends the run too, along with everything in the queue.

## Redirecting a run

Type any time. Your message is queued like any other, which now means it reaches the turn in progress — interrupting the reply in flight if need be — and if it cannot travel mid-turn it **jumps ahead of the steps the run scheduled for itself** — a correction should not wait behind the model's own plan. Queued messages are shown as chips above the composer: your own with a dashed border, the run's steps with a solid accent edge and a `step` badge. Any chip can be removed individually.

## The `queue_followup` tool

A client-side function tool, offered only while autonomous work is on. The model calls it with a list of instructions; each is queued as its own turn, in order. Steps should be self-contained — the turn that receives one sees the conversation, not the reasoning that scheduled it — and should be work the current turn is *not* doing, since a step carried out here comes back as a turn anyway.

The tool reports back exactly what was accepted. When the queue's depth cap truncates a batch, the model is told how many were rejected rather than being left believing in work that will never happen; when a step repeats one the run already queued or already sent, it is skipped and named in `duplicates`.

It appears in **Settings → Tools** as *Queue Follow-Up Work* while the feature is on, and disappears when it is off.

## What bounds a run

A loop that can feed itself can also spend money forever. Five limits apply:

| Limit | Effect |
| --- | --- |
| **Turn budget** | The run pauses and asks before spending more. |
| **Failure rule** | An errored, empty, or stopped turn pauses the run instead of sending the next step into whatever broke. |
| **Queue depth cap** | At 25 parked prompts the queue refuses more outright, and says so. |
| **Duplicate rule** | A step repeating one the run already queued or already sent is refused, so the budget is never spent redoing finished work. |
| **Tool-loop cap** | Unchanged from ordinary chat: at most 20 tool-call iterations within a single turn. |

Beyond those: agent-authored queue entries only leave the queue while a run is running and inside its budget. A paused, exhausted, or finished run leaves its planned steps in place rather than sending them unattended.

## Limits and interactions

- **Runs are runtime-only.** A run is not saved with the conversation. Reloading the page, or switching to another conversation, ends it — the transcript survives, the run does not.
- **Party mode takes precedence.** No run starts while a party is active; Party mode has its own turn loop and its own interjection queue.
- **Every turn counts against the budget**, including messages you type mid-run. They are turns of the run.
- **Compaction matters.** A long run will outgrow the history budget, which is why enabling autonomous work enables **Auto-Compact History** too. If you turn that back off, expect a long run to lose its earliest turns — including the goal.

## Where it lives

| Concern | Module |
| --- | --- |
| Run lifecycle, budget, continuation, control bar | [`services/agent/agentRunner.ts`](../src/ts/services/agent/agentRunner.ts) |
| Run instructions, decision prompt, decision parser | [`services/agent/agentPrompts.ts`](../src/ts/services/agent/agentPrompts.ts) |
| `queue_followup` handler | [`services/agent/agentTools.ts`](../src/ts/services/agent/agentTools.ts) |
| Settings persistence | [`services/agent/agentSettings.ts`](../src/ts/services/agent/agentSettings.ts) |
| The queue itself | [`components/promptQueue.ts`](../src/ts/components/promptQueue.ts) |
| Turn lifecycle and the drain | [`components/interaction.ts`](../src/ts/components/interaction.ts) |
