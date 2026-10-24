<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ApiError, getBallot, getCollectionItem, putBallot, updateNote } from '#lib/voter/api.ts';
	import { clearVoterCode, getVoterCode } from '#lib/voter/identity.ts';
	import { insertAtRank, MAX_RANKED, rankOf, unrank } from '#lib/voter/ranking.ts';
	import type { Ballot, CollectionItem } from '#lib/voter/types.ts';
	import Button from '#lib/voter/ui/Button.svelte';
	import Icon from '#lib/voter/ui/Icon.svelte';
	import Screen from '#lib/voter/ui/Screen.svelte';

	// Team detail + notes (Figma screen 4).

	const NOTE_LIMIT = 500;
	// Save the note this long after the voter stops typing.
	const SAVE_DELAY_MS = 1000;

	const teamId = $derived(page.params.id ?? '');

	let item = $state<CollectionItem | null>(null);
	let ballot = $state<Ballot | null>(null);
	let loading = $state(true);
	let notFound = $state(false);
	let rankError = $state<string | null>(null);
	let bumped = $state(false);

	let note = $state('');
	let lastSaved = '';
	let noteStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	const ranked = $derived(ballot?.ranked ?? []);
	const currentRank = $derived(rankOf(ranked, teamId));
	/** Highest rank this team can take: one past the end if it is not ranked yet. */
	const highestAllowed = $derived(
		Math.min(currentRank === null ? ranked.length + 1 : ranked.length, MAX_RANKED)
	);

	onMount(() => {
		document.addEventListener('visibilitychange', onHide);
		if (getVoterCode() === null) {
			void goto('/', { replaceState: true });
		} else {
			void load();
		}
		return () => {
			document.removeEventListener('visibilitychange', onHide);
			clearTimeout(saveTimer);
		};
	});

	/** Save right away if the voter switches apps or locks the phone. */
	function onHide(): void {
		if (document.visibilityState === 'hidden') void saveNote();
	}

	async function load(): Promise<void> {
		try {
			const [loadedItem, loadedBallot] = await Promise.all([
				getCollectionItem(teamId),
				getBallot()
			]);
			if (loadedBallot.status === 'submitted') {
				await goto('/submitted', { replaceState: true });
				return;
			}
			item = loadedItem;
			ballot = loadedBallot;
			note = loadedItem.note;
			lastSaved = loadedItem.note;
		} catch (e) {
			if (e instanceof ApiError && e.code === 'unauthorized') {
				clearVoterCode();
				await goto('/?reason=invalid', { replaceState: true });
				return;
			}
			notFound = true;
		} finally {
			loading = false;
		}
	}

	// ---- Rank picker ----

	async function pickRank(rank: number | null): Promise<void> {
		if (ballot === null) return;
		const previous = ballot.ranked;
		let next: string[];
		bumped = false;
		if (rank === null) {
			next = unrank(previous, teamId);
		} else {
			const change = insertAtRank(previous, teamId, rank);
			next = change.ranked;
			bumped = change.bumped !== null;
		}
		ballot = { ...ballot, ranked: next };
		rankError = null;
		try {
			ballot = await putBallot(next);
		} catch {
			ballot = { ...ballot, ranked: previous };
			bumped = false;
			rankError = 'Could not save your ranking. Try again.';
		}
	}

	// ---- Notes autosave ----

	function onNoteInput(): void {
		noteStatus = 'idle';
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void saveNote(), SAVE_DELAY_MS);
	}

	async function saveNote(): Promise<void> {
		clearTimeout(saveTimer);
		if (item === null || note === lastSaved) return;
		const sending = note;
		noteStatus = 'saving';
		try {
			await updateNote(teamId, sending);
			lastSaved = sending;
			// If they kept typing while this saved, the next save is already queued.
			noteStatus = note === sending ? 'saved' : 'idle';
		} catch {
			noteStatus = 'error';
		}
	}

	/** Save the note first, then go back to the collection. */
	async function leave(): Promise<void> {
		await saveNote();
		await goto('/collection');
	}
</script>

<svelte:head>
	<title>{item?.team.name ?? 'Team'} - Nova Crowd Favorite</title>
</svelte:head>

