<script lang="ts">
	import type { Snippet } from 'svelte';
	import Background, { type BackgroundGroup } from './Background.svelte';
	import TopBar from './TopBar.svelte';

	// Page frame every voter screen uses: group background, top bar, body,
	// and an optional footer that sticks to the bottom (like the Submit bar).

	interface Props {
		group: BackgroundGroup;
		step: string;
		children: Snippet;
		footer?: Snippet;
		/** Fade the footer out of the way (used while dragging a team). */
		footerHidden?: boolean;
	}

	let { group, step, children, footer, footerHidden = false }: Props = $props();
</script>

<Background {group} />

<div class="screen">
	<TopBar {step} />
	<main class="body">
		{@render children()}
	</main>
	{#if footer}
		<div class="footer" class:hidden={footerHidden}>
			{@render footer()}
		</div>
	{/if}
</div>

<style>
	.screen {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		width: min(100%, var(--app-width));
		min-height: 100dvh;
		margin: 0 auto;
	}
	.body {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--gap);
		padding: 8px var(--gutter) var(--gutter);
	}
	.footer {
		position: sticky;
		bottom: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px var(--gutter) calc(16px + env(safe-area-inset-bottom));
		background: rgb(255 255 255 / 0.45);
		-webkit-backdrop-filter: blur(20px);
		backdrop-filter: blur(20px);
		border-top: 1px solid var(--ink);
		transition: opacity 0.2s ease;
	}
	.footer.hidden {
		opacity: 0;
		pointer-events: none;
	}
</style>