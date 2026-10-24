<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ApiError, getBallot } from '#lib/voter/api.ts';
	import { clearVoterCode, getVoterCode } from '#lib/voter/identity.ts';
	import type { Ballot } from '#lib/voter/types.ts';
	import Button from '#lib/voter/ui/Button.svelte';
	import Icon from '#lib/voter/ui/Icon.svelte';
	import Screen from '#lib/voter/ui/Screen.svelte';

	// Voting closed (Figma screen 6). Every voter page sends people here once the
	// organizers' close time has passed. Only submitted ballots are counted.

	let ballot = $state<Ballot | null>(null);
	let error = $state(false);

	onMount(() => {
		if (getVoterCode() === null) {
			void goto('/', { replaceState: true });
		} else {
			void load();
		}
	});

	async function load(): Promise<void> {
		try {
			const loaded = await getBallot();
			if (!loaded.votingClosed) {
				await goto('/collection', { replaceState: true });
				return;
			}
			ballot = loaded;
		} catch (e) {
			if (e instanceof ApiError && e.code === 'unauthorized') {
				clearVoterCode();
				await goto('/?reason=invalid', { replaceState: true });
				return;
			}
			error = true;
		}
	}
</script>

<svelte:head>
	<title>Voting closed - Nova Crowd Favorite</title>
</svelte:head>

<Screen group="submission" step="Closed">
	<h1 class="title">Voting closed</h1>
	<p class="desc">Crowd favorite voting has ended. See you at closing ceremony!</p>

	{#if error}
		<p class="callout glass">Could not load your ballot. Refresh to try again.</p>
	{:else if ballot?.status === 'submitted'}
		<p class="callout glass">
			<Icon name="check" size={16} />
			Your ballot was counted.
		</p>
	{:else if ballot !== null}
		<p class="callout glass">
			<Icon name="alert" size={16} />
			You didn't submit a ballot, so it wasn't counted.
		</p>
	{/if}

	<div class="spacer"></div>
	<Button disabled>Voting closed</Button>
</Screen>

<style>
	.desc {
		font-size: 14px;
		line-height: 1.45;
	}
	.callout {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 16px;
		font-size: 13px;
		line-height: 1.45;
	}
	.spacer {
		flex: 1;
	}
</style>