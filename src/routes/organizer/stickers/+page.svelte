<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>
<svelte:head><title>QR stickers</title><meta name="robots" content="noindex, nofollow" /></svelte:head>
<header><a href="/organizer">Back to organizer</a><button onclick={() => window.print()}>Print / save as PDF</button><p>One sticker per page. Sticker numbers do not need to match voter links.</p></header>
{#each data.stickers as sticker}<section><h1>Sticker {sticker.number}</h1><img src={sticker.image} alt={`QR code for sticker ${sticker.number}`} /><small>{sticker.code}</small></section>{/each}
<style>
	header { padding: 24px; } button { margin-left: 24px; padding: 12px; font: inherit; cursor: pointer; }
	section { background: white; padding: 24px; margin: 24px auto; max-width: 600px; text-align: center; break-after: page; }
	img { width: 100%; max-width: 500px; display: block; margin: auto; } small { overflow-wrap: anywhere; }
	@media print { :global(body) { background: white; } header { display: none; } section { margin: 0; padding: 1cm; max-width: none; } section:last-child { break-after: auto; } }
</style>
