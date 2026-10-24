<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		ApiError,
		getBallot,
		getCollection,
		getMyTeam,
		putBallot,
		submitBallot
	} from '#lib/voter/api.ts';
	import { clearVoterCode, getVoterCode } from '#lib/voter/identity.ts';
	import { insertAtRank, MAX_RANKED, moveItem, unrank } from '#lib/voter/ranking.ts';
	import type { Ballot, CollectionItem, MyTeam } from '#lib/voter/types.ts';
	import Button from '#lib/voter/ui/Button.svelte';
	import EmptySlot from '#lib/voter/ui/EmptySlot.svelte';
	import LinkTeamBanner from '#lib/voter/ui/LinkTeamBanner.svelte';
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
	let myTeam = $state<MyTeam | null>(null);
	const showLinkBanner = $derived(myTeam !== null && myTeam.team !== null && !myTeam.linked);

	const byId = $derived(new Map(items.map((item) => [item.team.id, item])));
	const ranked = $derived((ballot?.ranked ?? []).filter((id) => byId.has(id)));
	// Teams just dragged out of the top 5 go to the top of the collection.
	let recentlyRemoved = $state<string[]>([]);
	const unranked = $derived(
		items
			.filter((item) => !ranked.includes(item.team.id))
			.toSorted((a, b) => removedOrder(a.team.id) - removedOrder(b.team.id))
	);
	const emptySlots = $derived(
		Array.from({ length: MAX_RANKED - ranked.length }, (_, i) => ranked.length + i + 1)
	);
	const full = $derived(ranked.length >= MAX_RANKED);

	function removedOrder(teamId: string): number {
		const i = recentlyRemoved.indexOf(teamId);
		return i === -1 ? recentlyRemoved.length : i;
	}

	// ---- Drag to reorder (by the grip dots) ----

	interface DragState {
		id: string;
		from: number;
		startY: number;
		startScroll: number;
		/** Latest finger position, used by the auto-scroll loop. */
		clientY: number;
		dy: number;
		/** Height of one row plus the gap, so we know how far one rank is. */
		pitch: number;
		/** Page position of the dragged row's middle when the drag started. */
		rowMiddle: number;
		/** Page position of the top of the Collection section. */
		collectionTop: number;
		pointerId: number;
	}

	const LIST_GAP = 8;
	// How close to the top or bottom of the screen the finger must be to scroll.
	const EDGE = 90;
	const SCROLL_STEP = 10;

	let drag = $state<DragState | null>(null);
	let collectionSection = $state<HTMLElement | null>(null);
	// Turns off the slide animation for one frame when a row is dropped,
	// so rows snap into their new places instead of sliding from the old ones.
	let settling = $state(false);
	let scrollFrame = 0;

	/** True when the dragged row is over the Collection section. */
	const removing = $derived(drag !== null && drag.rowMiddle + drag.dy > drag.collectionTop);
	/** Where the dragged row would land in the top 5 if it were dropped now. */
	const target = $derived(
		drag === null
			? -1
			: Math.min(Math.max(drag.from + Math.round(drag.dy / drag.pitch), 0), ranked.length - 1)
	);
	/** The order to show while dragging, so the rank numbers update live. */
	const previewOrder = $derived.by(() => {
		if (drag === null) return ranked;
		if (removing) return unrank(ranked, drag.id);
		return moveItem(ranked, drag.from, target);
	});

	function offsetFor(teamId: string, index: number): number {
		if (drag === null) return 0;
		if (teamId === drag.id) return drag.dy;
		const { from, pitch } = drag;
		if (removing) return index > from ? -pitch : 0;
		if (from < target && index > from && index <= target) return -pitch;
		if (from > target && index >= target && index < from) return pitch;
		return 0;
	}

	function startDrag(event: PointerEvent, teamId: string, index: number): void {
		if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return;
		const listItem = event.currentTarget.closest('li');
		if (listItem === null) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		confirming = false;
		const rowBox = listItem.getBoundingClientRect();
		const collectionBox = collectionSection?.getBoundingClientRect();
		drag = {
			id: teamId,
			from: index,
			startY: event.clientY,
			startScroll: window.scrollY,
			clientY: event.clientY,
			dy: 0,
			pitch: listItem.offsetHeight + LIST_GAP,
			rowMiddle: rowBox.top + rowBox.height / 2 + window.scrollY,
			collectionTop:
				collectionBox === undefined
					? Number.POSITIVE_INFINITY
					: collectionBox.top + window.scrollY,
			pointerId: event.pointerId
		};
		scrollFrame = requestAnimationFrame(autoScroll);
	}

	/** Lowest the row can go: a little way into the Collection section, no further. */
	function maxOffset(state: DragState): number {
		return state.collectionTop + state.pitch - state.rowMiddle;
	}

	/** Recompute how far the row has moved, counting any page scroll. */
	function updateOffset(): void {
		if (drag === null) return;
		const raw = drag.clientY - drag.startY + (window.scrollY - drag.startScroll);
		const min = -drag.from * drag.pitch;
		drag.dy = Math.min(Math.max(raw, min), maxOffset(drag));
	}

	/** While dragging, scroll the page if the finger is near the top or bottom edge. */
	function autoScroll(): void {
		if (drag === null) return;
		if (drag.clientY > window.innerHeight - EDGE && drag.dy < maxOffset(drag)) {
			window.scrollBy(0, SCROLL_STEP);
		} else if (drag.clientY < EDGE) {
			window.scrollBy(0, -SCROLL_STEP);
		}
		updateOffset();
		scrollFrame = requestAnimationFrame(autoScroll);
	}

	function moveDrag(event: PointerEvent): void {
		if (drag === null || event.pointerId !== drag.pointerId) return;
		drag.clientY = event.clientY;
		updateOffset();
	}

	function endDrag(event: PointerEvent): void {
		if (drag === null || event.pointerId !== drag.pointerId) return;
		cancelAnimationFrame(scrollFrame);
		const { from, id } = drag;
		const to = target;
		const remove = removing;
		settling = true;
		drag = null;
		if (remove) {
			recentlyRemoved = [id, ...recentlyRemoved.filter((other) => other !== id)];
			void saveRanking(unrank(ranked, id));
		} else if (to !== from) {
			void saveRanking(moveItem(ranked, from, to));
		}
		requestAnimationFrame(() => {
			settling = false;
		});
	}

	/** Arrow keys on a focused grip move that team up or down one rank. */
	function moveByKey(index: number, direction: -1 | 1): void {
		const to = index + direction;
		if (to < 0 || to >= ranked.length) return;
		confirming = false;
		void saveRanking(moveItem(ranked, index, to));
	}

	onMount(() => {
		if (getVoterCode() === null) {
			void goto('/', { replaceState: true });
			return;
		}
		void load();
		void loadMyTeam();
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
		} catch (e) {
			if (e instanceof ApiError && e.code === 'unauthorized') {
				clearVoterCode();
				await goto('/?reason=invalid', { replaceState: true });
				return;
			}
			error = 'Could not load your ballot. Check your connection and refresh.';
		} finally {
			loading = false;
		}
	}

	/** The banner is optional, so if this fails the page just doesn't show it. */
	async function loadMyTeam(): Promise<void> {
		try {
			myTeam = await getMyTeam();
		} catch {
			myTeam = null;
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

<Screen group="ballot" step="Collection" footerHidden={drag !== null}>
	<div class="header">
		<h1 class="title-md">Your top 5</h1>
		<span class="pill">Draft</span>
	</div>

	{#if showLinkBanner}
		<LinkTeamBanner />
	{/if}

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

		<ol class="list" class:settling>
			{#each ranked as teamId, i (teamId)}
				{@const item = byId.get(teamId)}
				{#if item !== undefined}
					<li>
						<RankRow
							rank={previewOrder.indexOf(teamId) + 1}
							team={item.team}
							href="/team/{teamId}"
							offset={offsetFor(teamId, i)}
							lifted={drag?.id === teamId}
							ongripdown={(event) => {
								startDrag(event, teamId, i);
							}}
							ongripmove={moveDrag}
							ongripup={endDrag}
							onmove={(direction) => {
								moveByKey(i, direction);
							}}
						/>
					</li>
				{/if}
			{/each}
			{#each emptySlots as rank (rank)}
				<li><EmptySlot {rank} /></li>
			{/each}
		</ol>

		<section
			class="collection"
			class:drop-ready={drag !== null}
			class:drop-active={removing}
			bind:this={collectionSection}
		>
			<h2 class="section">
				Collection ({unranked.length} more)
				{#if drag !== null}
					<span class="drop-hint" role="status">
						{removing ? 'Let go to move here' : 'Drop here to remove'}
					</span>
				{/if}
			</h2>
			<Button variant="secondary" href="/scan">Scan a team</Button>
			{#if unranked.length > 0}
				<ul class="list">
					{#each unranked as item (item.team.id)}
						<li>
							<TeamRow
								team={item.team}
								href="/team/{item.team.id}"
								canAdd={!full}
								onadd={() => {
									addToTop5(item.team.id);
								}}
							/>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="tiny">Every team you've scanned is in your top 5.</p>
			{/if}
		</section>
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
	.collection {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 0 -8px;
		padding: 8px;
		outline: 1.5px dashed transparent;
		transition:
			background 0.15s ease,
			outline-color 0.15s ease,
			box-shadow 0.15s ease;
	}
	.collection.drop-ready {
		background: rgb(255 255 255 / 0.18);
		outline-color: rgb(43 43 43 / 0.35);
	}
	.collection.drop-active {
		background: rgb(237 173 238 / 0.45);
		outline-color: var(--flare);
		box-shadow: 0 0 16px rgb(253 80 10 / 0.3);
	}
	.section {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		font-size: 16px;
	}
	.drop-hint {
		font-size: 12px;
		color: var(--muted);
	}
	.drop-active .drop-hint {
		color: var(--ink);
	}
	.settling :global(.row) {
		transition: none;
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