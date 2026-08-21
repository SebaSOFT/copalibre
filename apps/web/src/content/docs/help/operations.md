---
title: Operation and traceability
description: Rules for operating matches and correcting tournament data.
---

## Match console

Record events and the clock from an authorized console. The public projection updates from durable
events and keeps a version for recovery. Every action writes ahead to a local queue before it's
sent, so a dropped connection queues it for automatic retry instead of losing it — see
[Live match console](/help/control/match-console/) for the full behavior.

## Corrections

Never overwrite a calculated result. A correction requires a reason, an actor, and an impact preview
before it affects standings or downstream stages.

## Roster

A roster represents a participant's selected players for one match. It does not represent a
persistent relationship between a person and a team.
