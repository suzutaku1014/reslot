"use client";

import { Bell, CalendarDays, Database, ShieldCheck } from "lucide-react";
import { useCallback, useState } from "react";

type Role = "CUSTOMER" | "PROVIDER" | "ADMIN";
type Appointment = {
	id: string;
	startsAt: string;
	endsAt: string;
	status: string;
	version: number;
	customer: { displayName: string };
	provider: { displayName: string };
	service: { name: string };
};
type RescheduleRequest = {
	id: string;
	status: string;
	note: string | null;
	version: number;
	createdAt: string;
	appointment: { id: string; providerId: string; service: { name: string } };
	candidates: Array<{ id: string; startsAt: string; endsAt: string; status: string }>;
};
type CandidateDraft = { id: string; value: string };
type Snapshot = {
	role: Role;
	customers: Array<{ id: string; displayName: string }>;
	providers: Array<{ id: string; displayName: string }>;
	appointments: Appointment[];
	requests: RescheduleRequest[];
	notifications: Array<{
		id: string;
		title: string;
		body: string;
		readAt: string | null;
		createdAt: string;
	}>;
	outbox: Array<{
		id: string;
		eventType: string;
		status: string;
		attemptCount: number;
		lastErrorCode: string | null;
		createdAt: string;
	}>;
	auditEvents: Array<{
		id: string;
		actorRole: Role;
		action: string;
		resourceType: string;
		resourceId: string;
		requestId: string;
		createdAt: string;
	}>;
	_count: { requests: number; outbox: number; auditEvents: number };
};

const roles: Array<{ value: Role; label: string; description: string }> = [
	{ value: "CUSTOMER", label: "Customer", description: "Request a new time" },
	{ value: "PROVIDER", label: "Provider", description: "Review candidates" },
	{ value: "ADMIN", label: "Admin", description: "Inspect operations" },
];

async function readJson<T>(response: Response): Promise<T> {
	const body = await response.json();
	if (!response.ok) throw new Error(body.error?.message ?? "The request failed.");
	return body as T;
}

