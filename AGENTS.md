# VBerg — Agent Instructions

## Required workflow

- read the Linear documents Log, AI Roles and Spec (project VBerg) first; they are the source of truth
- Branch from test, PR into test, never push to main. Only George merges. main = live site.
- plan before any change, wait for OK
- one commit per task
- post a proposed Log entry on the task's Linear issue at the end; Claude adds it to the Linear Log

## 10. Rules that must never be broken

1. No coordinate in the data.
2. Layout never reorders.
3. Nothing above the measurement boundary reads a font metric.
4. No randomness in order or grouping. The memorisation site's hill shape may vary a little (Spec §13.5); programs used for navigation use a fixed seed for stable places.
5. Only commands write data.
6. Aggregates cover contiguous ranges.
7. Anchors never move for labels.
8. Inferred structure is never shown as certain.
9. The user configures how a **type** is shown, never where an **instance** sits.
10. A derived place being memorable is a hypothesis until E1 says otherwise.

## 1. Roles

| AI | Role | May write? |
|---|---|---|
| **Codex** | Writes code in the GitHub repo, **and applies all fixes** | Yes — code only, one commit per task, never the spec. May comment on / close its own Linear issues. |
| **Claude** | Keeps the spec, the log and Linear; **reviews code**, finds problems, and **writes the exact fix** as a comment on the Linear issue. Does not edit code. | Spec/log/Linear only, after George approves |
| **Gemini** | **VBerg Lab + error-finding agent**: research, analysis, hunts for bugs and contradictions at any time and reports them | **No. Read-only.** |

**Fix loop:** Codex writes → Claude reviews and writes the fix as a Linear comment → Codex applies it. Only one AI ever writes code. Gemini may report errors at any point; it never fixes them.
| **ChatGPT** | Second opinion when needed | No |

Rule: **the AI that produced something never reviews it.** Codex code → Claude reviews. Gemini research → Claude checks sources. Claude spec change → Gemini looks for errors.
