<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import '#lib/voter/theme.css';
	import type { LayoutProps } from './$types';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { startSync } from '#lib/voter/api.ts';

	let { children }: LayoutProps = $props();
	onMount(startSync);
	afterNavigate(({ to }) => {
		navigator.serviceWorker?.controller?.postMessage(to?.url.pathname);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Fragment+Mono&family=Michroma&display=swap"
	/>
</svelte:head>

{@render children()}