export function DemoApp() {
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedAppointment, setSelectedAppointment] = useState<string | null>(null);
	const [candidateTimes, setCandidateTimes] = useState<CandidateDraft[]>([
		{ id: "candidate-1", value: "" },
	]);
	const [note, setNote] = useState("");

	const refresh = useCallback(async () => {
		setSnapshot(
			await readJson<Snapshot>(await fetch("/api/demo", { cache: "no-store" })),
		);
	}, []);

	async function run(action: () => Promise<void>, fallback: string) {
		setBusy(true);
		setError(null);
		try {
			await action();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : fallback);
		} finally {
			setBusy(false);
		}
	}

	async function startDemo() {
		await run(async () => {
			await readJson(await fetch("/api/demo/sessions", { method: "POST" }));
			await refresh();
		}, "The demo could not start.");
	}

	async function changeRole(role: Role) {
		if (role === snapshot?.role) return;
		await run(async () => {
			await readJson(
				await fetch("/api/demo/role", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ role }),
				}),
			);
			await refresh();
		}, "The role could not change.");
	}

	async function submitRequest() {
		if (!selectedAppointment || candidateTimes.some((candidate) => !candidate.value))
			return;
		await run(async () => {
			await readJson(
				await fetch("/api/reschedule-requests", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Idempotency-Key": crypto.randomUUID(),
					},
					body: JSON.stringify({
						appointmentId: selectedAppointment,
						note: note || undefined,
						candidates: candidateTimes.map((candidate) => {
							const startsAt = new Date(candidate.value);
							return {
								startsAt: startsAt.toISOString(),
								endsAt: new Date(startsAt.getTime() + 3_600_000).toISOString(),
							};
						}),
					}),
				}),
			);
			setSelectedAppointment(null);
			setCandidateTimes([{ id: "candidate-1", value: "" }]);
			setNote("");
			await refresh();
		}, "The request could not be created.");
	}

	async function decide(
		requestId: string,
		expectedVersion: number,
		decision: "accept" | "reject",
		candidateId?: string,
	) {
		await run(async () => {
			await readJson(
				await fetch(`/api/reschedule-requests/${requestId}/decision`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Idempotency-Key": crypto.randomUUID(),
					},
					body: JSON.stringify({
						decision,
						expectedVersion,
						...(candidateId ? { candidateId } : {}),
					}),
				}),
			);
			await refresh();
		}, "The decision could not be saved.");
	}

	async function processNow() {
		await run(async () => {
			await readJson(await fetch("/api/admin/outbox/process", { method: "POST" }));
			await refresh();
		}, "The outbox could not be processed.");
	}

	async function retryEvent(outboxId: string) {
		await run(async () => {
			await readJson(
				await fetch(`/api/admin/outbox/${outboxId}/retry`, { method: "POST" }),
			);
			await refresh();
		}, "The event could not be retried.");
	}

	if (!snapshot) return <Landing busy={busy} error={error} startDemo={startDemo} />;

	return (
		<main className="app-shell">
			<header className="app-header">
				<div>
					<span className="wordmark">ReSlot</span>
					<span className="demo-badge">Fictional demo</span>
				</div>
				<a className="source-link" href="https://github.com/suzutaku1014/reslot">
					Source ↗
				</a>
			</header>
			<div className="app-layout">
				<aside className="role-panel" aria-label="Choose a persona">
					<p className="panel-label">View as</p>
					{roles.map((role) => (
						<button
							key={role.value}
							type="button"
							className={snapshot.role === role.value ? "role active" : "role"}
							onClick={() => changeRole(role.value)}
							disabled={busy}
						>
							<strong>{role.label}</strong>
							<span>{role.description}</span>
						</button>
					))}
					<p className="expiry-note">
						Workspace data is isolated and automatically expires after one hour.
					</p>
				</aside>
				<section className="workspace">
					<div className="workspace-heading">
						<div>
							<p className="eyebrow">
								{roles.find((role) => role.value === snapshot.role)?.label} workspace
							</p>
							<h1>
								{snapshot.role === "ADMIN"
									? "Operational overview"
									: snapshot.role === "PROVIDER"
										? "Change requests"
										: "Upcoming appointments"}
							</h1>
						</div>
						<span className="healthy">
							<i /> Demo active
						</span>
					</div>
					{error && (
						<p className="error-banner" role="alert">
							{error}
						</p>
					)}
					{snapshot.role === "ADMIN" ? (
						<AdminOperations
							snapshot={snapshot}
							busy={busy}
							processNow={processNow}
							retryEvent={retryEvent}
						/>
					) : snapshot.role === "PROVIDER" ? (
						<RequestInbox requests={snapshot.requests} busy={busy} decide={decide} />
					) : (
						<div className="appointment-list">
							{snapshot.appointments.map((appointment) => (
								<AppointmentCard
									key={appointment.id}
									appointment={appointment}
									onRequest={() => setSelectedAppointment(appointment.id)}
									hasPending={snapshot.requests.some(
										(request) =>
											request.appointment.id === appointment.id &&
											request.status === "PENDING",
									)}
								/>
							))}
							{selectedAppointment && (
								<RequestForm
									candidateTimes={candidateTimes}
									setCandidateTimes={setCandidateTimes}
									note={note}
									setNote={setNote}
									busy={busy}
									submit={submitRequest}
									cancel={() => setSelectedAppointment(null)}
								/>
							)}
						</div>
					)}
				</section>
			</div>
		</main>
	);
}

