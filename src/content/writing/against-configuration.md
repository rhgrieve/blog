---
title: "Against configuration"
date: 2026-02-18
summary: "Every config option is a decision you're pushing onto the user. Most of the time, you should just decide."
tags: ["design", "tools"]
---

There's a common instinct when building software: make it configurable. Let the user decide. Add a toggle, a dropdown, a settings page. It feels generous. It feels like you're giving people power.

But most of the time, it's avoidance. You're not empowering the user — you're refusing to make a decision yourself.

## The cost of a checkbox

Every option you expose has a cost. Someone has to discover it, understand it, decide on it, and live with the consequences. Multiply that by every user, and a single checkbox becomes thousands of hours of cognitive overhead.

The best software I've used makes choices on my behalf. Not all of them are perfect. But the confidence of a clear default is almost always better than the anxiety of an open question.

## When configuration is earned

There are cases where configuration is right: when the domain genuinely varies between users, when the stakes of a wrong default are high, or when the user is a professional who needs control.

But those cases are rarer than we think. Most config screens exist because someone on the team couldn't commit to a direction.

## The discipline

The harder path is to research, decide, and ship a default. To accept that some people won't like it. To be willing to be wrong in a specific way rather than vaguely right.

That's what opinionated software means. Not stubbornness — decisiveness.
