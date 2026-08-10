"use client";

import { Bell, CalendarDays, Database, ShieldCheck } from "lucide-react";
import { useCallback, useState } from "react";

type Role = "CUSTOMER" | "PROVIDER" | "ADMIN";
type Snapshot = {
	role: Role;
	customers: Array<{ id: string; displayName: string }>;
	providers: Array<{ id: string; displayName: string }>;
	appointments: Array<{
		id: string;
		startsAt: string;
		endsAt: string;
		status: string;
		version: number;
		customer: { displayName: string };
		provider: { displayName: string };
		service: { name: string };
	}>;
	notifications: Array<{
		id: string;
		title: string;
		body: string;
		readAt: string | null;
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

	const refresh = useCallback(async () => {
		setSnapshot(
			await readJson<Snapshot>(await fetch("/api/demo", { cache: "no-store" })),
		);
	}, []);

	async function startDemo() {
		setBusy(true);
		setError(null);
		try {
			await readJson(await fetch("/api/demo/sessions", { method: "POST" }));
			await refresh();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "The demo could not start.");
		} finally {
			setBusy(false);
		}
	}

	async function changeRole(role: Role) {
		if (role === snapshot?.role) return;
		setBusy(true);
		setError(null);
		try {
			await readJson(
				await fetch("/api/demo/role", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ role }),
				}),
			);
			await refresh();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "The role could not change.");
		} finally {
			setBusy(false);
		}
	}

	if (!snapshot) {
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
						<div className="metrics">
							<Metric label="Reschedule requests" value={snapshot._count.requests} />
							<Metric label="Outbox events" value={snapshot._count.outbox} />
							<Metric label="Audit events" value={snapshot._count.auditEvents} />
						</div>
					) : (
						<div className="appointment-list">
							{snapshot.appointments.map((appointment) => (
								<AppointmentCard
									key={appointment.id}
									appointment={appointment}
									role={snapshot.role}
								/>
							))}
						</div>
					)}
				</section>
			</div>
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

function AppointmentCard({
	appointment,
	role,
}: {
	appointment: Snapshot["appointments"][number];
	role: Role;
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
				<span>
					{role === "CUSTOMER"
						? `with ${appointment.provider.displayName}`
						: `for ${appointment.customer.displayName}`}
				</span>
			</div>
			<span className="status">{appointment.status.toLowerCase()}</span>
		</article>
	);
}
