# The direction: one codebase, behaviour is data

Read this before the numbered files. They plan one feature; this says what the feature is in service
of.

## Where we are

Every client runs their own Hub, in their own repository, against their own database. The code
started as a copy of the one before it, so the Hubs are near-identical and drift a little further
apart with every fix that lands in one and not the others. The menu is the clearest case: each Hub
hand-writes its own navigation file, with the same groups in a slightly different order.

That is a fork, and a fork costs every future fix, once per client.

## Where we are going

The same shape the pipeline already reached: **one shared codebase, and what makes a client
different is data rather than code.**

- `@hub-kit/core` is the shared package: pages, components, the shell, the theme system. It never
  talks to a database, never holds a rendered string, never hard-codes a colour or a brand.
- This template is what a client's repository starts as. Over time it gets **thinner**, as more of it
  moves into the kit.
- What a client uses, and what their screens are called, is **a row in their own database**, read
  through one resolver, edited from the admin panel.

A new client should eventually be: a theme, a locale, a set of adapters, and a row per feature. No
new screens, no deleted screens, no edited navigation file.

## The three rules that follow

1. **Never delete a screen to suit one client.** Switch it off in their catalogue. A screen removed
   here is a fork; a screen switched off is a row.
2. **Never write a client's name in this repository.** Not in code, not in a comment, not in a
   migration. A client name in shared code is a fork waiting to happen.
3. **New behaviour ships off by default**, behind a switch, so an existing client's Hub cannot change
   under them when the template moves forward.

## What this repository is not

It is not the shared package. The template is **copied**; the kit is **installed and upgraded**. Code
that every Hub needs belongs in the kit, and the kit is fed by copying working code in from a Hub,
never by writing out of the kit into one.

## The order it happens in

The numbered files in this folder plan the first step: give the catalogue a tree and a switch, so a
client's Hub can be shaped without touching their code. The step after it, once every page carries a
key, is to drive the navigation itself from that catalogue, which is what finally removes the
hand-written menu from each Hub. That one is named at the end of `06-phases.md` and is not started.
