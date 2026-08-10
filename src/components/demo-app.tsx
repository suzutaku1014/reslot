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
	{ value: "CUSTOMER", label: "利用者", description: "日程変更を申請" },
	{ value: "PROVIDER", label: "担当者", description: "候補日時を確認" },
	{ value: "ADMIN", label: "管理者", description: "運用状況を確認" },
];

const statusLabels: Record<string, string> = {
	SCHEDULED: "予約済み",
	PENDING: "確認待ち",
	ACCEPTED: "承認済み",
	REJECTED: "却下",
	DELIVERED: "配信済み",
	FAILED: "失敗",
	DEAD_LETTER: "要確認",
	PROCESSING: "処理中",
};

const eventLabels: Record<string, string> = {
	"reschedule.requested": "日程変更の申請",
	"reschedule.accepted": "日程変更の承認",
	"reschedule.rejected": "日程変更の却下",
	"demo.session_created": "デモセッション作成",
};

const notificationLabels: Record<string, string> = {
	"New change request": "新しい日程変更申請",
	"New time confirmed": "新しい日時が確定しました",
	"Change request declined": "日程変更は承認されませんでした",
	"A customer proposed new appointment times.": "利用者から候補日時が届きました。",
	"Your appointment has been moved to the selected time.":
		"予約を選択された日時へ変更しました。",
	"The provider could not accept the proposed times.":
		"担当者が候補日時を承認できませんでした。",
};

const errorLabels: Record<string, string> = {
	INTERNAL_ERROR: "サーバーで問題が発生しました。時間をおいてもう一度お試しください。",
	DEMO_CAPACITY_REACHED: "デモが混み合っています。1分ほど待ってからお試しください。",
	SESSION_REQUIRED: "デモを開始してください。",
	SESSION_EXPIRED: "デモの有効期限が切れました。もう一度開始してください。",
	APPOINTMENT_NOT_FOUND: "対象の予約が見つかりませんでした。",
	REQUEST_ALREADY_PENDING: "この予約には確認待ちの申請があります。",
	REQUEST_NOT_FOUND: "日程変更の申請が見つかりませんでした。",
	STALE_DECISION: "申請の状態が更新されています。画面を更新してお試しください。",
	INVALID_CANDIDATE: "この申請に含まれる候補日時を選択してください。",
	PROVIDER_CONFLICT: "その時間には別の予約が入っています。",
	OUTBOX_NOT_RETRYABLE: "この通知イベントは再試行できません。",
};

function translate(value: string, dictionary: Record<string, string>) {
	return dictionary[value] ?? value;
}

