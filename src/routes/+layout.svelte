<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import '#lib/voter/theme.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Fragment+Mono&family=Michroma&display=swap"
	/>
	<meta name="theme-color" content="#d9dddf" />
</svelte:head>

{@render children()}