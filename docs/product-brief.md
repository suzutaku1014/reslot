# Product brief

## Problem

Rescheduling an appointment is a small workflow with deceptively difficult
boundaries: two people see different actions, proposed times can become stale,
concurrent decisions can double-book a provider, and a successful database
update can be followed by failed notification delivery.

## v1 workflow

1. A customer opens one of their scheduled appointments.
2. They submit one to three future candidate intervals and an optional note.
3. The assigned provider accepts one candidate or rejects the request.
4. Acceptance atomically updates the appointment, resolves the request,
   dismisses other candidates, enqueues notifications, and records audit events.
5. Customer and provider see the new appointment and in-app notification.
6. An admin can inspect audit and delivery state but cannot rewrite history.

## Acceptance criteria

- Customer, provider, and admin personas expose distinct authorized views.
- A user cannot read or mutate another demo workspace by guessing identifiers.
- A request can be resolved only once; stale and concurrent decisions return a
  conflict without partial mutation.
- A provider cannot be booked into overlapping active appointments.
- Notification failure never rolls back an already committed reschedule and is
  visible for retry.
- The complete flow is covered by a browser test and real-PostgreSQL concurrency
  tests.
- The public demo accepts fictional data only and expires after one hour.

## Explicitly out of scope

Persistent accounts, organization invitations, payments, email, SMS, Slack,
LINE, file uploads, arbitrary URLs, arbitrary webhooks, calendar sync, and AI
generation are not part of v1.