<Screen group="rating" step="Team">
	<a
		class="back"
		href="/collection"
		onclick={(event) => {
			event.preventDefault();
			void leave();
		}}
	>
		<Icon name="chevron-left" />
		Collection
	</a>

	{#if loading}
		<p class="small">Loading...</p>
	{:else if notFound || item === null}
		<h1 class="title-md">Team not found</h1>
		<p class="card glass">This team isn't in your collection. Scan its QR code to add it.</p>
	{:else}
		<div class="intro">
			<h1 class="title-md">{item.team.name}</h1>
			<p class="meta">{item.team.members}</p>
		</div>

		<section class="block">
			<h2 class="label" id="rank-label">Rank in your top 5</h2>
			<div class="picker" role="group" aria-labelledby="rank-label">
				<button
					type="button"
					class="pick"
					class:selected={currentRank === null}
					aria-pressed={currentRank === null}
					aria-label="Not in my top 5"
					onclick={() => void pickRank(null)}
				>
					-
				</button>
				{#each Array.from({ length: MAX_RANKED }, (_, i) => i + 1) as rank (rank)}
					<button
						type="button"
						class="pick"
						class:selected={currentRank === rank}
						aria-pressed={currentRank === rank}
						disabled={rank > highestAllowed}
						onclick={() => void pickRank(rank)}
					>
						{rank}
					</button>
				{/each}
			</div>
			<p class="tiny">Picking a taken spot inserts this team there and moves the others down.</p>
			{#if bumped}
				<p class="notice" role="status">Your old #5 moved back to your collection.</p>
			{/if}
			{#if rankError !== null}
				<p class="error" role="alert">{rankError}</p>
			{/if}
		</section>

		<section class="block">
			<label class="label" for="note">Your notes (only you see these)</label>
			<textarea
				id="note"
				class="note glass"
				rows="7"
				maxlength={NOTE_LIMIT}
				placeholder="What stood out? What do you want to remember?"
				bind:value={note}
				oninput={onNoteInput}
				onblur={() => void saveNote()}
			></textarea>
			<div class="note-footer">
				<p class="status" class:error-text={noteStatus === 'error'} role="status">
					{#if noteStatus === 'saving'}
						Saving...
					{:else if noteStatus === 'saved'}
						<Icon name="check" size={14} /> Saved
					{:else if noteStatus === 'error'}
						<Icon name="alert" size={14} /> Couldn't save.
						<button type="button" class="retry" onclick={() => void saveNote()}>Retry</button>
					{/if}
				</p>
				<p class="tiny">{note.length}/{NOTE_LIMIT}</p>
			</div>
		</section>
	{/if}

	{#snippet footer()}
		<Button onclick={() => void leave()}>Done</Button>
	{/snippet}
</Screen>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		align-self: flex-start;
		min-height: 44px;
		color: var(--white);
		font-size: 13px;
		text-decoration: none;
		text-shadow: 0 1px 8px rgb(31 31 77 / 0.35);
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.meta {
		font-size: 13px;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.label {
		font-size: 12px;
	}
	.picker {
		display: flex;
		gap: 8px;
	}
	.pick {
		width: 44px;
		height: 44px;
		background: var(--white);
		border: 1px solid var(--ink);
		font-size: 15px;
		cursor: pointer;
	}
	.pick.selected {
		background: var(--flare);
		color: var(--white);
	}
	.pick:disabled {
		background: rgb(255 255 255 / 0.35);
		color: var(--muted);
		border-color: rgb(43 43 43 / 0.25);
		cursor: not-allowed;
	}
	.note {
		width: 100%;
		min-height: 180px;
		padding: 14px;
		background: rgb(255 255 255 / 0.75);
		font: inherit;
		font-size: 15px;
		line-height: 1.5;
		letter-spacing: inherit;
		color: var(--ink);
		resize: vertical;
	}
	.note-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 20px;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--muted);
	}
	.error-text {
		color: var(--flare);
	}
	.retry {
		padding: 0;
		background: none;
		border: none;
		color: var(--ink);
		font-size: 12px;
		text-decoration: underline;
		cursor: pointer;
	}
	.notice {
		padding: 10px 12px;
		background: var(--glass-strong);
		border: 1px solid var(--ink);
		font-size: 12px;
	}
	.card {
		padding: 16px;
	}
	.error {
		padding: 12px 14px;
		background: var(--ink);
		color: var(--white);
		border: 1px solid var(--flare);
		font-size: 13px;
	}
</style>