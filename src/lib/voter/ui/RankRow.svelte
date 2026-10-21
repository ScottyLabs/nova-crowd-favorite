<script lang="ts">
	import type { Team } from '../types.ts';
	import Icon from './Icon.svelte';

	// One team in the top 5 (Figma "RankRow"): orange rank badge, name, table and
	// description, and the six-dot grip on the right for dragging.
	// Tapping anywhere except the grip opens the team page.

	interface Props {
		rank: number;
		team: Team;
		hasNote: boolean;
		href: string;
	}

	let { rank, team, hasNote, href }: Props = $props();
</script>

<div class="row glass">
	<a class="main" {href}>
		<span class="badge" aria-label="Rank {rank}">{rank}</span>
		<span class="text">
			<span class="name">
				{team.name}
				{#if hasNote}
					<span class="note-mark"><Icon name="pencil" size={12} label="Has a note" /></span>
				{/if}
			</span>
			<span class="meta">Table {team.table} - {team.description}</span>
		</span>
	</a>
	<span class="grip" aria-hidden="true">
		<Icon name="grip" size={18} />
	</span>
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 64px;
		padding: 10px 4px 10px 12px;
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
		color: rgb(43 43 43 / 0.7);
	}
</style>