function Landing({
	busy,
	error,
	startDemo,
}: {
	busy: boolean;
	error: string | null;
	startDemo: () => void;
}) {
	return (
		<main className="landing-shell">
			<nav className="topbar">
				<a className="wordmark" href="/">
					ReSlot
				</a>
				<a className="source-link" href="https://github.com/suzutaku1014/reslot">
					GitHub ↗
				</a>
			</nav>
			<section className="hero">
				<p className="eyebrow">Open-source workflow reference</p>
				<h1>
					Rescheduling,
					<br />
					without the loose ends.
				</h1>
				<p className="lede">
					A small appointment change reveals the hard parts of software: permissions,
					concurrency, durable delivery, and operational visibility.
				</p>
				<div className="actions">
					<button type="button" onClick={startDemo} disabled={busy}>
						{busy ? "Preparing workspace…" : "Start fictional demo"}
					</button>
					<span>No sign-up · expires in 1 hour</span>
				</div>
				{error && (
					<p className="error-banner" role="alert">
						{error}
					</p>
				)}
			</section>
			<section className="trust-grid" aria-label="Engineering highlights">
				<article>
					<ShieldCheck aria-hidden="true" />
					<strong>Scoped by design</strong>
					<span>Opaque session, server-side role and workspace resolution.</span>
				</article>
				<article>
					<Database aria-hidden="true" />
					<strong>Atomic changes</strong>
					<span>Business state, audit, and outbox commit together.</span>
				</article>
				<article>
					<Bell aria-hidden="true" />
					<strong>Observable delivery</strong>
					<span>Notification failure is retryable, never invisible.</span>
				</article>
			</section>
		</main>
	);
}

function Metric({ label, value }: { label: string; value: number }) {
	return (
		<article className="metric">
			<span>{label}</span>
			<strong>{value}</strong>
		</article>
	);
}

function AdminOperations({
	snapshot,
	busy,
	processNow,
	retryEvent,
}: {
	snapshot: Snapshot;
	busy: boolean;
	processNow: () => void;
	retryEvent: (id: string) => void;
}) {
	return (
		<div className="operations">
			<div className="metrics">
				<Metric label="Reschedule requests" value={snapshot._count.requests} />
				<Metric label="Outbox events" value={snapshot._count.outbox} />
				<Metric label="Audit events" value={snapshot._count.auditEvents} />
			</div>
			<section className="ops-section">
				<div className="ops-heading">
					<div>
						<p className="eyebrow">Delivery</p>
						<h2>Notification outbox</h2>
					</div>
					<button
						className="primary-action"
						type="button"
						disabled={busy || snapshot.outbox.length === 0}
						onClick={processNow}
					>
						Process now
					</button>
				</div>
				{snapshot.outbox.length === 0 ? (
					<p className="muted-copy">No delivery events yet.</p>
				) : (
					<div className="ops-table">
						{snapshot.outbox.map((event) => (
							<div className="ops-row" key={event.id}>
								<span>{event.eventType}</span>
								<code>{event.status}</code>
								<small>
									{event.attemptCount} attempt{event.attemptCount === 1 ? "" : "s"}
								</small>
								{["FAILED", "DEAD_LETTER"].includes(event.status) && (
									<button
										className="text-action"
										type="button"
										onClick={() => retryEvent(event.id)}
									>
										Retry
									</button>
								)}
							</div>
						))}
					</div>
				)}
			</section>
			<section className="ops-section">
				<div className="ops-heading">
					<div>
						<p className="eyebrow">Immutable trail</p>
						<h2>Recent audit events</h2>
					</div>
				</div>
				<div className="ops-table">
					{snapshot.auditEvents.map((event) => (
						<div className="ops-row audit" key={event.id}>
							<span>{event.action}</span>
							<code>{event.actorRole}</code>
							<small>{event.requestId.slice(0, 8)}</small>
						</div>
					))}
				</div>
			</section>
		</div>
	);
}

