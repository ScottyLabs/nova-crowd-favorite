<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getVoterCode } from '#lib/voter/identity.ts';
	import NeedLinkScreen from '#lib/voter/ui/NeedLinkScreen.svelte';

	// Home page. Voters who already opened their link go straight to their ballot.
	// Everyone else sees "Open your voting link first" (Figma screen 0).

	let checked = $state(false);
	// Set when the server rejected this browser's code (old or wrong link).
	const invalid = $derived(page.url.searchParams.get('reason') === 'invalid');

	onMount(() => {
		if (invalid || getVoterCode() === null) {
			checked = true;
			return;
		}
		void goto('/collection', { replaceState: true });
	});
</script>

<svelte:head>
	<title>Nova Crowd Favorite</title>
</svelte:head>

{#if checked && invalid}
	<NeedLinkScreen
		title="This link doesn't work"
		message="It may be out of date. Open the newest voting link in your Nova email."
	/>
{:else if checked}
	<NeedLinkScreen
		title="Open your voting link first"
		message="Find the email from [organizers] and tap the link. Open it in your browser."
	/>
{/if}