async function readJson<T>(response: Response): Promise<T> {
	const body = await response.json();
	if (!response.ok)
		throw new Error(
			errorLabels[body.error?.code] ??
				"処理に失敗しました。時間をおいてもう一度お試しください。",
		);
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
		}, "デモを開始できませんでした。");
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
		}, "表示する役割を切り替えられませんでした。");
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
		}, "日程変更を申請できませんでした。");
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
		}, "回答を保存できませんでした。");
	}

	async function processNow() {
		await run(async () => {
			await readJson(await fetch("/api/admin/outbox/process", { method: "POST" }));
			await refresh();
		}, "通知キューを処理できませんでした。");
	}

	async function retryEvent(outboxId: string) {
		await run(async () => {
			await readJson(
				await fetch(`/api/admin/outbox/${outboxId}/retry`, { method: "POST" }),
			);
			await refresh();
		}, "通知を再試行できませんでした。");
	}

	if (!snapshot) return <Landing busy={busy} error={error} startDemo={startDemo} />;

	return (
		<main className="app-shell">
			<header className="app-header">
				<div className="brand-lockup">
					<span className="wordmark">ReSlot</span>
					<span className="demo-badge">架空データのデモ</span>
				</div>
				<a className="source-link" href="https://github.com/suzutaku1014/reslot">
					GitHub
				</a>
			</header>
			<div className="app-layout">
				<aside className="role-panel" aria-label="表示する役割を選択">
					<div className="sidebar-brand">
						<span className="sidebar-mark">R</span>
						<div>
							<strong>ReSlot</strong>
							<small>日程変更ポータル</small>
						</div>
					</div>
					<p className="panel-label">表示する役割</p>
					{roles.map((role) => (
						<button
							key={role.value}
							type="button"
							className={snapshot.role === role.value ? "role active" : "role"}
							onClick={() => changeRole(role.value)}
							disabled={busy}
							aria-pressed={snapshot.role === role.value}
						>
							<strong>{role.label}</strong>
							<span>{role.description}</span>
						</button>
					))}
					<p className="expiry-note">
						このワークスペースは分離され、作成から1時間後に自動で削除されます。
					</p>
				</aside>
				<section className="workspace">
					<div className="workspace-heading">
						<div>
							<p className="eyebrow">
								{roles.find((role) => role.value === snapshot.role)?.label}画面
							</p>
							<h1>
								{snapshot.role === "ADMIN"
									? "運用状況"
									: snapshot.role === "PROVIDER"
										? "日程変更の申請"
										: "今後の予約"}
							</h1>
						</div>
						<span className="healthy">
							<i /> デモ実行中
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
					{snapshot.role !== "ADMIN" && (
						<Notifications items={snapshot.notifications} />
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
				<a className="landing-brand" href="/">
					<span className="sidebar-mark">R</span>
					<span className="wordmark">ReSlot</span>
				</a>
				<a className="source-link" href="https://github.com/suzutaku1014/reslot">
					GitHubで見る ↗
				</a>
			</nav>
			<section className="hero">
				<div className="hero-copy">
					<p className="eyebrow">オープンソースの業務アプリ実装例</p>
					<h1>
						日程変更を、
						<br />
						確実に。
					</h1>
					<p className="lede">
						申請、承認、通知、監査まで。小さな日程変更に必要な業務フローを、
						ひとつのWebアプリで体験できます。
					</p>
					<div className="actions">
						<button type="button" onClick={startDemo} disabled={busy}>
							{busy ? "準備しています…" : "デモをはじめる"}
						</button>
						<span>登録不要・データは1時間で自動削除</span>
					</div>
					{error && (
						<p className="error-banner" role="alert">
							{error}
						</p>
					)}
				</div>
				<div className="hero-preview" aria-hidden="true">
					<div className="preview-top">
						<span />
						<span />
						<span />
					</div>
					<div className="preview-layout">
						<div className="preview-sidebar">
							<b />
							<b />
							<b />
						</div>
						<div className="preview-content">
							<i />
							<strong />
							<p />
							<p />
						</div>
					</div>
				</div>
			</section>
			<section className="trust-grid" aria-label="技術的な特長">
				<article>
					<ShieldCheck aria-hidden="true" />
					<strong>安全な権限分離</strong>
					<span>セッション、役割、データ範囲をサーバー側で検証します。</span>
				</article>
				<article>
					<Database aria-hidden="true" />
					<strong>一貫したデータ更新</strong>
					<span>予約、監査ログ、通知キューをひとつの処理で確定します。</span>
				</article>
				<article>
					<Bell aria-hidden="true" />
					<strong>追跡できる通知</strong>
					<span>通知の成功・失敗を記録し、安全に再試行できます。</span>
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

function Notifications({ items }: { items: Snapshot["notifications"] }) {
	return (
		<section className="notification-panel" aria-labelledby="notifications-heading">
			<div className="ops-heading">
				<div>
					<p className="eyebrow">アプリ内通知</p>
					<h2 id="notifications-heading">お知らせ</h2>
				</div>
			</div>
			{items.length === 0 ? (
				<p className="muted-copy">お知らせはまだありません。</p>
			) : (
				items.map((item) => (
					<article className="notification" key={item.id}>
						<Bell aria-hidden="true" />
						<div>
							<strong>{translate(item.title, notificationLabels)}</strong>
							<p>{translate(item.body, notificationLabels)}</p>
						</div>
					</article>
				))
			)}
		</section>
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
				<Metric label="日程変更申請" value={snapshot._count.requests} />
				<Metric label="通知イベント" value={snapshot._count.outbox} />
				<Metric label="監査イベント" value={snapshot._count.auditEvents} />
			</div>
			<section className="ops-section">
				<div className="ops-heading">
					<div>
						<p className="eyebrow">通知配信</p>
						<h2>通知キュー</h2>
					</div>
					<button
						className="primary-action"
						type="button"
						disabled={busy || snapshot.outbox.length === 0}
						onClick={processNow}
					>
						今すぐ処理
					</button>
				</div>
				{snapshot.outbox.length === 0 ? (
					<p className="muted-copy">通知イベントはまだありません。</p>
				) : (
					<div className="ops-table">
						{snapshot.outbox.map((event) => (
							<div className="ops-row" key={event.id}>
								<span>{translate(event.eventType, eventLabels)}</span>
								<code>{translate(event.status, statusLabels)}</code>
								<small>{event.attemptCount}回実行</small>
								{["FAILED", "DEAD_LETTER"].includes(event.status) && (
									<button
										className="text-action"
										type="button"
										onClick={() => retryEvent(event.id)}
									>
										再試行
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
						<p className="eyebrow">変更履歴</p>
						<h2>最近の監査イベント</h2>
					</div>
				</div>
				<div className="ops-table">
					{snapshot.auditEvents.map((event) => (
						<div className="ops-row audit" key={event.id}>
							<span>{translate(event.action, eventLabels)}</span>
							<code>{roles.find((role) => role.value === event.actorRole)?.label}</code>
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
	const date = new Intl.DateTimeFormat("ja-JP", {
		weekday: "short",
		month: "long",
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
				<p>
					{appointment.service.name === "Project consultation"
						? "プロジェクト相談"
						: appointment.service.name}
				</p>
				<h2>{date}</h2>
				<span>担当：{appointment.provider.displayName}</span>
			</div>
			<button
				className="secondary-action"
				type="button"
				onClick={onRequest}
				disabled={hasPending}
			>
				{hasPending ? "確認待ち" : "日程を変更"}
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
		<section className="request-form" aria-label="新しい予約日時を申請">
			<div>
				<p className="eyebrow">日程変更申請</p>
				<h2>候補日時を入力してください</h2>
				<p className="form-description">
					候補は3つまで追加できます。各候補は1時間枠で登録されます。
				</p>
			</div>
			{candidateTimes.map((candidate, index) => (
				<label key={candidate.id}>
					候補 {index + 1}
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
					＋ 候補を追加
				</button>
			)}
			<label>
				メモ（任意）
				<textarea
					maxLength={500}
					value={note}
					onChange={(event) => setNote(event.target.value)}
					placeholder="担当者へ伝えたいことを入力してください（個人情報は入力しないでください）"
				/>
			</label>
			<div className="form-actions">
				<button className="secondary-action" type="button" onClick={cancel}>
					キャンセル
				</button>
				<button
					className="primary-action"
					type="button"
					onClick={submit}
					disabled={busy || candidateTimes.some((candidate) => !candidate.value)}
				>
					申請する
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
				<h2>確認待ちの申請はありません</h2>
				<p>利用者から候補日時が届くと、ここに表示されます。</p>
			</div>
		);
	return (
		<div className="request-list">
			{pending.map((request) => (
				<article className="request-card" key={request.id}>
					<div>
						<p className="eyebrow">日程変更の申請</p>
						<h2>
							{request.appointment.service.name === "Project consultation"
								? "プロジェクト相談"
								: request.appointment.service.name}
						</h2>
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
									{new Intl.DateTimeFormat("ja-JP", {
										weekday: "short",
										month: "long",
										day: "numeric",
									}).format(new Date(candidate.startsAt))}
								</span>
								<strong>
									{new Intl.DateTimeFormat("ja-JP", {
										hour: "numeric",
										minute: "2-digit",
									}).format(new Date(candidate.startsAt))}
								</strong>
								<em>この日時で承認</em>
							</button>
						))}
					</div>
					<button
						className="text-action danger"
						type="button"
						disabled={busy}
						onClick={() => decide(request.id, request.version, "reject")}
					>
						すべての候補を却下
					</button>
				</article>
			))}
		</div>
	);
}
