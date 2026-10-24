<script lang="ts">
	import type { Team } from '../types.ts';
	import Icon from './Icon.svelte';

	// One team in the top 5 (Figma "RankRow"): orange rank badge, name, table and
	// description, and the six-dot grip on the right for dragging.
	// Tapping anywhere except the grip opens the team page.
	// The parent page owns the drag logic; this row only reports grip events
	// and shows whatever offset and "lifted" state the parent gives it.

	interface Props {
		/** 1 to 5, or 0 while the row is being dragged out of the top 5. */
		rank: number;
		team: Team;
		hasNote: boolean;
		href: string;
		/** How far the row is moved up or down right now, in pixels. */
		offset?: number;
		/** True for the row being dragged (it floats above the others). */
		lifted?: boolean;
		ongripdown?: (event: PointerEvent) => void;
		ongripmove?: (event: PointerEvent) => void;
		ongripup?: (event: PointerEvent) => void;
		/** Keyboard reordering: -1 moves up one rank, 1 moves down one. */
		onmove?: (direction: -1 | 1) => void;
	}

	let {
		rank,
		team,
		hasNote,
		href,
		offset = 0,
		lifted = false,
		ongripdown,
		ongripmove,
		ongripup,
		onmove
	}: Props = $props();

	function onkeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			onmove?.(-1);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			onmove?.(1);
		}
	}
</script>

<div class="row glass" class:lifted style:transform="translateY({offset}px)">
	<a class="main" {href}>
		<span class="badge" class:out={rank === 0} aria-label={rank === 0 ? 'Leaving top 5' : `Rank ${rank}`}>
			{rank === 0 ? '-' : rank}
		</span>
		<span class="text">
			<span class="name">
				{team.name}
				{#if hasNote}
					<span class="note-mark"><Icon name="pencil" size={12} label="Has a note" /></span>
				{/if}
			</span>
			<span class="meta">{team.members}</span>
		</span>
	</a>
	<button
		class="grip"
		type="button"
		aria-label="Reorder {team.name}, rank {rank}. Use the up and down arrow keys."
		onpointerdown={ongripdown}
		onpointermove={ongripmove}
		onpointerup={ongripup}
		onpointercancel={ongripup}
		{onkeydown}
	>
		<Icon name="grip" size={18} />
	</button>
</div>

<style>
	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 64px;
		padding: 10px 4px 10px 12px;
		transition:
			transform 0.18s ease,
			box-shadow 0.18s ease;
	}
	.row.lifted {
		z-index: 2;
		transition: box-shadow 0.18s ease;
		box-shadow:
			0 14px 24px rgb(13 13 26 / 0.35),
			0 0 12px rgb(255 255 255 / 0.9);
	}
	.main {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 12px;
		min-width: 0;
		color: inherit;
		text-decoration: none;
	}
	.badge {
		display: grid;
		flex: none;
		place-items: center;
		width: 36px;
		height: 36px;
		background: var(--flare);
		color: var(--white);
		font-size: 16px;
	}
	.badge.out {
		background: rgb(255 255 255 / 0.5);
		color: var(--muted);
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.name,
	.meta {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.name {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 15px;
	}
	.note-mark {
		color: var(--muted);
	}
	.meta {
		font-size: 11px;
		color: var(--muted);
	}
	.grip {
		display: grid;
		flex: none;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0;
		background: none;
		border: none;
		color: rgb(43 43 43 / 0.7);
		cursor: grab;
		/* Dragging the grip moves the row instead of scrolling the page. */
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}
	.lifted .grip {
		cursor: grabbing;
	}
</style>