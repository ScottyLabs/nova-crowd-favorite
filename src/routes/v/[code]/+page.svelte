<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { isValidCode, saveVoterCode } from '#lib/voter/identity.ts';
	import NeedLinkScreen from '#lib/voter/ui/NeedLinkScreen.svelte';

	// The personal voting link: /v/<code>.
	// Saves the code in this browser, then sends the voter to their ballot.
	// `replaceState` keeps the code out of the back button history.

	let problem = $state<'bad-link' | 'storage-blocked' | null>(null);

	onMount(() => {
		const code = page.params.code ?? '';
		if (!isValidCode(code)) {
			problem = 'bad-link';
			return;
		}
		if (!saveVoterCode(code)) {
			problem = 'storage-blocked';
			return;
		}
		void goto('/collection', { replaceState: true });
	});
</script>

<svelte:head>
	<title>Nova Crowd Favorite</title>
	<meta name="referrer" content="no-referrer" />
</svelte:head>

{#if problem === 'bad-link'}
	<NeedLinkScreen
		title="This link doesn't work"
		message="It may be cut off or out of date. Check that you opened the full link from your Nova email."
	/>
{:else if problem === 'storage-blocked'}
	<NeedLinkScreen
		title="Your browser blocked this page"
		message="Voting needs to save your link on this phone. Turn off private browsing, or open the link in Safari or Chrome."
	/>
{/if}