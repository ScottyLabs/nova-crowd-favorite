<script lang="ts">
	// An open spot in the top 5 (Figma "RankSlot/Empty").

	interface Props {
		rank: number;
	}

	let { rank }: Props = $props();
</script>

<div class="slot">
	<span class="badge">{rank}</span>
	<span class="text">Empty - tap "+ Top 5" on a team</span>
</div>

<style>
	.slot {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 64px;
		padding: 10px 12px;
		background: rgb(255 255 255 / 0.25);
		-webkit-backdrop-filter: var(--glass-blur);
		backdrop-filter: var(--glass-blur);
		border: 1px dashed rgb(43 43 43 / 0.45);
	}
	.badge {
		display: grid;
		flex: none;
		place-items: center;
		width: 36px;
		height: 36px;
		background: rgb(255 255 255 / 0.4);
		color: var(--muted);
		font-size: 16px;
	}
	.text {
		font-size: 12px;
		color: var(--muted);
	}
</style>