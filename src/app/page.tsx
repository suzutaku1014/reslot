const highlights = [
	"Three role-specific views",
	"Concurrency-safe decisions",
	"Durable notification outbox",
	"Public operational controls",
];

export default function HomePage() {
	return (
		<main>
			<section className="hero">
				<div className="eyebrow">Production-minded reference app</div>
				<h1>
					Change the time.
					<br />
					Keep the trust.
				</h1>
				<p className="lede">
					ReSlot turns appointment changes into an explicit, observable workflow for
					customers, providers, and operators.
				</p>
				<div className="actions">
					<button type="button" disabled>
						Demo is being prepared
					</button>
					<a href="https://github.com/suzutaku1014/reslot">View the source</a>
				</div>
			</section>
			<section className="highlights" aria-label="Technical highlights">
				{highlights.map((highlight) => (
					<article key={highlight}>{highlight}</article>
				))}
			</section>
		</main>
	);
}
