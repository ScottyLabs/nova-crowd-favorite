<script lang="ts">
	// Transparent bar with the glowing NOVA logo (left) and the current step (right).
	// The logo links home, so voters can always get back to their ballot.

	interface Props {
		step: string;
		home?: string;
	}

	let { step, home = '/' }: Props = $props();
</script>

<header class="top-bar">
	<a class="logo" href={home} aria-label="Nova Crowd Favorite home">
		<img src="/nova-logo.png" alt="" width="90" height="25" />
	</a>
	<span class="step">{step}</span>
</header>

<style>
	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 20px;
		min-height: 56px;
	}
	.logo {
		display: block;
		line-height: 0;
	}
	.logo img {
		width: 90px;
		height: auto;
		filter: drop-shadow(0 1px 6px rgb(26 20 51 / 0.45)) drop-shadow(0 0 4px rgb(255 255 255 / 0.6));
	}
	.step {
		font-size: 11px;
		color: var(--ink);
	}
</style>