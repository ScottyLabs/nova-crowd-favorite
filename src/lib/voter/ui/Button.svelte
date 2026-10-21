<script lang="ts">
	import type { Snippet } from 'svelte';

	// Full-width button from the Figma "Button" component.
	// Pass `href` to make it a link instead of a button.

	interface Props {
		variant?: 'primary' | 'secondary';
		href?: string;
		type?: 'button' | 'submit';
		disabled?: boolean;
		onclick?: () => void;
		children: Snippet;
	}

	let {
		variant = 'primary',
		href,
		type = 'button',
		disabled = false,
		onclick,
		children
	}: Props = $props();
</script>

{#if href !== undefined && !disabled}
	<a class="button {variant}" {href}>{@render children()}</a>
{:else}
	<button class="button {variant}" {type} {disabled} {onclick}>{@render children()}</button>
{/if}

<style>
	.button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		min-height: 52px;
		padding: 16px 20px;
		font-size: 15px;
		text-decoration: none;
		border-radius: 0;
		cursor: pointer;
		transition:
			transform 0.1s ease,
			opacity 0.15s ease;
	}
	.button:active:not(:disabled) {
		transform: translateY(1px);
	}
	.primary {
		background: var(--ink);
		color: var(--white);
		border: 1px solid rgb(255 255 255 / 0.5);
	}
	.secondary {
		background: rgb(217 221 223 / 0.85);
		-webkit-backdrop-filter: blur(12px);
		backdrop-filter: blur(12px);
		color: var(--ink);
		border: 1.5px solid var(--ink);
	}
	.button:disabled {
		background: rgb(217 221 223 / 0.75);
		color: rgb(43 43 43 / 0.45);
		border: 1px solid rgb(43 43 43 / 0.3);
		cursor: not-allowed;
	}
</style>