<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getVoterCode } from '#lib/voter/identity.ts';
	import NeedLinkScreen from '#lib/voter/ui/NeedLinkScreen.svelte';

	// Home page. Voters who already opened their link go straight to their ballot.
	// Everyone else sees "Open your voting link first" (Figma screen 0).

	let checked = $state(false);

	onMount(() => {
		if (getVoterCode() === null) {
			checked = true;
			return;
		}
		void goto('/collection', { replaceState: true });
	});
</script>

<svelte:head>
	<title>Nova Crowd Favorite</title>
</svelte:head>

{#if checked}
	<NeedLinkScreen
		title="Open your voting link first"
		message="Find the email from [organizers] and tap the link. Open it in your browser."
	/>
{/if}