function AppointmentCard({
	appointment,
	onRequest,
	hasPending,
}: {
	appointment: Appointment;
	onRequest: () => void;
	hasPending: boolean;
}) {
	const date = new Intl.DateTimeFormat("en", {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(appointment.startsAt));
	return (
		<article className="appointment-card">
			<div className="calendar-icon">
				<CalendarDays aria-hidden="true" />
			</div>
			<div className="appointment-copy">
				<p>{appointment.service.name}</p>
				<h2>{date}</h2>
				<span>with {appointment.provider.displayName}</span>
			</div>
			<button
				className="secondary-action"
				type="button"
				onClick={onRequest}
				disabled={hasPending}
			>
				{hasPending ? "Pending" : "Request change"}
			</button>
		</article>
	);
}

function RequestForm({
	candidateTimes,
	setCandidateTimes,
	note,
	setNote,
	busy,
	submit,
	cancel,
}: {
	candidateTimes: CandidateDraft[];
	setCandidateTimes: (values: CandidateDraft[]) => void;
	note: string;
	setNote: (value: string) => void;
	busy: boolean;
	submit: () => void;
	cancel: () => void;
}) {
	return (
		<section className="request-form" aria-label="Request a new appointment time">
			<div>
				<p className="eyebrow">New request</p>
				<h2>Offer up to three times</h2>
			</div>
			{candidateTimes.map((candidate, index) => (
				<label key={candidate.id}>
					Candidate {index + 1}
					<input
						type="datetime-local"
						value={candidate.value}
						onChange={(event) =>
							setCandidateTimes(
								candidateTimes.map((current, currentIndex) =>
									currentIndex === index
										? { ...current, value: event.target.value }
										: current,
								),
							)
						}
					/>
				</label>
			))}
			{candidateTimes.length < 3 && (
				<button
					className="text-action"
					type="button"
					onClick={() =>
						setCandidateTimes([
							...candidateTimes,
							{ id: `candidate-${candidateTimes.length + 1}`, value: "" },
						])
					}
				>
					+ Add another time
				</button>
			)}
			<label>
				Optional note
				<textarea
					maxLength={500}
					value={note}
					onChange={(event) => setNote(event.target.value)}
					placeholder="Add useful context, not personal information."
				/>
			</label>
			<div className="form-actions">
				<button className="secondary-action" type="button" onClick={cancel}>
					Cancel
				</button>
				<button
					className="primary-action"
					type="button"
					onClick={submit}
					disabled={busy || candidateTimes.some((candidate) => !candidate.value)}
				>
					Send request
				</button>
			</div>
		</section>
	);
}

function RequestInbox({
	requests,
	busy,
	decide,
}: {
	requests: RescheduleRequest[];
	busy: boolean;
	decide: (
		requestId: string,
		version: number,
		decision: "accept" | "reject",
		candidateId?: string,
	) => void;
}) {
	const pending = requests.filter((request) => request.status === "PENDING");
	if (pending.length === 0)
		return (
			<div className="empty-state">
				<Bell aria-hidden="true" />
				<h2>No requests waiting</h2>
				<p>Customer proposals will appear here.</p>
			</div>
		);
	return (
		<div className="request-list">
			{pending.map((request) => (
				<article className="request-card" key={request.id}>
					<div>
						<p className="eyebrow">Change requested</p>
						<h2>{request.appointment.service.name}</h2>
						{request.note && <p className="request-note">“{request.note}”</p>}
					</div>
					<div className="candidate-list">
						{request.candidates.map((candidate) => (
							<button
								type="button"
								disabled={busy}
								key={candidate.id}
								onClick={() =>
									decide(request.id, request.version, "accept", candidate.id)
								}
							>
								<span>
									{new Intl.DateTimeFormat("en", {
										weekday: "short",
										month: "short",
										day: "numeric",
									}).format(new Date(candidate.startsAt))}
								</span>
								<strong>
									{new Intl.DateTimeFormat("en", {
										hour: "numeric",
										minute: "2-digit",
									}).format(new Date(candidate.startsAt))}
								</strong>
								<em>Accept</em>
							</button>
						))}
					</div>
					<button
						className="text-action danger"
						type="button"
						disabled={busy}
						onClick={() => decide(request.id, request.version, "reject")}
					>
						Reject all candidates
					</button>
				</article>
			))}
		</div>
	);
}
