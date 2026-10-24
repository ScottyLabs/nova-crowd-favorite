<script lang="ts">
	import Button from './Button.svelte';

	// "Your team isn't linked to a QR code yet" banner (Figma screens 1a and 3).
	// Only shown to voters on a team whose team has no sticker linked yet.
</script>

<div class="banner">
	<p>Your team isn't linked to a QR code yet.</p>
	<Button variant="secondary" href="/scan?mode=team">Scan my team</Button>
</div>

<style>
	.banner {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px 16px;
		background: var(--ink);
		border: 1.5px solid var(--flare);
		box-shadow: 0 0 12px rgb(253 80 10 / 0.6);
		color: var(--white);
		font-size: 13px;
		line-height: 1.45;
	}
</style>