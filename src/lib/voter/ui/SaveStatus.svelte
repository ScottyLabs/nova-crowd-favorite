<script lang="ts">
	import { syncPending, syncState } from '../api.ts';
</script>

{#if $syncState.pending > 0 || $syncState.offline}
	<div class="save-status" role="status">
		<p>
			{#if $syncState.error}Saved on this device. {$syncState.error}
			{:else if $syncState.saving}Syncing your changes...
			{:else if $syncState.pending > 0}Saved on this device. {$syncState.offline ? 'Waiting for a connection.' : 'Waiting to sync.'}
			{:else}Offline. Showing saved data.{/if}
		</p>
		{#if $syncState.pending > 0}<button type="button" disabled={$syncState.saving} onclick={() => void syncPending(true)}>Retry</button>{/if}
	</div>
{:else if $syncState.saved}
	<p class="saved" role="status">Saved</p>
{/if}

<style>
	.save-status { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: var(--paper); border: 1px solid var(--ink); font-size: 12px; }
	button { border: 0; background: transparent; text-decoration: underline; font: inherit; cursor: pointer; min-height: 32px; }
	.saved { color: var(--muted); font-size: 12px; }
</style>
