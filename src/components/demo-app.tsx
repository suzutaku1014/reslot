"use client";

import {
	ArrowLeft,
	Bell,
	ChevronRight,
	CircleAlert,
	LoaderCircle,
	Menu,
	Trash2,
	X,
} from "lucide-react";
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
type CandidateDraft = { id: string; date: string; time: string };
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

const roles: Array<{ value: Role; label: string }> = [
	{ value: "CUSTOMER", label: "利用者" },
	{ value: "PROVIDER", label: "担当者" },
	{ value: "ADMIN", label: "管理者" },
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

const timeOptions = Array.from({ length: 25 }, (_, index) => {
	const minutes = 9 * 60 + index * 30;
	const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
	const remainder = String(minutes % 60).padStart(2, "0");
	return `${hours}:${remainder}`;
});

const emptyCandidate = (id = crypto.randomUUID()): CandidateDraft => ({
	id,
	date: "",
	time: "",
});

function dateInputValue(date: Date) {
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

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
		{ id: "candidate-1", date: "", time: "" },
	]);
	const [note, setNote] = useState("");
	const [menuOpen, setMenuOpen] = useState(false);

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
		setMenuOpen(false);
		await run(async () => {
			await readJson(
				await fetch("/api/demo/role", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ role }),
				}),
			);
			await refresh();
			closeRequest();
		}, "表示する役割を切り替えられませんでした。");
	}

	function closeRequest() {
		setSelectedAppointment(null);
		setCandidateTimes([{ id: "candidate-1", date: "", time: "" }]);
		setNote("");
		setError(null);
	}

	async function submitRequest() {
		if (
			!selectedAppointment ||
			candidateTimes.some((candidate) => !candidate.date || !candidate.time)
		)
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
							const startsAt = new Date(`${candidate.date}T${candidate.time}`);
							return {
								startsAt: startsAt.toISOString(),
								endsAt: new Date(startsAt.getTime() + 3_600_000).toISOString(),
							};
						}),
					}),
				}),
			);
			await refresh();
			closeRequest();
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

	if (!snapshot)
		return (
			<Landing
				busy={busy}
				error={error}
				startDemo={startDemo}
				dismissError={() => setError(null)}
			/>
		);

	const selectedAppointmentData = snapshot.appointments.find(
		(appointment) => appointment.id === selectedAppointment,
	);

	return (
		<main className="app-shell" aria-busy={busy}>
			<header className="app-header">
				<span className="wordmark">ReSlot</span>
				<button
					type="button"
					className="menu-toggle"
					onClick={() => setMenuOpen((open) => !open)}
					aria-label={menuOpen ? "メニューを閉じる" : "メニューを開く"}
					aria-expanded={menuOpen}
				>
					{menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
				</button>
			</header>
			<div className="app-layout">
				<aside
					className={menuOpen ? "role-panel open" : "role-panel"}
					aria-label="メニュー"
				>
					<div className="sidebar-brand">
						<span className="sidebar-mark">R</span>
						<strong>ReSlot</strong>
					</div>
					<nav className="role-navigation">
						{roles.map((role) => (
							<button
								key={role.value}
								type="button"
								className={snapshot.role === role.value ? "role active" : "role"}
								onClick={() => changeRole(role.value)}
								disabled={busy}
								aria-pressed={snapshot.role === role.value}
							>
								{role.label}
							</button>
						))}
					</nav>
					<a className="sidebar-source" href="https://github.com/suzutaku1014/reslot">
						GitHub
					</a>
				</aside>
				<section className="workspace">
					{selectedAppointmentData && snapshot.role === "CUSTOMER" ? (
						<RequestScreen
							appointment={selectedAppointmentData}
							candidateTimes={candidateTimes}
							setCandidateTimes={setCandidateTimes}
							note={note}
							setNote={setNote}
							busy={busy}
							error={error}
							dismissError={() => setError(null)}
							submit={submitRequest}
							cancel={closeRequest}
						/>
					) : (
						<>
							<div className="workspace-heading">
								<h1>
									{snapshot.role === "ADMIN"
										? "運用状況"
										: snapshot.role === "PROVIDER"
											? "日程変更の申請"
											: "今後の予約"}
								</h1>
							</div>
							{error && <ErrorBanner message={error} dismiss={() => setError(null)} />}
							{snapshot.role === "ADMIN" ? (
								<AdminOperations
									snapshot={snapshot}
									busy={busy}
									processNow={processNow}
									retryEvent={retryEvent}
								/>
							) : snapshot.role === "PROVIDER" ? (
								<RequestInbox
									requests={snapshot.requests}
									busy={busy}
									decide={decide}
								/>
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
								</div>
							)}
							{snapshot.role !== "ADMIN" && (
								<Notifications items={snapshot.notifications} />
							)}
						</>
					)}
				</section>
			</div>
			{busy && snapshot && <LoadingOverlay />}
		</main>
	);
}

function Landing({
	busy,
	error,
	startDemo,
	dismissError,
}: {
	busy: boolean;
	error: string | null;
	startDemo: () => void;
	dismissError: () => void;
}) {
	return (
		<main className="landing-shell">
			<header className="landing-header">
				<span className="sidebar-mark">R</span>
				<span className="wordmark">ReSlot</span>
			</header>
			<section className="landing-card">
				<h1>ReSlot</h1>
				{error && <ErrorBanner message={error} dismiss={dismissError} />}
				<button type="button" onClick={startDemo} disabled={busy}>
					{busy ? "準備しています…" : "デモをはじめる"}
				</button>
			</section>
		</main>
	);
}

