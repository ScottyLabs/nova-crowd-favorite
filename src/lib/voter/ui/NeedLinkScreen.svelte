<script lang="ts">
	import Screen from './Screen.svelte';

	// Shown when this browser has no voting code (Figma screen 0),
	// or when the link someone opened is broken.

	interface Props {
		title: string;
		message: string;
	}

	let { title, message }: Props = $props();
</script>

<Screen group="intro" step="Crowd Favorite">
	<img class="vertical-logo" src="/nova-logo.png" alt="" aria-hidden="true" />

	<h1 class="title">{title}</h1>

	<p class="card glass instructions">{message}</p>

	<div class="spacer"></div>

	<p class="card glass help">Can't find it? Ask an organizer at the help table for a new link.</p>
</Screen>

<style>
	.vertical-logo {
		position: absolute;
		z-index: -1;
		top: 58%;
		left: calc(100% - 66px);
		width: 380px;
		height: auto;
		transform: translate(-50%, -50%) rotate(-90deg);
		filter: drop-shadow(0 0 12px rgb(255 255 255 / 0.85));
		pointer-events: none;
	}
	.card {
		padding: 16px;
		font-size: 15px;
		line-height: 1.5;
	}
	.instructions {
		background: var(--glass-strong);
	}
	.help {
		font-size: 13px;
		background: var(--glass-strong);
	}
	.spacer {
		flex: 1;
	}
</style>