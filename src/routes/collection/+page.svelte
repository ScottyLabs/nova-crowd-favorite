<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getBallot, getCollection, putBallot, submitBallot } from '#lib/voter/api.ts';
	import { getVoterCode } from '#lib/voter/identity.ts';
	import { insertAtRank, MAX_RANKED } from '#lib/voter/ranking.ts';
	import type { Ballot, CollectionItem } from '#lib/voter/types.ts';
	import Button from '#lib/voter/ui/Button.svelte';
	import EmptySlot from '#lib/voter/ui/EmptySlot.svelte';
	import Icon from '#lib/voter/ui/Icon.svelte';
	import RankRow from '#lib/voter/ui/RankRow.svelte';
	import Screen from '#lib/voter/ui/Screen.svelte';
	import TeamRow from '#lib/voter/ui/TeamRow.svelte';

	// Collection + top 5 (Figma screens 1a and 3).

	let items = $state<CollectionItem[]>([]);
	let ballot = $state<Ballot | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let confirming = $state(false);
	let submitting = $state(false);

	const byId = $derived(new Map(items.map((item) => [item.team.id, item])));
	const ranked = $derived((ballot?.ranked ?? []).filter((id) => byId.has(id)));
	const unranked = $derived(items.filter((item) => !ranked.includes(item.team.id)));
	const emptySlots = $derived(
		Array.from({ length: MAX_RANKED - ranked.length }, (_, i) => ranked.length + i + 1)
	);
	const full = $derived(ranked.length >= MAX_RANKED);

	onMount(() => {
		if (getVoterCode() === null) {
			void goto('/', { replaceState: true });
			return;
		}
		void load();
	});

	async function load(): Promise<void> {
		try {
			const [loadedItems, loadedBallot] = await Promise.all([getCollection(), getBallot()]);
			if (loadedBallot.status === 'submitted') {
				await goto('/submitted', { replaceState: true });
				return;
			}
			items = loadedItems;
			ballot = loadedBallot;
		} catch {
			error = 'Could not load your ballot. Check your connection and refresh.';
		} finally {
			loading = false;
		}
	}

	/** Show the new order right away, then save. Put it back if saving fails. */
	async function saveRanking(next: string[]): Promise<void> {
		if (ballot === null) return;
		const previous = ballot.ranked;
		ballot = { ...ballot, ranked: next };
		error = null;
		try {
			ballot = await putBallot(next);
		} catch {
			ballot = { ...ballot, ranked: previous };
			error = 'Could not save your ranking. Try again.';
		}
	}

	function addToTop5(teamId: string): void {
		if (full) return;
		confirming = false;
		void saveRanking(insertAtRank(ranked, teamId, ranked.length + 1).ranked);
	}

	async function submit(): Promise<void> {
		// First tap asks for confirmation, because a submitted ballot can't be changed.
		if (!confirming) {
			confirming = true;
			return;
		}
		submitting = true;
		error = null;
		try {
			await submitBallot();
			await goto('/submitted', { replaceState: true });
		} catch {
			error = 'Could not submit your ballot. Try again.';
			confirming = false;
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Your top 5 - Nova Crowd Favorite</title>
</svelte:head>

<Screen group="ballot" step="Collection">
	<div class="header">
		<h1 class="title-md">Your top 5</h1>
		<span class="pill">Draft</span>
	</div>

	{#if loading}
		<p class="small">Loading your ballot...</p>
	{:else if items.length === 0}
		<div class="empty glass">
			<Icon name="scan" size={40} />
			<h2 class="heading">No teams yet</h2>
			<p class="small">
				Walk the expo and scan each team's QR code. Teams you scan show up here, ready to rank.
			</p>
			<Button href="/scan">Scan a team</Button>
		</div>
	{:else}
		<p class="small">Drag a team by its dots to reorder. Saves when you let go.</p>

		<ol class="list">
			{#each ranked as teamId, i (teamId)}
				{@const item = byId.get(teamId)}
				{#if item !== undefined}
					<li>
						<RankRow
							rank={i + 1}
							team={item.team}
							hasNote={item.note.length > 0}
							href="/team/{teamId}"
						/>
					</li>
				{/if}
			{/each}
			{#each emptySlots as rank (rank)}
				<li><EmptySlot {rank} /></li>
			{/each}
		</ol>

		{#if unranked.length > 0}
			<h2 class="section">Collection ({unranked.length} more)</h2>
			<ul class="list">
				{#each unranked as item (item.team.id)}
					<li>
						<TeamRow
							team={item.team}
							hasNote={item.note.length > 0}
							href="/team/{item.team.id}"
							canAdd={!full}
							onadd={() => {
								addToTop5(item.team.id);
							}}
						/>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#if error !== null}
		<p class="error" role="alert">{error}</p>
	{/if}

	{#snippet footer()}
		<Button disabled={ranked.length === 0 || submitting} onclick={() => void submit()}>
			{#if submitting}
				Submitting...
			{:else if confirming}
				Tap again to submit - this is final
			{:else}
				Submit ballot ({ranked.length}/{MAX_RANKED} ranked)
			{/if}
		</Button>
		<p class="tiny">
			{confirming
				? "You won't be able to change your ballot after this."
				: 'You can re-rank until you submit.'}
		</p>
	{/snippet}
</Screen>

<style>
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.pill {
		padding: 4px 10px;
		background: var(--orchid);
		border: 1px solid var(--ink);
		font-size: 11px;
		text-transform: uppercase;
		box-shadow: 0 0 6px rgb(255 255 255 / 0.6);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.section {
		margin-top: 8px;
		font-size: 16px;
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 28px 20px;
		text-align: center;
	}
	.error {
		padding: 12px 14px;
		background: var(--ink);
		color: var(--white);
		border: 1px solid var(--flare);
		font-size: 13px;
	}
</style>