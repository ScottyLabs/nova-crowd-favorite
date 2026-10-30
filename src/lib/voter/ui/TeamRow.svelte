<script lang="ts">
	import type { Team } from '../types.ts';
	import NoteLink from './NoteLink.svelte';

	// A collected team that is not in the top 5 (Figma "TeamRow").
	// Tapping the row opens the team page; the chip adds it to the top 5.

	interface Props {
		team: Team;
		note: string;
		href: string;
		canAdd: boolean;
		onadd: () => void;
	}

	let { team, note, href, canAdd, onadd }: Props = $props();
</script>

<div class="row glass">
	<div class="main">
		<a class="team-link" {href}>
			<span class="name">{team.name}</span>
			<span class="meta">{team.members}</span>
		</a>
		<NoteLink {href} {note} teamName={team.name} />
	</div>
	<button class="chip" type="button" disabled={!canAdd} onclick={onadd}>
		{canAdd ? '+ Top 5' : 'Top 5 full'}
	</button>
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 64px;
		padding: 10px 12px;
		border-color: var(--mist);
	}
	.main {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.team-link {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		color: inherit;
		text-decoration: none;
	}
	.name,
	.meta {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.name {
		font-size: 15px;
	}
	.meta {
		font-size: 11px;
		color: var(--muted);
	}
	.chip {
		flex: none;
		min-height: 40px;
		padding: 10px 12px;
		background: var(--orchid);
		border: 1px solid var(--ink);
		font-size: 12px;
		cursor: pointer;
	}
	.chip:disabled {
		background: rgb(255 255 255 / 0.4);
		color: var(--muted);
		border-color: rgb(43 43 43 / 0.3);
		cursor: not-allowed;
	}
</style>
