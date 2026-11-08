<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Background from '#lib/voter/ui/Background.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let disconnected = $state(false);
	let refreshing = false;

	onMount(() => {
		const timer = setInterval(() => {
			if (refreshing) return;
			refreshing = true;
			void invalidateAll().then(() => disconnected = false).catch(() => disconnected = true)
				.finally(() => refreshing = false);
		}, 10_000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head>
	<title>Individual Voter Leaderboard | Crowd Favorite</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<Background group="ballot" />
<main>
	<header>
		<div><p class="eyebrow">Crowd Favorite</p><h1>Individual Voter Leaderboard</h1><p>Most unique teams collected</p></div>
		<a href="/organizer">Organizer</a>
	</header>
	{#if data.leaders.length === 0}
		<p class="empty">No named voters have collected teams yet.</p>
	{:else}
		<table aria-label="Top collectors">
			<thead><tr><th class="rank">Rank</th><th>Name</th><th class="count">Teams</th></tr></thead>
			<tbody>{#each data.leaders as leader, i (i)}
				<tr><td class="rank">{leader.rank}</td><td>{leader.name}</td><td class="count">{leader.collected}</td></tr>
			{/each}</tbody>
		</table>
	{/if}
	<footer role="status">
		{#if disconnected}Connection lost. Retrying...{:else}Updates every 10 seconds. Last updated {new Date(data.updatedAt).toLocaleTimeString()}.{/if}
	</footer>
</main>

<style>
	main { position: relative; width: min(1200px, 100%); margin: 0 auto; padding: clamp(20px, 4vw, 48px); }
	header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 32px; }
	.eyebrow { text-transform: uppercase; letter-spacing: .12em; font-size: 12px; margin-bottom: 12px; }
	h1 { font-family: var(--font-display); font-size: clamp(24px, 3vw, 42px); margin-bottom: 12px; }
	header p:last-child, header a, footer { color: var(--muted); }
	header a { font-size: 12px; }
	table { width: 100%; border-collapse: collapse; background: var(--glass-strong); }
	th, td { padding: 14px 24px; text-align: left; border-bottom: 1px solid rgb(43 43 43 / .15); }
	th { font-size: 14px; color: var(--muted); font-weight: 400; }
	td { font-size: clamp(20px, 2.5vw, 32px); overflow-wrap: anywhere; }
	.rank { width: 100px; color: var(--muted); }
	.count { width: 140px; text-align: right; font-variant-numeric: tabular-nums; }
	footer { margin-top: 20px; font-size: 12px; }
	.empty { padding: 48px 24px; background: var(--glass-strong); font-size: 24px; }
	@media (max-width: 600px) { th, td { padding: 12px; } .rank, .count { width: 64px; } header { flex-direction: column; gap: 12px; } }
</style>
