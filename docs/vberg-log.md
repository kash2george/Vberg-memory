# VBerg — Log

**What this file is:** the shared memory of the project. No AI (Claude, Gemini, ChatGPT) remembers what another one did, and none of them reliably remembers past chats. This file does.

**Rules**
1. **Start of every chat, with any AI:** paste or attach this file first and say *"read the log before we start."*
2. **End of every chat:** ask the AI to write a new entry at the top: date, which AI, what was decided, what changed, what's next.
3. **Only George approves decisions.** An AI may propose; a line goes under *Decided* only after George says yes.
4. **Reference files:** `vberg-algorithm-database.md` (full algorithm + database + 10 rules) and `vberg-threads.md` (George's thread model). If an AI suggests something that breaks one of the 10 rules, it must say so.

**Entry template**
```
## YYYY-MM-DD — <AI name>
Decided:
Changed:
Open / proposed (not decided):
Next:
```

---

## 2026-10-09 — Codex
**Decided (George):**
- Approved the VB-1 plan and authorized pushing the task commit and `v1-prototype` tag to GitHub.
**Changed:**
- Tagged pre-documentation main commit `fc09dfa92a5021ed346e590c39805029c88bb1e9` as `v1-prototype`.
- Added the exact v1/v2 note at the top of README.md.
- Copied the three supplied markdown files into docs/; preserved the specification and AI roles unchanged.
- Added root AGENTS.md with unchanged specification §10 rules, AI Roles §1 roles/fix loop, and the four required workflow instructions.
- Added this log entry. No application code changed. All VB-1 documentation changes belong to one commit.
**Open / proposed (not decided):**
- No new design decisions proposed.
**Next:**
- Push the task commit and tag, verify the remote references, and report the result to George.
- Claude reviews VB-1.

---

## 2026-10-09 (12) — Claude
**Decided (George):**
- **Codex** writes code and applies all fixes. **Claude** reviews code and writes the exact fix as a Linear comment; Claude does not edit code. **Gemini** = lab + error-finding agent, read-only, reports only. Only one AI ever writes code.
- `AGENTS.md` goes into the repo (rules, roles, fix loop, "read the log first", "plan first").
- C14 rejected: v1 work continues (George already tested on himself; programs are needed to test on others).
**Changed:**
- `vberg-ai-roles.md` (project + Linear): roles and fix loop updated.
- VB-1 now also creates `AGENTS.md`.
- Spec `vberg-algorithm-database.md`: S3 key rule reworded (3–5 = places, default, dynamic); new **§12** with all of today's decisions (places, play, build order, three roles, metro model, tables, direction, TOC, sea level). Accepted from review: C1, C3, C4, C5 (as §12.3). Still open: C2, C6–C13.
**Next:** Codex starts VB-1. Claude reviews when done.

## 2026-10-09 (11) — Claude
**Decided (George):**
- **Moving the cut line redraws the screen by itself.** Lower water = more of the structure visible, but always grouped into 3–5 places; higher water = only the peak, in full detail. Zooming never floods the screen.
- **Data appears on screen directly as a mind map**, with no manual drawing, no file editing, and **no AI needed**: the algorithm alone reads threads, moves the cut, splits, and draws.
- **Three roles:**
  - **Algorithm:** always; reads data, splits, draws, moves the cut. Fast, free, offline.
  - **AI:** only the **first appearance**: suggests the best first split by meaning (e.g. week as 2–3–2, not 3–3–1; keep "identify analyze evaluate" together). Never changes data or order, only where boundaries go.
  - **Person:** always plays (moves boundaries, builds in any order); context never breaks.
- The AI's first split is **saved** as the home view, so the same content always opens the same way. A person's regroup replaces it as the new home.
**Note:** this assigns who does the semantic split that both reviewers proposed (C5).

## 2026-10-09 (10) — Claude
**Ideas (George):**
- **Every thread has a start and an end** (math: 0 → 1). The whole database has no single start; you choose the entry. Cycles (PDCA) get a chosen start for display only.
- **The table of contents is the door.** A book does not fit on a screen; its TOC (1–2 pages) does. The TOC is a thread and a compression of the whole book; zooming into a heading opens its thread. For import: take the TOC/headings as the **first hill** (the author already structured it). 3–5 grouping applies to long TOCs.
- **Cross-section of the hill ("sea level"):** imagine the hill as a mountain built from database threads. A horizontal cut: everything **above** the cut is on screen; just **below** is loaded in memory, ready when you move; deep below stays in the database. Height = importance relative to focus. Moving or zooming moves the cut.
**Found:** the cut is the same idea as Furnas's degree-of-interest threshold (1986): show only items whose interest is above a threshold. The three layers map to screen / RAM cache / database, and to the spec tiers FULL / MEDIUM / AGGREGATE / LANDMARK.
**Open:** add the TOC-first import and the sea-level model to the spec (v2), after VB-5 decisions.

## 2026-10-09 (9) — Claude
**Decided (George):**
- **Reading direction follows the language of the thread.** Left → right for Swedish/English, right → left for Arabic (the climb starts on the right), top → bottom for vertical Chinese/Japanese (the hill turns sideways). Only the thread's language is stored; direction is chosen at display.
- **A table is threads that cross:** every row is a thread, every column is a thread, every cell is an intersection. Rows vs columns is only screen direction.
**Changed:** spec `vberg-algorithm-database.md`: S7 no longer assumes left → right; §1b gets "A table is threads that cross".

## 2026-10-09 (8) — Claude
**Idea (George), answering the "Controls" problem:** use threads, not one line. Security is one thread, accounting another. Threads can meet; the peak of the hill can be the meeting point, and from there you switch to the new thread.
**Model (metro map):** thread = line, point = station, intersection = interchange station = hill peak.
- Same idea in two subjects → **one** point, a real interchange.
- Same word, different meaning → **two** points, one on each line (like two stations called "Centralstation" in different cities). A shared word alone never creates an interchange.
- Same point twice on one thread (Plan → Build → Review → Revise → Review) = a loop line passing a station twice → each **pass** (placement) has its own ID.
**Note:** this answers review proposals C1 (no merge by text), C3 (placement IDs) and part of C2.
**Open:** who decides two stations are the same: George by hand, or computer suggests + George confirms?

## 2026-10-09 (7) — Claude
**Idea (George):** we wrongly assume learning must go from the first letter to the last. Like a child building a word from letters, you can start anywhere. Two different orders:
- **Result order (fixed):** the word / the week stays correct. Context is never broken.
- **Build order (free):** where you start placing pieces is up to the learner (middle, end, anywhere).
**Found:** fits the serial-position effect (start and end of a list are remembered best, the middle worst). The hill puts the middle at the peak, so starting from the peak trains the weakest part first.
**Proposed (not decided):** a practice mode where the hill shows empty slots in fixed order and scrambled pieces; the learner places pieces in any order; each piece only fits its own slot. The v1 prototype already has a practice input to build on.

## 2026-10-09 (6) — Claude
**Decided (George, in his words, answering the reviews):**
- He tested VBerg on himself and found a clear difference; next is testing on other people, which is why he wants to build the programs.
- **3–5 is about places, not working memory:** each group must have its own place (on paper, screen, or board).
- Handwriting is probably best for memory, but VBerg also works for him.
- Memory does not come from just writing: there must be **imaginative interaction**, the feeling of climbing up the hill and coming down.
- **Splitting is dynamic, never forced.** The user **plays** with the split and with how many items each group gets.
**Found:** 7 items (days of the week), order kept, 3–5 groups = **50** possible splits (15 + 20 + 15). If items could be mixed freely between groups: 791.
**Open:** reviewers' critique of 3–5 targeted the working-memory justification; George's justification is spatial (one place per group). Spec should be reworded accordingly. The "play" with splits may also answer the E1 risk (Data Mountain benefit came from the user's own act of arranging).

## 2026-10-09 (5) — Claude
**Changed:** Gemini (VB-6) and ChatGPT (VB-7) reviews received → Done. VB-8 comparison posted on VB-5: agreements, differences, citation check, and 14 proposed changes (C1–C14).
**Found:** both reviewers independently agree on: E1 is the weakest assumption; 3–5 is over-applied as a hard rule; split() should use semantic costs (DP / TextTiling family); never merge nodes by matching text. Gemini had 4 faulty citations (wrong title/journal or mischaracterised); ChatGPT's checked out.
**Open / proposed (not decided):** C1–C14, waiting for George's accept / reject / later.
**Next:** George fills the decision column on VB-5. Then Claude updates the spec with accepted changes only.

## 2026-10-09 (4) — Claude
**Decided (George):** before building v2, the spec gets an **independent review** by Gemini and ChatGPT. Claude wrote the spec, so Claude does not review it; Claude only compares the two reviews without judging. v1 work (VB-1–3) continues in parallel.
**Changed:** Linear: **VB-5** review (parent, George) → **VB-6** Gemini review · **VB-7** ChatGPT review · **VB-8** comparison table (Claude, blocked by VB-6 + VB-7). New Owner label `ChatGPT`. Owner labels are single-select (multi-select not available in this workspace), so each reviewer has its own sub-issue.
**Next:** George runs VB-6 and VB-7 in separate new chats with the brief; pastes each report as a comment.

## 2026-10-09 (3) — Claude
**Decided (George):** Claude creates and organises Linear; Codex only updates its own issues (comment / Done).
**Changed:** Linear set up in team **VBerg (VB)**, separate from LiveSubtitles:
- Project **VBerg** (P-VB-2) with v1/v2 explanation; documents **Log** and **AI Roles**.
- Labels (team VBerg only): `VBerg v1`, `VBerg v2`, group `Owner` → Codex / Claude / Gemini / George. An earlier workspace-wide "Owner" label was retired and renamed "Owner (retired)".
- Issues: **VB-1** tag repo v1 + README (Codex) · **VB-2** one `split()` for sentences and words (Codex, blocked by VB-1) · **VB-3** share link (Codex, blocked by VB-1) · **VB-4** decide regroup rule (George).
- Skill `vberg-session` proposed and saved: reads the log, plans before acting, checks the 10 rules, ends with a log entry.
**Next:** George answers VB-4. Codex starts VB-1 with the Codex prompt. No Gemini task yet; add one when George picks the first research question.

## 2026-10-09 (2) — Claude
**Decided (George):**
- **Codex** writes code in GitHub. **Claude** keeps spec/log/Linear and reviews. **Gemini** = VBerg Lab: research and error-finding only, **read-only, no write access**, always a plan first and waits for OK.
- **No hallucination in study material:** only from George's own files, every point with file + page, quote don't paraphrase, "not in the material" when missing, second AI checks.
- Old repo stays as **VBerg v1** (tag `v1-prototype`); new design is **v2**.
**Changed:** new file `vberg-ai-roles.md` (roles, Gemini lab protocol, anti-hallucination rules).
**Next:** George creates Linear team "VBerg" (key VB); Claude then creates project + issues. Codex starts with the 3 tasks in the Codex prompt.

## 2026-10-09 — Claude
**Decided:**
- Moving a word/letter to another group = **moving the boundary**, not the word. Order and meaning never change. Only an edge item can move, and only to the neighbouring group (already in prototype as `tryMove`).
- Several AIs can work on VBerg only through a **shared place**; they cannot talk to each other directly.

**Open / proposed (not decided):**
- Add invariant: *"Manual regroup never changes order; it only moves boundaries."* Separate it in the UI from **reorder** (which changes meaning).
- Shared place: Google Drive for the spec (Gemini, ChatGPT, Claude can all reach it), Linear (or a simple tasks file) for tasks.
- Split of work: Gemini reads CY26 files and extracts threads/intersections as JSON; Claude does algorithm, code, and rule-checking.

**Next:** George decides on the shared place and whether to add the regroup invariant.

## 2026-10-08 — Claude
**Found:** the hill works as a **story arc** — rising (problem), peak (answer/core), descending (consequence). Seen in exam question 50 and in a presentation close. Saved in `vberg-threads.md` §8b.

## 2026-09-27 — Claude
**Found:** George's hill for the risk process (10 Swedish steps as 5 colour pairs) reads naturally as rise → peak → descent.
**Proposed:** first users = CY26 classmates; add a share-link to vberg.verv.cc; Swedish learners as a possible second audience.

## 2026-09-25 — Claude
**Decided:**
- Thread model: every thread is points, every point opened is a thread (file → paragraph → sentence → word → letter). Same algorithm at every level. 3–5 groups max.
- The database is the threads: `nodes`, `placements`, `links`. No coordinates stored.
- One idea stored once, placed on many threads. **An intersection is a link.** Peak of the hill = where threads cross.
- Links are a second thread; three kinds (structure = free, same-words = computer, meaning = person/AI).
**Found:** on vberg.verv.cc, sentences split by count only (`buildSplits`), which broke "identify analyze evaluate". Fix: one `split()` for all levels with a per-level cut cost.
**Files created:** `vberg-algorithm-database.md`, `vberg-threads.md`.
