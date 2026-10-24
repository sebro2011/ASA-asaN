# The official brief, verified

Checked on 2026-10-24 against the live challenge site.

## 1. Your URL was wrong — the real one works

| Supplied | Result |
|---|---|
| `spaceappschallenge.org/2026/challenges/be-an-earth-system-trend-detective/` | **404 — Page Not Found** |
| `spaceappschallenge.org/2026/challenges/earth-system-trend-detective/` | **Live** |

Recorded because a dead link in a submission or a README is a bad first
impression; use the second form.

## 2. The challenge text, verbatim

> Change is always occurring in the Earth's interconnected environmental system,
> and when it runs in a consistent direction – rising or falling, increasing or
> decreasing, thickening or thinning – measured variables reflect it. But a
> measured Earth science data variable can trend one way in one region and the
> opposite way in another, even when the same process drives both. The multitude
> of Earth science data variables makes it difficult to select variables that
> could indicate change, and to then perform an analysis on the selected
> variables. Your challenge is to create a tool that can select variables
> measured by Earth science missions or produced by Earth science models,
> visualize how they change over time, and determine what is changing, where it
> is changing, how much it is changing, and if these changes are what scientists
> call "significant."
>
> — *Be An Earth System Trend Detective!*, 2026 NASA Space Apps Challenge

**Difficulty:** Advanced. **Subjects:** Earth Science, Software.

Retrieved verbatim from
`https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/`
on 2026-10-24; the page carries this text and nothing else in its Details tab —
no dataset list, no rubric, no starter code.

## 3. Reading the brief precisely

Four requirements, in the brief's own words:

1. **select variables** measured by missions **or produced by models**;
2. **visualize** how they change over time;
3. **determine what is changing, where, and how much**;
4. **determine whether the changes are significant** — the brief puts
   "significant" in scare quotes deliberately; it means the statistical sense
   scientists use, not "large".

Three things the brief does **not** require, which your longer working
specification does: no stated minimum number of variables, no mandated data
product, no named statistical test. That freedom is real and it cuts both ways:
the judges can compare your method against competent practice, and nothing in
the text protects an unjustified test choice.

Two things it does imply strongly:

- **"measured variables" is broader than model output** — the brief distinguishes
  mission measurements from model products, which means the interface must say
  which one the user is looking at. A POWER reanalysis variable is a model
  product; presenting it as a satellite measurement would misread the brief.
- **"one region and the opposite way in another"** is the motivating example.
  A tool that can only show one location at a time demonstrates the premise
  without testing it. Spatial comparison is therefore not a bonus feature; it is
  the brief's own scenario.

## 4. Event facts that shape the plan

From the official 2026 event page:

- Hackathon: **14–15 November 2026**.
- Project submission **opens Saturday 14 November, 09:00** and **closes Sunday
  15 November, 23:59 local time**.
- Teams: maximum six participants.
- Theme: *The Next Frontier*.

Consequence: the buildable window is roughly 39 hours, of which maybe 20 are
productive. Anything not specified before 14 November will not survive contact
with the clock. That is why `03` and `04` are written to signature level.

## 5. The Resources tab is empty

> *Resources coming soon.*

There is no official dataset list, no starter repository, no judging rubric
published on the challenge page as of 24 October 2026. Two implications:

1. The variable catalogue in `04` is built on **NASA POWER**, because POWER is
   already integrated, keyless, documented, and covers 1981→present for the
   atmospheric variables this challenge needs. That is a defensible default, not
   a verdict.
2. **Re-check the Resources tab on the morning of 14 November.** If NASA
   publishes a sanctioned dataset list, reconciling the catalogue is a two-hour
   task then; discovering it on 15 November is fatal.

## 6. Rules on pre-existing work

The challenge page itself carries no rule about when work may begin. Space Apps
governance expects projects to be produced during the event and expects prior
work to be disclosed. This repository substantially predates the event.

The position taken in this preparation package: the app is **prior work**,
disclosed as such, and the challenge-specific contribution — statistical engine,
comparison workspace, evidence findings, spatial trend view, research
interface — is written inside 14–15 November. Keep the commit history; it is the
evidence that the distinction is honest.