function ErrorBanner({ message, dismiss }: { message: string; dismiss: () => void }) {
	return (
		<div className="error-banner" role="alert">
			<CircleAlert aria-hidden="true" />
			<p>{message}</p>
			<button type="button" onClick={dismiss} aria-label="エラーを閉じる">
				<X aria-hidden="true" />
			</button>
		</div>
	);
}

function LoadingOverlay() {
	return (
		<div className="loading-overlay" role="status" aria-live="polite">
			<div className="loading-card">
				<LoaderCircle className="spinner" aria-hidden="true" />
				<span>処理しています</span>
			</div>
		</div>
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
		<button
			className="appointment-card"
			type="button"
			onClick={onRequest}
			disabled={hasPending}
			aria-label={hasPending ? "確認待ち" : "日程を変更"}
		>
			<div className="appointment-copy">
				<p>
					{appointment.service.name === "Project consultation"
						? "プロジェクト相談"
						: appointment.service.name}
				</p>
				<h2>{date}</h2>
				<span>担当：{appointment.provider.displayName}</span>
			</div>
			{hasPending ? (
				<span className="pending-label">確認待ち</span>
			) : (
				<ChevronRight aria-hidden="true" />
			)}
		</button>
	);
}

function RequestScreen({
	appointment,
	candidateTimes,
	setCandidateTimes,
	note,
	setNote,
	busy,
	error,
	dismissError,
	submit,
	cancel,
}: {
	appointment: Appointment;
	candidateTimes: CandidateDraft[];
	setCandidateTimes: (values: CandidateDraft[]) => void;
	note: string;
	setNote: (value: string) => void;
	busy: boolean;
	error: string | null;
	dismissError: () => void;
	submit: () => void;
	cancel: () => void;
}) {
	const currentDate = new Intl.DateTimeFormat("ja-JP", {
		dateStyle: "long",
		timeStyle: "short",
	}).format(new Date(appointment.startsAt));

	return (
		<div className="request-screen">
			<button className="screen-back" type="button" onClick={cancel} disabled={busy}>
				<ArrowLeft aria-hidden="true" />
				予約一覧へ戻る
			</button>
			<div className="workspace-heading request-heading">
				<h1>日程変更を申請</h1>
			</div>
			{error && <ErrorBanner message={error} dismiss={dismissError} />}
			<section className="booking-summary" aria-labelledby="current-booking-heading">
				<p className="eyebrow">変更する予約</p>
				<h2 id="current-booking-heading">
					{appointment.service.name === "Project consultation"
						? "プロジェクト相談"
						: appointment.service.name}
				</h2>
				<dl>
					<div>
						<dt>現在の日時</dt>
						<dd>{currentDate}</dd>
					</div>
					<div>
						<dt>担当</dt>
						<dd>{appointment.provider.displayName}</dd>
					</div>
				</dl>
			</section>
			<RequestForm
				candidateTimes={candidateTimes}
				setCandidateTimes={setCandidateTimes}
				note={note}
				setNote={setNote}
				busy={busy}
				submit={submit}
				cancel={cancel}
			/>
		</div>
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
	const tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);
	const minimumDate = dateInputValue(tomorrow);
	const isIncomplete = candidateTimes.some(
		(candidate) => !candidate.date || !candidate.time,
	);

	return (
		<form
			className="request-form"
			aria-label="新しい予約日時を申請"
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<div>
				<p className="eyebrow">希望日時</p>
				<h2>候補日時を選択</h2>
				<p className="form-description">候補は3つまで選べます。予約時間は1時間です。</p>
			</div>
			{candidateTimes.map((candidate, index) => (
				<fieldset className="candidate-fieldset" key={candidate.id}>
					<legend>候補 {index + 1}</legend>
					{candidateTimes.length > 1 && (
						<button
							className="remove-candidate"
							type="button"
							onClick={() =>
								setCandidateTimes(
									candidateTimes.filter((current) => current.id !== candidate.id),
								)
							}
							aria-label={`候補 ${index + 1}を削除`}
						>
							<Trash2 aria-hidden="true" />
							削除
						</button>
					)}
					<div className="candidate-fields">
						<label>
							日付
							<input
								type="date"
								min={minimumDate}
								value={candidate.date}
								onChange={(event) =>
									setCandidateTimes(
										candidateTimes.map((current) =>
											current.id === candidate.id
												? { ...current, date: event.target.value }
												: current,
										),
									)
								}
								aria-label={`候補 ${index + 1}の日付`}
								required
							/>
						</label>
						<label>
							開始時刻
							<select
								value={candidate.time}
								onChange={(event) =>
									setCandidateTimes(
										candidateTimes.map((current) =>
											current.id === candidate.id
												? { ...current, time: event.target.value }
												: current,
										),
									)
								}
								aria-label={`候補 ${index + 1}の開始時刻`}
								required
							>
								<option value="">時刻を選択</option>
								{timeOptions.map((time) => (
									<option value={time} key={time}>
										{time}
									</option>
								))}
							</select>
						</label>
					</div>
				</fieldset>
			))}
			{candidateTimes.length < 3 && (
				<button
					className="text-action"
					type="button"
					onClick={() => setCandidateTimes([...candidateTimes, emptyCandidate()])}
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
					type="submit"
					disabled={busy || isIncomplete}
				>
					{busy ? (
						<>
							<LoaderCircle className="button-spinner" aria-hidden="true" />
							申請中…
						</>
					) : (
						"申請する"
					)}
				</button>
			</div>
		</form>
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
